import { MediaParseError, asciiEquals } from "./bytes";

/** Documented bounds for untrusted TIFF/Exif structures. */
export const TIFF_LIMITS = {
  maxEntriesPerIfd: 1024,
  maxIfds: 16,
  maxAsciiBytes: 1024,
} as const;

const TYPE_SIZES: Readonly<Record<number, number>> = {
  1: 1,
  2: 1,
  3: 2,
  4: 4,
  5: 8,
  6: 1,
  7: 1,
  8: 2,
  9: 4,
  10: 8,
  11: 4,
  12: 8,
  13: 4,
};

export interface TiffEntry {
  readonly tag: number;
  readonly type: number;
  readonly count: number;
  /** Offset (within the TIFF bytes) of the value, inline or out-of-line. */
  readonly valueOffset: number;
  readonly byteLength: number;
}

/**
 * Bounds-checked reader over one TIFF structure. Offsets are relative to
 * `bytes[0]`: the TIFF header for Exif, or a MakerNote start for maker notes.
 */
export class TiffReader {
  private readonly visited = new Set<number>();

  constructor(
    readonly bytes: Uint8Array,
    readonly littleEndian: boolean,
  ) {}

  static fromHeader(bytes: Uint8Array): { reader: TiffReader; ifd0: number } {
    let littleEndian: boolean;
    if (asciiEquals(bytes, 0, "II")) littleEndian = true;
    else if (asciiEquals(bytes, 0, "MM")) littleEndian = false;
    else throw new MediaParseError("structure_invalid");
    const reader = new TiffReader(bytes, littleEndian);
    if (reader.u16(2) !== 42) throw new MediaParseError("structure_invalid");
    return { reader, ifd0: reader.u32(4) };
  }

  u16(offset: number): number {
    if (offset < 0 || offset + 2 > this.bytes.byteLength)
      throw new MediaParseError("truncated");
    const a = this.bytes[offset]!;
    const b = this.bytes[offset + 1]!;
    return this.littleEndian ? a | (b << 8) : (a << 8) | b;
  }

  u32(offset: number): number {
    if (offset < 0 || offset + 4 > this.bytes.byteLength)
      throw new MediaParseError("truncated");
    const a = this.bytes[offset]!;
    const b = this.bytes[offset + 1]!;
    const c = this.bytes[offset + 2]!;
    const d = this.bytes[offset + 3]!;
    return this.littleEndian
      ? a + (b << 8) + (c << 16) + ((d << 24) >>> 0)
      : ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
  }

  /** Reads the IFD at `offset`; each IFD once per reader, so cycles reject. */
  readIfd(offset: number): Map<number, TiffEntry> {
    if (
      !Number.isSafeInteger(offset) ||
      offset < 8 ||
      offset + 2 > this.bytes.byteLength
    )
      throw new MediaParseError("offset_invalid");
    if (this.visited.has(offset)) throw new MediaParseError("offset_invalid");
    if (this.visited.size >= TIFF_LIMITS.maxIfds)
      throw new MediaParseError("limit_exceeded");
    this.visited.add(offset);
    const count = this.u16(offset);
    if (count > TIFF_LIMITS.maxEntriesPerIfd)
      throw new MediaParseError("limit_exceeded");
    if (offset + 2 + count * 12 > this.bytes.byteLength)
      throw new MediaParseError("truncated");
    const entries = new Map<number, TiffEntry>();
    for (let index = 0; index < count; index += 1) {
      const entryOffset = offset + 2 + index * 12;
      const tag = this.u16(entryOffset);
      const type = this.u16(entryOffset + 2);
      const count32 = this.u32(entryOffset + 4);
      const unit = TYPE_SIZES[type];
      if (unit === undefined || entries.has(tag)) continue;
      const byteLength = unit * count32;
      const valueOffset =
        byteLength <= 4 ? entryOffset + 8 : this.u32(entryOffset + 8);
      entries.set(tag, { tag, type, count: count32, valueOffset, byteLength });
    }
    return entries;
  }

  /** Validates that an entry's value lies within the TIFF bytes. */
  valueRange(entry: TiffEntry): { start: number; end: number } {
    const end = entry.valueOffset + entry.byteLength;
    if (
      !Number.isSafeInteger(end) ||
      entry.valueOffset < 0 ||
      end > this.bytes.byteLength
    )
      throw new MediaParseError("offset_invalid");
    return { start: entry.valueOffset, end };
  }

  /** ASCII value without trailing NULs; bounded length. */
  ascii(entry: TiffEntry): string {
    if (entry.type !== 2 || entry.count > TIFF_LIMITS.maxAsciiBytes)
      throw new MediaParseError("structure_invalid");
    const { start, end } = this.valueRange(entry);
    let text = "";
    for (let offset = start; offset < end; offset += 1) {
      const code = this.bytes[offset]!;
      if (code === 0) break;
      text += String.fromCharCode(code);
    }
    return text;
  }

  /** First value of a SHORT or LONG entry. */
  unsigned(entry: TiffEntry): number {
    if (entry.count < 1) throw new MediaParseError("structure_invalid");
    if (entry.type === 3) return this.u16(this.valueRange(entry).start);
    if (entry.type === 4 || entry.type === 13)
      return this.u32(this.valueRange(entry).start);
    throw new MediaParseError("structure_invalid");
  }
}

export const EXIF_TAGS = {
  orientation: 0x0112,
  exifIfd: 0x8769,
  makerNote: 0x927c,
} as const;

export interface ExifSummary {
  /** EXIF Orientation 1..8, or null when absent or invalid. */
  readonly orientation: number | null;
  /** MakerNote value range within the TIFF bytes. */
  readonly makerNote: { readonly start: number; readonly end: number } | null;
}

/** Extracts the orientation and MakerNote location from a TIFF/Exif block. */
export function readExifSummary(tiff: Uint8Array): ExifSummary {
  const { reader, ifd0 } = TiffReader.fromHeader(tiff);
  const entries = reader.readIfd(ifd0);
  const orientationEntry = entries.get(EXIF_TAGS.orientation);
  let orientation: number | null = null;
  if (orientationEntry?.type === 3) {
    const value = reader.unsigned(orientationEntry);
    orientation = value >= 1 && value <= 8 ? value : null;
  }
  const exifPointer = entries.get(EXIF_TAGS.exifIfd);
  let makerNote: ExifSummary["makerNote"] = null;
  if (exifPointer) {
    const exif = reader.readIfd(reader.unsigned(exifPointer));
    const note = exif.get(EXIF_TAGS.makerNote);
    if (note && (note.type === 7 || note.type === 1))
      makerNote = reader.valueRange(note);
  }
  return { orientation, makerNote };
}

/** Documented bounds for JPEG header scanning. */
export const JPEG_LIMITS = {
  maxSegments: 1024,
  maxFillBytes: 64,
  /** Leading bytes read to find metadata segments before scan data. */
  maxHeaderBytes: 4 * 1024 * 1024,
} as const;

export interface JpegSegment {
  readonly marker: number;
  /** Payload range after the two length bytes. */
  readonly dataStart: number;
  readonly dataEnd: number;
}

/**
 * Lists marker segments from SOI up to (excluding) SOS/EOI within `bytes`
 * (the leading header bytes of a JPEG).
 */
export function listJpegSegments(bytes: Uint8Array): JpegSegment[] {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new MediaParseError("structure_invalid");
  const segments: JpegSegment[] = [];
  let cursor = 2;
  for (;;) {
    if (segments.length >= JPEG_LIMITS.maxSegments)
      throw new MediaParseError("limit_exceeded");
    if (cursor >= bytes.byteLength) throw new MediaParseError("truncated");
    if (bytes[cursor] !== 0xff) throw new MediaParseError("structure_invalid");
    let fill = 0;
    while (bytes[cursor + 1] === 0xff) {
      cursor += 1;
      if (++fill > JPEG_LIMITS.maxFillBytes)
        throw new MediaParseError("structure_invalid");
    }
    if (cursor + 1 >= bytes.byteLength) throw new MediaParseError("truncated");
    const marker = bytes[cursor + 1]!;
    if (marker === 0xda || marker === 0xd9) return segments;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      cursor += 2;
      continue;
    }
    if (cursor + 4 > bytes.byteLength) throw new MediaParseError("truncated");
    const length = (bytes[cursor + 2]! << 8) | bytes[cursor + 3]!;
    if (length < 2) throw new MediaParseError("structure_invalid");
    const dataStart = cursor + 4;
    const dataEnd = cursor + 2 + length;
    if (dataEnd > bytes.byteLength) throw new MediaParseError("truncated");
    segments.push({ marker, dataStart, dataEnd });
    cursor = dataEnd;
  }
}

const EXIF_HEADER = "Exif\0\0";

/** TIFF bytes of the first APP1 Exif segment, or null. */
export function readJpegExifTiff(bytes: Uint8Array): Uint8Array | null {
  for (const segment of listJpegSegments(bytes))
    if (
      segment.marker === 0xe1 &&
      asciiEquals(bytes, segment.dataStart, EXIF_HEADER)
    )
      return bytes.subarray(
        segment.dataStart + EXIF_HEADER.length,
        segment.dataEnd,
      );
  return null;
}

/** Start-of-frame dimensions of a JPEG within its header bytes, or null. */
export function readJpegDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  for (const segment of listJpegSegments(bytes)) {
    const sof =
      segment.marker >= 0xc0 &&
      segment.marker <= 0xcf &&
      segment.marker !== 0xc4 &&
      segment.marker !== 0xc8 &&
      segment.marker !== 0xcc;
    if (sof && segment.dataEnd - segment.dataStart >= 5) {
      const s = segment.dataStart;
      return {
        height: (bytes[s + 1]! << 8) | bytes[s + 2]!,
        width: (bytes[s + 3]! << 8) | bytes[s + 4]!,
      };
    }
  }
  return null;
}
