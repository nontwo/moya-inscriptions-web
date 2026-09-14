import { MediaParseError, fourCc, u16be, u32be, u64be } from "./bytes";

import type { ByteReader } from "./bytes";

/**
 * Bounded ISO BMFF / HEIF structure reading (headers, `meta`, `moov`), the
 * browser mirror of the Backend parser so both read identifiers the same way.
 */

export interface BoxHeader {
  readonly type: string;
  /** Absolute offset of the box header within the parsed coordinate space. */
  readonly start: number;
  readonly headerSize: number;
  readonly size: number;
  readonly end: number;
  readonly contentStart: number;
}

/** Documented parser bounds for untrusted ISO BMFF / QuickTime structures. */
export const ISOBMFF_LIMITS = {
  maxBoxesPerLevel: 4096,
  maxTopLevelBoxes: 1024,
  maxMovieBoxBytes: 16 * 1024 * 1024,
  maxMetaBoxBytes: 4 * 1024 * 1024,
  maxItems: 4096,
  maxExtentsPerItem: 64,
  maxItemBytes: 1024 * 1024,
  maxReferences: 4096,
} as const;

const TRAILING_BOX_TYPES = new Set(["mdat", "free", "skip", "mpvd"]);

/**
 * Parses the box header at absolute `offset`; `bytes[0]` sits at absolute
 * `base`. Size 0 ("to end of parent") is only honored when `allowToEnd`.
 */
export function parseBoxHeader(
  bytes: Uint8Array,
  offset: number,
  parentEnd: number,
  allowToEnd = false,
  base = 0,
): BoxHeader {
  const local = offset - base;
  if (offset + 8 > parentEnd) throw new MediaParseError("truncated");
  const size32 = u32be(bytes, local);
  const type = fourCc(bytes, local + 4);
  let headerSize = 8;
  let size: number;
  if (size32 === 1) {
    if (offset + 16 > parentEnd) throw new MediaParseError("truncated");
    size = u64be(bytes, local + 8);
    headerSize = 16;
  } else if (size32 === 0) {
    if (!allowToEnd) throw new MediaParseError("box_invalid");
    size = parentEnd - offset;
  } else {
    size = size32;
  }
  if (type === "uuid") headerSize += 16;
  if (size < headerSize || offset + size > parentEnd)
    throw new MediaParseError("box_invalid");
  return {
    type,
    start: offset,
    headerSize,
    size,
    end: offset + size,
    contentStart: offset + headerSize,
  };
}

/** Lists sibling boxes that must exactly tile `[start, end)` of `bytes`. */
export function listBoxes(
  bytes: Uint8Array,
  start: number,
  end: number,
  base = 0,
): BoxHeader[] {
  if (start < base || end - base > bytes.byteLength || start > end)
    throw new MediaParseError("offset_invalid");
  const boxes: BoxHeader[] = [];
  let offset = start;
  while (offset < end) {
    if (boxes.length >= ISOBMFF_LIMITS.maxBoxesPerLevel)
      throw new MediaParseError("limit_exceeded");
    const box = parseBoxHeader(bytes, offset, end, false, base);
    boxes.push(box);
    offset = box.end;
  }
  return boxes;
}

/**
 * Walks top-level boxes through random access, reading headers only. The
 * boxes must tile the range exactly; a size-0 box is only valid when last.
 */
export async function readTopLevelBoxes(
  reader: ByteReader,
  start = 0,
  end = reader.size,
): Promise<BoxHeader[]> {
  const boxes: BoxHeader[] = [];
  let offset = start;
  while (offset < end) {
    if (boxes.length >= ISOBMFF_LIMITS.maxTopLevelBoxes)
      throw new MediaParseError("limit_exceeded");
    const head = await reader.read(offset, Math.min(32, end - offset));
    const box = parseBoxHeader(head, offset, end, true, offset);
    if (u32be(head, 0) === 0 && !TRAILING_BOX_TYPES.has(box.type))
      throw new MediaParseError("box_invalid");
    boxes.push(box);
    offset = box.end;
  }
  return boxes;
}

/** Reads a whole top-level box of `type` (bounded), rebased to offset 0. */
export async function readTopLevelBox(
  reader: ByteReader,
  type: string,
  maxBytes: number,
  start = 0,
  end = reader.size,
): Promise<{ box: BoxHeader; bytes: Uint8Array } | null> {
  const box = (await readTopLevelBoxes(reader, start, end)).find(
    (candidate) => candidate.type === type,
  );
  if (!box) return null;
  if (box.size > maxBytes) throw new MediaParseError("limit_exceeded");
  return { box, bytes: await reader.read(box.start, box.size) };
}

/** Content start after the version/flags of a FullBox. */
export const fullBoxBody = (bytes: Uint8Array, box: BoxHeader) => {
  if (box.contentStart + 4 > box.end) throw new MediaParseError("truncated");
  return {
    version: bytes[box.contentStart]!,
    bodyStart: box.contentStart + 4,
  };
};

const readSized = (
  bytes: Uint8Array,
  offset: number,
  size: number,
  end: number,
): number => {
  if (offset + size > end) throw new MediaParseError("truncated");
  if (size === 0) return 0;
  if (size === 4) return u32be(bytes, offset);
  if (size === 8) return u64be(bytes, offset);
  throw new MediaParseError("structure_invalid");
};

const readCString = (bytes: Uint8Array, offset: number, end: number) => {
  let cursor = offset;
  let text = "";
  while (cursor < end && bytes[cursor] !== 0) {
    if (text.length < 255) text += String.fromCharCode(bytes[cursor]!);
    cursor += 1;
  }
  return { text, next: Math.min(cursor + 1, end) };
};

export interface HeifItemInfo {
  readonly id: number;
  readonly type: string;
  readonly contentType: string | null;
}

export interface HeifItemLocation {
  readonly id: number;
  readonly constructionMethod: number;
  readonly extents: readonly {
    readonly offset: number;
    readonly length: number;
  }[];
}

export interface HeifItemReference {
  readonly type: string;
  readonly from: number;
  readonly to: readonly number[];
}

export interface HeifMeta {
  readonly primaryItemId: number | null;
  readonly items: readonly HeifItemInfo[];
  readonly locations: ReadonlyMap<number, HeifItemLocation>;
  readonly references: readonly HeifItemReference[];
  /** Byte range of the `idat` payload within the meta box bytes. */
  readonly itemData: { readonly start: number; readonly end: number } | null;
}

const parseItemInfo = (bytes: Uint8Array, box: BoxHeader): HeifItemInfo[] => {
  const { version, bodyStart } = fullBoxBody(bytes, box);
  const countSize = version === 0 ? 2 : 4;
  const count =
    countSize === 2 ? u16be(bytes, bodyStart) : u32be(bytes, bodyStart);
  if (count > ISOBMFF_LIMITS.maxItems)
    throw new MediaParseError("limit_exceeded");
  const entries = listBoxes(bytes, bodyStart + countSize, box.end).filter(
    (entry) => entry.type === "infe",
  );
  if (entries.length !== count) throw new MediaParseError("structure_invalid");
  return entries.map((entry) => {
    const infe = fullBoxBody(bytes, entry);
    if (infe.version < 2)
      return { id: u16be(bytes, infe.bodyStart), type: "", contentType: null };
    const idSize = infe.version === 2 ? 2 : 4;
    const id =
      idSize === 2
        ? u16be(bytes, infe.bodyStart)
        : u32be(bytes, infe.bodyStart);
    const typeOffset = infe.bodyStart + idSize + 2;
    if (typeOffset + 4 > entry.end) throw new MediaParseError("truncated");
    const type = fourCc(bytes, typeOffset);
    const name = readCString(bytes, typeOffset + 4, entry.end);
    const contentType =
      type === "mime" ? readCString(bytes, name.next, entry.end).text : null;
    return { id, type, contentType };
  });
};

const parseItemLocations = (
  bytes: Uint8Array,
  box: BoxHeader,
): Map<number, HeifItemLocation> => {
  const { version, bodyStart } = fullBoxBody(bytes, box);
  if (version > 2) throw new MediaParseError("structure_invalid");
  let cursor = bodyStart;
  const sizes = u16be(bytes, cursor);
  cursor += 2;
  const offsetSize = sizes >> 12;
  const lengthSize = (sizes >> 8) & 0x0f;
  const baseOffsetSize = (sizes >> 4) & 0x0f;
  const indexSize = version === 0 ? 0 : sizes & 0x0f;
  for (const size of [offsetSize, lengthSize, baseOffsetSize, indexSize])
    if (size !== 0 && size !== 4 && size !== 8)
      throw new MediaParseError("structure_invalid");
  const itemCount = version < 2 ? u16be(bytes, cursor) : u32be(bytes, cursor);
  cursor += version < 2 ? 2 : 4;
  if (itemCount > ISOBMFF_LIMITS.maxItems)
    throw new MediaParseError("limit_exceeded");
  const locations = new Map<number, HeifItemLocation>();
  for (let item = 0; item < itemCount; item += 1) {
    const id = version < 2 ? u16be(bytes, cursor) : u32be(bytes, cursor);
    cursor += version < 2 ? 2 : 4;
    let constructionMethod = 0;
    if (version > 0) {
      constructionMethod = u16be(bytes, cursor) & 0x0f;
      cursor += 2;
    }
    cursor += 2; // data_reference_index
    const baseOffset = readSized(bytes, cursor, baseOffsetSize, box.end);
    cursor += baseOffsetSize;
    const extentCount = u16be(bytes, cursor);
    cursor += 2;
    if (extentCount > ISOBMFF_LIMITS.maxExtentsPerItem)
      throw new MediaParseError("limit_exceeded");
    const extents: { offset: number; length: number }[] = [];
    for (let extent = 0; extent < extentCount; extent += 1) {
      cursor += indexSize;
      const offset = readSized(bytes, cursor, offsetSize, box.end);
      cursor += offsetSize;
      const length = readSized(bytes, cursor, lengthSize, box.end);
      cursor += lengthSize;
      const absolute = baseOffset + offset;
      if (!Number.isSafeInteger(absolute))
        throw new MediaParseError("offset_invalid");
      extents.push({ offset: absolute, length });
    }
    if (locations.has(id)) throw new MediaParseError("structure_invalid");
    locations.set(id, { id, constructionMethod, extents });
  }
  if (cursor > box.end) throw new MediaParseError("truncated");
  return locations;
};

const parseItemReferences = (
  bytes: Uint8Array,
  box: BoxHeader,
): HeifItemReference[] => {
  const { version, bodyStart } = fullBoxBody(bytes, box);
  const idSize = version === 0 ? 2 : 4;
  const read = (offset: number) =>
    idSize === 2 ? u16be(bytes, offset) : u32be(bytes, offset);
  const references: HeifItemReference[] = [];
  for (const entry of listBoxes(bytes, bodyStart, box.end)) {
    if (references.length >= ISOBMFF_LIMITS.maxReferences)
      throw new MediaParseError("limit_exceeded");
    let cursor = entry.contentStart;
    const from = read(cursor);
    cursor += idSize;
    const count = u16be(bytes, cursor);
    cursor += 2;
    if (cursor + count * idSize > entry.end)
      throw new MediaParseError("truncated");
    const to: number[] = [];
    for (let index = 0; index < count; index += 1) {
      to.push(read(cursor));
      cursor += idSize;
    }
    references.push({ type: entry.type, from, to });
  }
  return references;
};

/** Parses a complete HEIF `meta` box (offsets start at 0 = the box). */
export function parseHeifMeta(metaBytes: Uint8Array): HeifMeta {
  const meta = parseBoxHeader(metaBytes, 0, metaBytes.byteLength);
  if (meta.type !== "meta") throw new MediaParseError("structure_invalid");
  const { bodyStart } = fullBoxBody(metaBytes, meta);
  const children = listBoxes(metaBytes, bodyStart, meta.end);
  const one = (type: string) => {
    const matches = children.filter((box) => box.type === type);
    if (matches.length > 1) throw new MediaParseError("structure_invalid");
    return matches[0] ?? null;
  };
  const pitm = one("pitm");
  let primaryItemId: number | null = null;
  if (pitm) {
    const body = fullBoxBody(metaBytes, pitm);
    primaryItemId =
      body.version === 0
        ? u16be(metaBytes, body.bodyStart)
        : u32be(metaBytes, body.bodyStart);
  }
  const iinf = one("iinf");
  const iloc = one("iloc");
  const iref = one("iref");
  const idat = one("idat");
  return {
    primaryItemId,
    items: iinf ? parseItemInfo(metaBytes, iinf) : [],
    locations: iloc ? parseItemLocations(metaBytes, iloc) : new Map(),
    references: iref ? parseItemReferences(metaBytes, iref) : [],
    itemData: idat ? { start: idat.contentStart, end: idat.end } : null,
  };
}

/**
 * Reads an item's payload (file-offset or `idat` construction only), bounded
 * by `maxBytes`.
 */
export async function readHeifItem(
  reader: ByteReader,
  metaBytes: Uint8Array,
  meta: HeifMeta,
  itemId: number,
  maxBytes: number = ISOBMFF_LIMITS.maxItemBytes,
): Promise<Uint8Array> {
  const location = meta.locations.get(itemId);
  if (!location || location.extents.length === 0)
    throw new MediaParseError("structure_invalid");
  const total = location.extents.reduce((sum, e) => sum + e.length, 0);
  if (location.extents.some((e) => e.length === 0) || total > maxBytes)
    throw new MediaParseError("limit_exceeded");
  const output = new Uint8Array(total);
  let filled = 0;
  for (const extent of location.extents) {
    let chunk: Uint8Array;
    if (location.constructionMethod === 0) {
      chunk = await reader.read(extent.offset, extent.length);
    } else if (location.constructionMethod === 1 && meta.itemData) {
      const start = meta.itemData.start + extent.offset;
      if (start + extent.length > meta.itemData.end)
        throw new MediaParseError("offset_invalid");
      chunk = metaBytes.subarray(start, start + extent.length);
    } else {
      throw new MediaParseError("structure_invalid");
    }
    output.set(chunk, filled);
    filled += chunk.byteLength;
  }
  return output;
}

/** Picks the Exif item describing the primary image (or the only one). */
export function findHeifExifItemId(meta: HeifMeta): number | null {
  const exifItems = meta.items.filter((item) => item.type === "Exif");
  if (exifItems.length === 0) return null;
  const describing = exifItems.find((item) =>
    meta.references.some(
      (reference) =>
        reference.type === "cdsc" &&
        reference.from === item.id &&
        meta.primaryItemId !== null &&
        reference.to.includes(meta.primaryItemId),
    ),
  );
  return (describing ?? exifItems[0]!).id;
}

/** The whole `moov` box of a QuickTime/MP4 file (bounded), rebased to 0. */
export const readMovieBox = async (
  reader: ByteReader,
  start = 0,
  end = reader.size,
): Promise<Uint8Array | null> =>
  (
    await readTopLevelBox(
      reader,
      "moov",
      ISOBMFF_LIMITS.maxMovieBoxBytes,
      start,
      end,
    )
  )?.bytes ?? null;
