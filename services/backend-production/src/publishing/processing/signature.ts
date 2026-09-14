import { asciiEquals, fourCc, u32be } from "./byte-reader.js";
import { MediaParseError } from "./errors.js";

import type { ByteReader } from "./byte-reader.js";

export type SniffedMediaType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/gif"
  | "image/heic"
  | "image/heif"
  | "image/avif"
  | "video/quicktime"
  | "video/mp4"
  | "image/tiff"
  | "image/x-raw"
  | "unknown";

export interface MediaSignature {
  readonly type: SniffedMediaType;
  /**
   * `true` for image sequences detectable from the header (animated WebP,
   * HEIF/AVIF sequence brands). GIF frame counting needs
   * {@link countGifFrames}, APNG needs {@link pngHasAnimationControl} and a
   * HEIF `moov` box needs a top-level box walk.
   */
  readonly animated: boolean;
}

/** Bytes needed by {@link sniffSignature} to see every brand it checks. */
export const SIGNATURE_HEAD_BYTES = 512;

const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis"]);
const HEIF_SEQUENCE_BRANDS = new Set(["msf1", "hevc", "hevx", "hevm", "hevs"]);
const MP4_BRANDS = new Set([
  "isom",
  "iso2",
  "iso3",
  "iso4",
  "iso5",
  "iso6",
  "mp41",
  "mp42",
  "avc1",
  "M4V ",
  "MSNV",
  "dash",
]);
const RAW_ISOBMFF_BRANDS = new Set(["crx "]);

const result = (type: SniffedMediaType, animated = false): MediaSignature => ({
  type,
  animated,
});

const sniffFileTypeBox = (head: Uint8Array): MediaSignature => {
  const size = u32be(head, 0);
  if (size < 16 || size % 4 !== 0 || size > 4096) return result("unknown");
  const available = Math.min(size, head.byteLength);
  const brands = [fourCc(head, 8)];
  for (let offset = 16; offset + 4 <= available; offset += 4) {
    brands.push(fourCc(head, offset));
  }
  const has = (set: ReadonlySet<string>) => brands.some((b) => set.has(b));
  const major = brands[0]!;
  if (RAW_ISOBMFF_BRANDS.has(major)) return result("image/x-raw");
  if (major === "qt  ") return result("video/quicktime");
  if (brands.includes("avis")) return result("image/avif", true);
  if (major === "avif" || brands.includes("avif")) return result("image/avif");
  // A sequence brand wins over still brands listed alongside it (L01).
  if (has(HEIF_SEQUENCE_BRANDS)) {
    return result(has(HEIC_BRANDS) ? "image/heic" : "image/heif", true);
  }
  if (has(HEIC_BRANDS)) return result("image/heic");
  if (brands.includes("mif1")) return result("image/heif");
  if (has(MP4_BRANDS)) return result("video/mp4");
  if (brands.includes("qt  ")) return result("video/quicktime");
  return result("unknown");
};

/** Detects the container from leading bytes; never trusts names or MIME. */
export function sniffSignature(head: Uint8Array): MediaSignature {
  if (head.byteLength >= 3 && head[0] === 0xff && head[1] === 0xd8) {
    return head[2] === 0xff ? result("image/jpeg") : result("unknown");
  }
  if (
    head.byteLength >= 8 &&
    head[0] === 0x89 &&
    asciiEquals(head, 1, "PNG\r\n\x1a\n")
  ) {
    return result("image/png");
  }
  if (asciiEquals(head, 0, "GIF87a") || asciiEquals(head, 0, "GIF89a")) {
    return result("image/gif");
  }
  if (asciiEquals(head, 0, "RIFF") && asciiEquals(head, 8, "WEBP")) {
    // VP8X flags byte: bit 1 marks animation.
    const animated =
      asciiEquals(head, 12, "VP8X") &&
      head.byteLength > 20 &&
      (head[20]! & 0x02) !== 0;
    return result("image/webp", animated);
  }
  if (head.byteLength >= 12 && asciiEquals(head, 4, "ftyp")) {
    return sniffFileTypeBox(head);
  }
  if (
    asciiEquals(head, 0, "II*\0") ||
    asciiEquals(head, 0, "MM\0*") ||
    asciiEquals(head, 0, "II+\0") ||
    asciiEquals(head, 0, "MM\0+")
  ) {
    return result("image/tiff");
  }
  if (
    asciiEquals(head, 0, "IIRO") ||
    asciiEquals(head, 0, "IIRS") ||
    asciiEquals(head, 0, "IIU\0") ||
    asciiEquals(head, 0, "FUJIFILMCCD-RAW")
  ) {
    return result("image/x-raw");
  }
  return result("unknown");
}

/** Chunks walked before `IDAT` when looking for APNG animation control. */
export const PNG_MAX_CHUNKS_BEFORE_IMAGE_DATA = 4096;
const PNG_MAX_CHUNK_LENGTH = 0x7fffffff;

/**
 * True when a PNG carries an `acTL` animation control chunk before its first
 * `IDAT` (APNG). Reads chunk headers only; the layout must be well formed up
 * to `IDAT`.
 */
export async function pngHasAnimationControl(
  reader: ByteReader,
): Promise<boolean> {
  let offset = 8;
  for (let index = 0; index < PNG_MAX_CHUNKS_BEFORE_IMAGE_DATA; index += 1) {
    const header = await reader.read(offset, 8);
    const length = u32be(header, 0);
    const type = fourCc(header, 4);
    if (length > PNG_MAX_CHUNK_LENGTH || !/^[A-Za-z]{4}$/.test(type)) {
      throw new MediaParseError("structure_invalid");
    }
    if (index === 0 && type !== "IHDR") {
      throw new MediaParseError("structure_invalid");
    }
    if (type === "acTL") return true;
    if (type === "IDAT") return false;
    if (type === "IEND") throw new MediaParseError("structure_invalid");
    offset += 12 + length;
    if (offset > reader.size) throw new MediaParseError("truncated");
  }
  throw new MediaParseError("limit_exceeded");
}

const GIF_MAX_BLOCKS = 100_000;

const skipGifSubBlocks = (bytes: Uint8Array, offset: number): number => {
  let cursor = offset;
  for (let blocks = 0; blocks < GIF_MAX_BLOCKS; blocks += 1) {
    if (cursor >= bytes.byteLength) throw new MediaParseError("truncated");
    const length = bytes[cursor]!;
    cursor += 1 + length;
    if (length === 0) return cursor;
  }
  throw new MediaParseError("limit_exceeded");
};

/**
 * Counts GIF image descriptors, stopping at `stopAt` frames. Every length
 * is bounds-checked; malformed streams reject.
 */
export function countGifFrames(bytes: Uint8Array, stopAt = 2): number {
  if (
    !(asciiEquals(bytes, 0, "GIF87a") || asciiEquals(bytes, 0, "GIF89a")) ||
    bytes.byteLength < 13
  ) {
    throw new MediaParseError("structure_invalid");
  }
  let cursor = 13;
  const flags = bytes[10]!;
  if (flags & 0x80) cursor += 3 * (1 << ((flags & 0x07) + 1));
  let frames = 0;
  for (let blocks = 0; blocks < GIF_MAX_BLOCKS; blocks += 1) {
    if (cursor >= bytes.byteLength) throw new MediaParseError("truncated");
    const introducer = bytes[cursor]!;
    if (introducer === 0x3b) return frames;
    if (introducer === 0x21) {
      cursor = skipGifSubBlocks(bytes, cursor + 2);
    } else if (introducer === 0x2c) {
      frames += 1;
      if (frames >= stopAt) return frames;
      if (cursor + 10 > bytes.byteLength) {
        throw new MediaParseError("truncated");
      }
      const localFlags = bytes[cursor + 9]!;
      cursor += 10;
      if (localFlags & 0x80) cursor += 3 * (1 << ((localFlags & 0x07) + 1));
      cursor = skipGifSubBlocks(bytes, cursor + 1);
    } else {
      throw new MediaParseError("structure_invalid");
    }
  }
  throw new MediaParseError("limit_exceeded");
}

/** Declared-type families a detected container may satisfy. */
export function declaredTypeMatches(
  declared: string,
  detected: SniffedMediaType,
): boolean {
  switch (detected) {
    case "image/jpeg":
    case "image/png":
    case "image/webp":
      return declared === detected;
    case "image/heic":
    case "image/heif":
      return declared === "image/heic" || declared === "image/heif";
    case "video/quicktime":
    case "video/mp4":
      return declared === "video/quicktime" || declared === "video/mp4";
    default:
      return false;
  }
}
