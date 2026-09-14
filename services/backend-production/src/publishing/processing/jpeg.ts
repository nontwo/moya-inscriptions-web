import { asciiEquals, u16be } from "./byte-reader.js";
import { MediaParseError } from "./errors.js";

export interface JpegSegment {
  readonly marker: number;
  /** Payload range after the two length bytes. */
  readonly dataStart: number;
  readonly dataEnd: number;
}

/** Documented bounds for JPEG header scanning. */
export const JPEG_LIMITS = {
  maxSegments: 1024,
  maxFillBytes: 64,
  /** Leading bytes read to find metadata segments before scan data. */
  maxHeaderBytes: 4 * 1024 * 1024,
} as const;

/**
 * Lists marker segments from SOI up to (excluding) SOS/EOI. Segments that
 * extend beyond `bytes` reject as truncated.
 */
export function listJpegSegments(bytes: Uint8Array): JpegSegment[] {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new MediaParseError("structure_invalid");
  }
  const segments: JpegSegment[] = [];
  let cursor = 2;
  for (;;) {
    if (segments.length >= JPEG_LIMITS.maxSegments) {
      throw new MediaParseError("limit_exceeded");
    }
    if (cursor >= bytes.byteLength) throw new MediaParseError("truncated");
    if (bytes[cursor] !== 0xff) throw new MediaParseError("structure_invalid");
    let fill = 0;
    while (bytes[cursor + 1] === 0xff) {
      cursor += 1;
      if (++fill > JPEG_LIMITS.maxFillBytes) {
        throw new MediaParseError("structure_invalid");
      }
    }
    if (cursor + 1 >= bytes.byteLength) throw new MediaParseError("truncated");
    const marker = bytes[cursor + 1]!;
    if (marker === 0xda || marker === 0xd9) return segments;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      cursor += 2;
      continue;
    }
    const length = u16be(bytes, cursor + 2);
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
  for (const segment of listJpegSegments(bytes)) {
    if (
      segment.marker === 0xe1 &&
      asciiEquals(bytes, segment.dataStart, EXIF_HEADER)
    ) {
      return bytes.subarray(
        segment.dataStart + EXIF_HEADER.length,
        segment.dataEnd,
      );
    }
  }
  return null;
}
