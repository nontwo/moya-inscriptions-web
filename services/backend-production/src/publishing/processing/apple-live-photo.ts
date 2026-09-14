import { createHash } from "node:crypto";

import { asciiEquals, fourCc, u32be } from "./byte-reader.js";
import { MediaParseError } from "./errors.js";
import {
  ISOBMFF_LIMITS,
  findHeifExifItemId,
  listBoxes,
  parseBoxHeader,
  parseHeifMeta,
  readHeifItem,
  readTopLevelBox,
} from "./isobmff.js";
import { readJpegExifTiff } from "./jpeg.js";
import { TiffReader, readExifSummary } from "./tiff-exif.js";

import type { ByteReader } from "./byte-reader.js";
import type { BoxHeader } from "./isobmff.js";

/** Apple MakerNote tag 0x0011 (ContentIdentifier, the Live Photo pair UUID). */
export const APPLE_CONTENT_IDENTIFIER_TAG = 0x0011;
/** QuickTime `mdta` key carrying the same UUID in the motion component. */
export const QUICKTIME_CONTENT_IDENTIFIER_KEY =
  "com.apple.quicktime.content.identifier";

const APPLE_MAKER_NOTE_HEADER = "Apple iOS\0";
const APPLE_MAKER_NOTE_IFD_OFFSET = 14;
const UUID_PATTERN =
  /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/;
const MAX_KEYS = 1024;
const MAX_KEY_BYTES = 256;
const MAX_VALUE_BYTES = 256;

/** Uppercase canonical UUID, or null when the value is not a UUID. */
export function normalizeContentIdentifier(value: string): string | null {
  const upper = value.trim().toUpperCase();
  return UUID_PATTERN.test(upper) ? upper : null;
}

/** Stored pairing fact: SHA-256 of the canonical identifier, never the UUID. */
export const contentIdentifierSha256 = (identifier: string): string =>
  createHash("sha256").update(identifier, "utf8").digest("hex");

/**
 * Reads ContentIdentifier from an Apple MakerNote (`Apple iOS\0`, version,
 * byte order, IFD at +14; value offsets relative to the MakerNote start).
 */
export function readAppleMakerNoteContentIdentifier(
  makerNote: Uint8Array,
): string | null {
  if (!asciiEquals(makerNote, 0, APPLE_MAKER_NOTE_HEADER)) return null;
  let littleEndian: boolean;
  if (asciiEquals(makerNote, 12, "MM")) littleEndian = false;
  else if (asciiEquals(makerNote, 12, "II")) littleEndian = true;
  else throw new MediaParseError("structure_invalid");
  const reader = new TiffReader(makerNote, littleEndian);
  const entry = reader
    .readIfd(APPLE_MAKER_NOTE_IFD_OFFSET)
    .get(APPLE_CONTENT_IDENTIFIER_TAG);
  if (!entry || entry.type !== 2) return null;
  return normalizeContentIdentifier(reader.ascii(entry));
}

/** ContentIdentifier from a TIFF/Exif block (Exif IFD → Apple MakerNote). */
export function readExifContentIdentifier(tiff: Uint8Array): string | null {
  const { makerNote } = readExifSummary(tiff);
  if (!makerNote) return null;
  return readAppleMakerNoteContentIdentifier(
    tiff.subarray(makerNote.start, makerNote.end),
  );
}

/** ContentIdentifier from JPEG APP1 Exif within the leading header bytes. */
export function readJpegContentIdentifier(head: Uint8Array): string | null {
  const tiff = readJpegExifTiff(head);
  return tiff ? readExifContentIdentifier(tiff) : null;
}

/** HEIF Exif item payload: 4-byte TIFF header offset, then the block. */
export function exifItemTiff(item: Uint8Array): Uint8Array {
  const skip = u32be(item, 0);
  if (skip > item.byteLength - 4) throw new MediaParseError("offset_invalid");
  return item.subarray(4 + skip);
}

/** TIFF block of the primary image's Exif item, or null when there is none. */
export async function readHeifExifTiff(
  reader: ByteReader,
): Promise<Uint8Array | null> {
  const meta = await readTopLevelBox(
    reader,
    "meta",
    ISOBMFF_LIMITS.maxMetaBoxBytes,
  );
  if (!meta) throw new MediaParseError("structure_invalid");
  const parsed = parseHeifMeta(meta.bytes);
  const exifId = findHeifExifItemId(parsed);
  if (exifId === null) return null;
  const item = await readHeifItem(reader, meta.bytes, parsed, exifId);
  return exifItemTiff(item);
}

/** ContentIdentifier from the Exif item of a HEIC/HEIF still. */
export async function readHeifContentIdentifier(
  reader: ByteReader,
): Promise<string | null> {
  const tiff = await readHeifExifTiff(reader);
  return tiff ? readExifContentIdentifier(tiff) : null;
}

/** Children of a QuickTime `meta` atom, which may or may not be a FullBox. */
const metaChildren = (bytes: Uint8Array, meta: BoxHeader): BoxHeader[] => {
  try {
    const plain = listBoxes(bytes, meta.contentStart, meta.end);
    if (plain.some((box) => box.type === "hdlr" || box.type === "keys")) {
      return plain;
    }
  } catch {
    // Fall through to the ISO FullBox layout.
  }
  return listBoxes(bytes, meta.contentStart + 4, meta.end);
};

const utf8 = new TextDecoder("utf-8", { fatal: true });

/**
 * Reads `com.apple.quicktime.content.identifier` from the keys+ilst metadata
 * of `moov/meta` (camera files) or `moov/udta/meta` (some remuxers).
 * `moovBytes` holds the complete `moov` box.
 */
export function readQuickTimeContentIdentifier(
  moovBytes: Uint8Array,
): string | null {
  const moov = parseBoxHeader(moovBytes, 0, moovBytes.byteLength);
  if (moov.type !== "moov") throw new MediaParseError("structure_invalid");
  const children = listBoxes(moovBytes, moov.contentStart, moov.end);
  const metas = children.filter((box) => box.type === "meta");
  for (const udta of children.filter((box) => box.type === "udta")) {
    metas.push(
      ...listBoxes(moovBytes, udta.contentStart, udta.end).filter(
        (box) => box.type === "meta",
      ),
    );
  }
  for (const meta of metas.slice(0, 4)) {
    const identifier = readKeyedContentIdentifier(moovBytes, meta);
    if (identifier !== null) return identifier;
  }
  return null;
}

const readKeyedContentIdentifier = (
  moovBytes: Uint8Array,
  meta: BoxHeader,
): string | null => {
  const children = metaChildren(moovBytes, meta);
  const keys = children.find((box) => box.type === "keys");
  const ilst = children.find((box) => box.type === "ilst");
  if (!keys || !ilst) return null;
  let cursor = keys.contentStart + 4;
  const count = u32be(moovBytes, cursor);
  cursor += 4;
  if (count > MAX_KEYS) throw new MediaParseError("limit_exceeded");
  let keyIndex: number | null = null;
  for (let index = 1; index <= count; index += 1) {
    if (cursor + 8 > keys.end) throw new MediaParseError("truncated");
    const size = u32be(moovBytes, cursor);
    if (size < 8 || cursor + size > keys.end) {
      throw new MediaParseError("box_invalid");
    }
    if (
      keyIndex === null &&
      fourCc(moovBytes, cursor + 4) === "mdta" &&
      size - 8 === QUICKTIME_CONTENT_IDENTIFIER_KEY.length &&
      size - 8 <= MAX_KEY_BYTES &&
      asciiEquals(moovBytes, cursor + 8, QUICKTIME_CONTENT_IDENTIFIER_KEY)
    ) {
      keyIndex = index;
    }
    cursor += size;
  }
  if (keyIndex === null) return null;
  for (const entry of listBoxes(moovBytes, ilst.contentStart, ilst.end)) {
    if (u32be(moovBytes, entry.start + 4) !== keyIndex) continue;
    const data = listBoxes(moovBytes, entry.contentStart, entry.end).find(
      (box) => box.type === "data",
    );
    if (!data || data.contentStart + 8 > data.end) {
      throw new MediaParseError("structure_invalid");
    }
    // Type indicator: 1 = UTF-8 well-known type.
    if (u32be(moovBytes, data.contentStart) !== 1) return null;
    const valueStart = data.contentStart + 8;
    if (data.end - valueStart > MAX_VALUE_BYTES) {
      throw new MediaParseError("limit_exceeded");
    }
    try {
      return normalizeContentIdentifier(
        utf8.decode(moovBytes.subarray(valueStart, data.end)),
      );
    } catch {
      return null;
    }
  }
  return null;
};
