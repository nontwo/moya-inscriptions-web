import { asciiEquals, fourCc, u32be } from "./byte-reader.js";
import { MediaParseError } from "./errors.js";
import {
  ISOBMFF_LIMITS,
  parseHeifMeta,
  readHeifItem,
  readTopLevelBox,
  readTopLevelBoxes,
} from "./isobmff.js";
import { listJpegSegments } from "./jpeg.js";
import { sniffSignature } from "./signature.js";

import type { ByteReader } from "./byte-reader.js";

/** Google Motion Photo 1.0 namespaces (matched by URI, never by prefix). */
export const MOTION_PHOTO_NAMESPACES = {
  container: "http://ns.google.com/photos/1.0/container/",
  item: "http://ns.google.com/photos/1.0/container/item/",
} as const;

/** Documented bounds for XMP and container directory parsing. */
export const MOTION_PHOTO_LIMITS = {
  maxXmpBytes: 1024 * 1024,
  maxXmlEvents: 20_000,
  maxAttributes: 64,
  maxDirectoryItems: 16,
  maxExtendedChunks: 64,
  maxDecimalDigits: 15,
} as const;

const MAIN_XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";
const EXTENDED_XMP_HEADER = "http://ns.adobe.com/xmp/extension/\0";
const utf8 = new TextDecoder("utf-8", { fatal: true });

const decodeUtf8 = (bytes: Uint8Array): string => {
  if (bytes.byteLength > MOTION_PHOTO_LIMITS.maxXmpBytes) {
    throw new MediaParseError("limit_exceeded");
  }
  try {
    return utf8.decode(bytes);
  } catch {
    throw new MediaParseError("structure_invalid");
  }
};

interface ExtendedXmp {
  readonly total: number;
  readonly buffer: Uint8Array;
  /** `[offset, end)` of each accepted chunk. */
  readonly chunks: [number, number][];
}

/** True when the chunk ranges tile `[0, total)` without gaps. */
const coversWholePacket = (entry: ExtendedXmp): boolean => {
  let covered = 0;
  for (const [start, end] of [...entry.chunks].sort((a, b) => a[0] - b[0])) {
    if (start > covered) return false;
    covered = Math.max(covered, end);
  }
  return covered === entry.total;
};

/**
 * Main and fully reassembled Extended XMP packets from JPEG APP1 segments.
 * An Extended XMP chunk may repeat an earlier chunk byte for byte; any other
 * overlap is malformed, and duplicates never count towards coverage.
 */
export function readJpegXmpPackets(head: Uint8Array): string[] {
  const packets: string[] = [];
  const extended = new Map<string, ExtendedXmp>();
  for (const segment of listJpegSegments(head)) {
    if (segment.marker !== 0xe1) continue;
    if (asciiEquals(head, segment.dataStart, MAIN_XMP_HEADER)) {
      packets.push(
        decodeUtf8(
          head.subarray(
            segment.dataStart + MAIN_XMP_HEADER.length,
            segment.dataEnd,
          ),
        ),
      );
    } else if (asciiEquals(head, segment.dataStart, EXTENDED_XMP_HEADER)) {
      const start = segment.dataStart + EXTENDED_XMP_HEADER.length;
      if (start + 40 > segment.dataEnd) throw new MediaParseError("truncated");
      const guid = String.fromCharCode(...head.subarray(start, start + 32));
      const total = u32be(head, start + 32);
      const offset = u32be(head, start + 36);
      const data = head.subarray(start + 40, segment.dataEnd);
      if (
        total > MOTION_PHOTO_LIMITS.maxXmpBytes ||
        offset + data.byteLength > total
      ) {
        throw new MediaParseError("limit_exceeded");
      }
      let entry = extended.get(guid);
      if (!entry) {
        if (extended.size >= 4) throw new MediaParseError("limit_exceeded");
        entry = { total, buffer: new Uint8Array(total), chunks: [] };
        extended.set(guid, entry);
      }
      if (
        entry.total !== total ||
        entry.chunks.length >= MOTION_PHOTO_LIMITS.maxExtendedChunks
      ) {
        throw new MediaParseError("structure_invalid");
      }
      const end = offset + data.byteLength;
      const duplicate = entry.chunks.some(
        ([start, stop]) => start === offset && stop === end,
      );
      if (duplicate) {
        const previous = entry.buffer.subarray(offset, end);
        if (!previous.every((byte, index) => byte === data[index])) {
          throw new MediaParseError("structure_invalid");
        }
        continue;
      }
      if (entry.chunks.some(([start, stop]) => offset < stop && start < end)) {
        throw new MediaParseError("structure_invalid");
      }
      entry.buffer.set(data, offset);
      entry.chunks.push([offset, end]);
    }
  }
  for (const entry of extended.values()) {
    if (coversWholePacket(entry)) packets.push(decodeUtf8(entry.buffer));
  }
  return packets;
}

/** XMP items (`mime` items of type application/rdf+xml) of a HEIF file. */
export async function readHeifXmpPackets(
  reader: ByteReader,
): Promise<string[]> {
  const meta = await readTopLevelBox(
    reader,
    "meta",
    ISOBMFF_LIMITS.maxMetaBoxBytes,
  );
  if (!meta) throw new MediaParseError("structure_invalid");
  const parsed = parseHeifMeta(meta.bytes);
  const packets: string[] = [];
  for (const item of parsed.items) {
    if (item.type !== "mime" || item.contentType !== "application/rdf+xml") {
      continue;
    }
    packets.push(
      decodeUtf8(
        await readHeifItem(
          reader,
          meta.bytes,
          parsed,
          item.id,
          MOTION_PHOTO_LIMITS.maxXmpBytes,
        ),
      ),
    );
  }
  return packets;
}

interface XmlElement {
  readonly kind: "open" | "close" | "text";
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
  readonly selfClosing: boolean;
  readonly text: string;
}

const NAME = /[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?/y;
const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

const decodeEntities = (value: string) =>
  value.replace(
    /&(amp|lt|gt|quot|apos);/g,
    (_, name: string) => ENTITIES[name]!,
  );

const readName = (text: string, offset: number): string => {
  NAME.lastIndex = offset;
  const match = NAME.exec(text);
  if (!match) throw new MediaParseError("structure_invalid");
  return match[0];
};

/** Minimal bounded XML tokenizer: no DTDs, no entity expansion. */
const tokenizeXml = (text: string): XmlElement[] => {
  if (text.length > MOTION_PHOTO_LIMITS.maxXmpBytes) {
    throw new MediaParseError("limit_exceeded");
  }
  const events: XmlElement[] = [];
  const push = (event: XmlElement) => {
    if (events.length >= MOTION_PHOTO_LIMITS.maxXmlEvents) {
      throw new MediaParseError("limit_exceeded");
    }
    events.push(event);
  };
  const textEvent = (value: string) =>
    push({
      kind: "text",
      name: "",
      attributes: new Map(),
      selfClosing: false,
      text: decodeEntities(value),
    });
  const skipTo = (marker: string, from: number) => {
    const end = text.indexOf(marker, from);
    if (end === -1) throw new MediaParseError("structure_invalid");
    return end;
  };
  let cursor = 0;
  while (cursor < text.length) {
    const open = text.indexOf("<", cursor);
    if (open === -1) {
      textEvent(text.slice(cursor));
      break;
    }
    if (open > cursor) textEvent(text.slice(cursor, open));
    if (text.startsWith("<!--", open)) {
      cursor = skipTo("-->", open + 4) + 3;
      continue;
    }
    if (text.startsWith("<![CDATA[", open)) {
      const end = skipTo("]]>", open + 9);
      push({
        kind: "text",
        name: "",
        attributes: new Map(),
        selfClosing: false,
        text: text.slice(open + 9, end),
      });
      cursor = end + 3;
      continue;
    }
    if (text.startsWith("<?", open)) {
      cursor = skipTo("?>", open + 2) + 2;
      continue;
    }
    if (text.startsWith("<!", open))
      throw new MediaParseError("structure_invalid");
    let index = open + 1;
    const closing = text[index] === "/";
    if (closing) index += 1;
    const name = readName(text, index);
    index += name.length;
    const attributes = new Map<string, string>();
    let selfClosing = false;
    for (;;) {
      while (/\s/.test(text[index] ?? "")) index += 1;
      if (index >= text.length) throw new MediaParseError("structure_invalid");
      if (text[index] === ">") {
        index += 1;
        break;
      }
      if (text.startsWith("/>", index) && !closing) {
        selfClosing = true;
        index += 2;
        break;
      }
      if (closing || attributes.size >= MOTION_PHOTO_LIMITS.maxAttributes) {
        throw new MediaParseError("structure_invalid");
      }
      const attribute = readName(text, index);
      index += attribute.length;
      while (/\s/.test(text[index] ?? "")) index += 1;
      if (text[index] !== "=") throw new MediaParseError("structure_invalid");
      index += 1;
      while (/\s/.test(text[index] ?? "")) index += 1;
      const quote = text[index];
      if (quote !== '"' && quote !== "'") {
        throw new MediaParseError("structure_invalid");
      }
      const end = skipTo(quote, index + 1);
      attributes.set(attribute, decodeEntities(text.slice(index + 1, end)));
      index = end + 1;
    }
    push({
      kind: closing ? "close" : "open",
      name,
      attributes,
      selfClosing,
      text: "",
    });
    cursor = index;
  }
  return events;
};

export interface MotionPhotoDirectoryItem {
  readonly mime: string;
  readonly semantic: string;
  readonly length: number | null;
  readonly padding: number;
}

const MIME_PATTERN = /^[a-z]+\/[a-z0-9.+-]{1,64}$/;
const SEMANTIC_PATTERN = /^[A-Za-z]{1,32}$/;

const decimal = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const trimmed = value.trim();
  if (
    !new RegExp(`^\\d{1,${MOTION_PHOTO_LIMITS.maxDecimalDigits}}$`).test(
      trimmed,
    )
  ) {
    throw new MediaParseError("structure_invalid");
  }
  return Number(trimmed);
};

/**
 * Reads the `Container:Directory` sequence from one XMP packet, or null when
 * the packet has none. Field names resolve through namespace URIs.
 */
export function readMotionPhotoDirectory(
  xmp: string,
): MotionPhotoDirectoryItem[] | null {
  const events = tokenizeXml(xmp);
  const namespaces = new Map<string, string>();
  for (const event of events) {
    for (const [name, value] of event.attributes) {
      if (!name.startsWith("xmlns:")) continue;
      const prefix = name.slice(6);
      const bound = namespaces.get(prefix);
      if (bound !== undefined && bound !== value) {
        throw new MediaParseError("structure_invalid");
      }
      namespaces.set(prefix, value);
    }
  }
  const resolve = (qualified: string) => {
    const colon = qualified.indexOf(":");
    if (colon === -1) return null;
    const uri = namespaces.get(qualified.slice(0, colon));
    return uri === undefined
      ? null
      : { uri, local: qualified.slice(colon + 1) };
  };
  const isElement = (event: XmlElement, uri: string, local: string) => {
    const resolved = resolve(event.name);
    return resolved?.uri === uri && resolved.local === local;
  };
  const directoryIndex = events.findIndex(
    (event) =>
      event.kind === "open" &&
      isElement(event, MOTION_PHOTO_NAMESPACES.container, "Directory"),
  );
  if (directoryIndex === -1) return null;
  const directory = events[directoryIndex]!;
  if (directory.selfClosing) throw new MediaParseError("structure_invalid");
  const items: MotionPhotoDirectoryItem[] = [];
  let depth = 0;
  for (let index = directoryIndex + 1; index < events.length; index += 1) {
    const event = events[index]!;
    if (event.kind === "close") {
      if (depth === 0) break;
      depth -= 1;
      continue;
    }
    if (event.kind !== "open") continue;
    if (!isElement(event, MOTION_PHOTO_NAMESPACES.container, "Item")) {
      if (!event.selfClosing) depth += 1;
      continue;
    }
    const fields = new Map<string, string>();
    for (const [name, value] of event.attributes) {
      const resolved = resolve(name);
      if (resolved?.uri === MOTION_PHOTO_NAMESPACES.item) {
        fields.set(resolved.local, value);
      }
    }
    if (!event.selfClosing) {
      let itemDepth = 0;
      let field: string | null = null;
      for (index += 1; index < events.length; index += 1) {
        const inner = events[index]!;
        if (inner.kind === "open") {
          const resolved = resolve(inner.name);
          field =
            itemDepth === 0 && resolved?.uri === MOTION_PHOTO_NAMESPACES.item
              ? resolved.local
              : null;
          if (!inner.selfClosing) itemDepth += 1;
        } else if (inner.kind === "text") {
          if (field !== null && inner.text.trim() !== "") {
            fields.set(field, inner.text.trim());
          }
        } else {
          if (itemDepth === 0) break;
          itemDepth -= 1;
          field = null;
        }
      }
    }
    if (items.length >= MOTION_PHOTO_LIMITS.maxDirectoryItems) {
      throw new MediaParseError("limit_exceeded");
    }
    const mime = fields.get("Mime") ?? "";
    const semantic = fields.get("Semantic") ?? "";
    if (!MIME_PATTERN.test(mime) || !SEMANTIC_PATTERN.test(semantic)) {
      throw new MediaParseError("structure_invalid");
    }
    items.push({
      mime,
      semantic,
      length: decimal(fields.get("Length")),
      padding: decimal(fields.get("Padding")) ?? 0,
    });
  }
  return items;
}

export type MotionPhotoPrimaryType = "image/jpeg" | "image/heic" | "image/heif";

export interface MotionPhotoLayout {
  readonly primaryLength: number;
  readonly videoType: "video/mp4" | "video/quicktime";
  readonly videoStart: number;
  readonly videoLength: number;
}

const PRIMARY_MIMES: Readonly<
  Record<MotionPhotoPrimaryType, readonly string[]>
> = {
  "image/jpeg": ["image/jpeg"],
  "image/heic": ["image/heic", "image/heif"],
  "image/heif": ["image/heic", "image/heif"],
};

/**
 * Validates a Motion Photo directory against the file: exactly one Primary
 * (first) and one MotionPhoto (last) item, consistent lengths and padding
 * that sum to the file size, an `ftyp` box at the computed video offset (a
 * matching `mpvd` header for HEIF primaries) and top-level boxes that tile
 * the embedded video exactly and include `moov`.
 */
export async function locateMotionPhotoVideo(
  reader: ByteReader,
  primaryType: MotionPhotoPrimaryType,
  items: readonly MotionPhotoDirectoryItem[],
): Promise<MotionPhotoLayout> {
  const invalid = () => new MediaParseError("structure_invalid");
  if (items.length < 2) throw invalid();
  const primary = items[0]!;
  const video = items[items.length - 1]!;
  if (
    primary.semantic !== "Primary" ||
    video.semantic !== "MotionPhoto" ||
    items.filter((item) => item.semantic === "Primary").length !== 1 ||
    items.filter((item) => item.semantic === "MotionPhoto").length !== 1 ||
    !PRIMARY_MIMES[primaryType].includes(primary.mime) ||
    (video.mime !== "video/mp4" && video.mime !== "video/quicktime") ||
    video.padding !== 0
  ) {
    throw invalid();
  }
  const heifPrimary = primaryType !== "image/jpeg";
  if (heifPrimary && primary.padding !== 8) throw invalid();
  let trailing = primary.padding;
  for (const item of items.slice(1)) {
    if (item.length === null || item.length <= 0) throw invalid();
    trailing += item.length + item.padding;
  }
  if (!Number.isSafeInteger(trailing) || trailing >= reader.size)
    throw invalid();
  const primaryLength = reader.size - trailing;
  if (
    primary.length !== null &&
    primary.length !== 0 &&
    primary.length !== primaryLength
  ) {
    throw invalid();
  }
  // The video is the last item without padding, so it ends at end of file.
  const videoLength = video.length!;
  const videoStart = reader.size - videoLength;
  if (videoLength < 24) throw invalid();
  if (heifPrimary) {
    const header = await reader.read(videoStart - 8, 8);
    if (u32be(header, 0) !== videoLength + 8 || fourCc(header, 4) !== "mpvd") {
      throw invalid();
    }
  } else {
    const end = await reader.read(primaryLength - 2, 2);
    if (end[0] !== 0xff || end[1] !== 0xd9) throw invalid();
  }
  const head = await reader.read(videoStart, Math.min(64, videoLength));
  const signature = sniffSignature(head);
  if (
    fourCc(head, 4) !== "ftyp" ||
    (signature.type !== "video/mp4" && signature.type !== "video/quicktime")
  ) {
    throw invalid();
  }
  const boxes = await readTopLevelBoxes(reader, videoStart, reader.size);
  if (!boxes.some((box) => box.type === "moov")) throw invalid();
  return {
    primaryLength,
    videoType: video.mime,
    videoStart,
    videoLength,
  };
}
