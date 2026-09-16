import {
  MediaParseError,
  asciiEquals,
  fourCc,
  readHead,
  u32be,
  u32le,
  windowedByteReader,
} from "./bytes";

import type { ByteReader } from "./bytes";

/**
 * Container identification from leading bytes (L01, S02). Names, extensions
 * and browser-reported MIME types are never consulted.
 */

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
   * `true` for image sequences detectable from the header (animated WebP
   * flag, HEIF/AVIF sequence brands). GIF frames, APNG and a HEIF `moov` box
   * need {@link detectAnimation}.
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
  for (let offset = 16; offset + 4 <= available; offset += 4)
    brands.push(fourCc(head, offset));
  const has = (set: ReadonlySet<string>) =>
    brands.some((brand) => set.has(brand));
  const major = brands[0]!;
  if (RAW_ISOBMFF_BRANDS.has(major)) return result("image/x-raw");
  if (major === "qt  ") return result("video/quicktime");
  if (brands.includes("avis")) return result("image/avif", true);
  if (major === "avif" || brands.includes("avif")) return result("image/avif");
  // A sequence brand wins over still brands listed alongside it.
  if (has(HEIF_SEQUENCE_BRANDS))
    return result(has(HEIC_BRANDS) ? "image/heic" : "image/heif", true);
  if (has(HEIC_BRANDS)) return result("image/heic");
  if (brands.includes("mif1")) return result("image/heif");
  if (has(MP4_BRANDS)) return result("video/mp4");
  if (brands.includes("qt  ")) return result("video/quicktime");
  return result("unknown");
};

/** Detects the container from leading bytes. */
export function sniffSignature(head: Uint8Array): MediaSignature {
  if (head.byteLength >= 3 && head[0] === 0xff && head[1] === 0xd8)
    return head[2] === 0xff ? result("image/jpeg") : result("unknown");
  if (
    head.byteLength >= 8 &&
    head[0] === 0x89 &&
    asciiEquals(head, 1, "PNG\r\n\x1a\n")
  )
    return result("image/png");
  if (asciiEquals(head, 0, "GIF87a") || asciiEquals(head, 0, "GIF89a"))
    return result("image/gif");
  if (asciiEquals(head, 0, "RIFF") && asciiEquals(head, 8, "WEBP")) {
    // VP8X flags byte: bit 1 marks animation.
    const animated =
      asciiEquals(head, 12, "VP8X") &&
      head.byteLength > 20 &&
      (head[20]! & 0x02) !== 0;
    return result("image/webp", animated);
  }
  if (head.byteLength >= 12 && asciiEquals(head, 4, "ftyp"))
    return sniffFileTypeBox(head);
  if (
    asciiEquals(head, 0, "IIRO") ||
    asciiEquals(head, 0, "IIRS") ||
    asciiEquals(head, 0, "IIU\0") ||
    asciiEquals(head, 0, "FUJIFILMCCD-RAW")
  )
    return result("image/x-raw");
  if (
    asciiEquals(head, 0, "II*\0") ||
    asciiEquals(head, 0, "MM\0*") ||
    asciiEquals(head, 0, "II+\0") ||
    asciiEquals(head, 0, "MM\0+")
  )
    // DNG, CR2, NEF, ARW and plain TIFF share this header; all are refused.
    return result("image/tiff");
  return result("unknown");
}

/** Chunks walked before `IDAT` when looking for APNG animation control. */
const PNG_MAX_CHUNKS_BEFORE_IMAGE_DATA = 4096;
const GIF_MAX_BLOCKS = 100_000;
const GIF_MAX_SCAN_BYTES = 16 * 1024 * 1024;
const WEBP_MAX_CHUNKS = 4096;
const TOP_LEVEL_MAX_BOXES = 1024;

/** True when a PNG carries `acTL` before its first `IDAT` (APNG). */
export async function pngHasAnimationControl(
  reader: ByteReader,
): Promise<boolean> {
  let offset = 8;
  for (let index = 0; index < PNG_MAX_CHUNKS_BEFORE_IMAGE_DATA; index += 1) {
    const header = await reader.read(offset, 8);
    const length = u32be(header, 0);
    const type = fourCc(header, 4);
    if (length > 0x7fffffff || !/^[A-Za-z]{4}$/u.test(type))
      throw new MediaParseError("structure_invalid");
    if (index === 0 && type !== "IHDR")
      throw new MediaParseError("structure_invalid");
    if (type === "acTL") return true;
    if (type === "IDAT") return false;
    if (type === "IEND") throw new MediaParseError("structure_invalid");
    offset += 12 + length;
    if (offset > reader.size) throw new MediaParseError("truncated");
  }
  throw new MediaParseError("limit_exceeded");
}

/** True when a WebP carries an `ANIM` or `ANMF` chunk (animation). */
export async function webpHasAnimationChunks(
  reader: ByteReader,
): Promise<boolean> {
  let offset = 12;
  for (
    let index = 0;
    index < WEBP_MAX_CHUNKS && offset + 8 <= reader.size;
    index += 1
  ) {
    const header = await reader.read(offset, 8);
    const type = fourCc(header, 0);
    const length = u32le(header, 4);
    if (type === "ANIM" || type === "ANMF") return true;
    offset += 8 + length + (length % 2);
  }
  return false;
}

const skipGifSubBlocks = async (
  reader: ByteReader,
  offset: number,
): Promise<number> => {
  let cursor = offset;
  for (let blocks = 0; blocks < GIF_MAX_BLOCKS; blocks += 1) {
    if (cursor >= reader.size) throw new MediaParseError("truncated");
    const length = (await reader.read(cursor, 1))[0]!;
    cursor += 1 + length;
    if (length === 0) return cursor;
  }
  throw new MediaParseError("limit_exceeded");
};

/** Counts GIF image descriptors, stopping at `stopAt` frames. */
export async function countGifFrames(
  reader: ByteReader,
  stopAt = 2,
): Promise<number> {
  const header = await reader.read(0, Math.min(13, reader.size));
  if (
    header.byteLength < 13 ||
    !(asciiEquals(header, 0, "GIF87a") || asciiEquals(header, 0, "GIF89a"))
  )
    throw new MediaParseError("structure_invalid");
  let cursor = 13;
  const flags = header[10]!;
  if (flags & 0x80) cursor += 3 * (1 << ((flags & 0x07) + 1));
  let frames = 0;
  for (let blocks = 0; blocks < GIF_MAX_BLOCKS; blocks += 1) {
    if (cursor >= reader.size || cursor > GIF_MAX_SCAN_BYTES)
      throw new MediaParseError(
        cursor > GIF_MAX_SCAN_BYTES ? "limit_exceeded" : "truncated",
      );
    const introducer = (await reader.read(cursor, 1))[0]!;
    if (introducer === 0x3b) return frames;
    if (introducer === 0x21) {
      cursor = await skipGifSubBlocks(reader, cursor + 2);
    } else if (introducer === 0x2c) {
      frames += 1;
      if (frames >= stopAt) return frames;
      const descriptor = await reader.read(cursor, 10);
      const localFlags = descriptor[9]!;
      cursor += 10;
      if (localFlags & 0x80) cursor += 3 * (1 << ((localFlags & 0x07) + 1));
      cursor = await skipGifSubBlocks(reader, cursor + 1);
    } else {
      throw new MediaParseError("structure_invalid");
    }
  }
  throw new MediaParseError("limit_exceeded");
}

/** Top-level ISO BMFF box types, headers only. */
export async function topLevelBoxTypes(reader: ByteReader): Promise<string[]> {
  const types: string[] = [];
  let offset = 0;
  while (offset + 8 <= reader.size) {
    if (types.length >= TOP_LEVEL_MAX_BOXES)
      throw new MediaParseError("limit_exceeded");
    const head = await reader.read(offset, Math.min(16, reader.size - offset));
    const size32 = u32be(head, 0);
    const type = fourCc(head, 4);
    let size = size32;
    if (size32 === 1) {
      if (head.byteLength < 16) throw new MediaParseError("truncated");
      const high = u32be(head, 8);
      if (high >= 0x200000) throw new MediaParseError("offset_invalid");
      size = high * 0x100000000 + u32be(head, 12);
    } else if (size32 === 0) {
      size = reader.size - offset;
    }
    if (size < 8 || offset + size > reader.size)
      throw new MediaParseError("box_invalid");
    types.push(type);
    offset += size;
  }
  return types;
}

/**
 * Animation that needs more than the header: GIF with more than one frame,
 * APNG, WebP animation chunks, a HEIF file with an image sequence (`moov`).
 */
export async function detectAnimation(
  source: ByteReader,
  signature: MediaSignature,
): Promise<boolean> {
  if (signature.animated) return true;
  const reader = windowedByteReader(source);
  switch (signature.type) {
    case "image/gif":
      return (await countGifFrames(reader)) > 1;
    case "image/png":
      return pngHasAnimationControl(reader);
    case "image/webp":
      return webpHasAnimationChunks(reader);
    case "image/heic":
    case "image/heif":
    case "image/avif":
      return (await topLevelBoxTypes(reader)).includes("moov");
    default:
      return false;
  }
}

export interface ImageHeader {
  /** Stored dimensions before any orientation, when the header states them. */
  readonly dimensions: {
    readonly width: number;
    readonly height: number;
  } | null;
  /** Whether the format and header allow transparency. */
  readonly mayHaveAlpha: boolean;
}

const PNG_ALPHA_COLOR_TYPES = new Set([4, 6]);

/** Header dimensions and possible transparency for PNG and WebP (JPEG never has alpha). */
export async function readImageHeader(
  source: ByteReader,
  type: SniffedMediaType,
): Promise<ImageHeader> {
  const reader = windowedByteReader(source);
  if (type === "image/png") {
    const head = await reader.read(0, Math.min(33, reader.size));
    if (head.byteLength < 33 || fourCc(head, 12) !== "IHDR")
      throw new MediaParseError("structure_invalid");
    const dimensions = { width: u32be(head, 16), height: u32be(head, 20) };
    if (PNG_ALPHA_COLOR_TYPES.has(head[25]!))
      return { dimensions, mayHaveAlpha: true };
    let offset = 8;
    for (let index = 0; index < PNG_MAX_CHUNKS_BEFORE_IMAGE_DATA; index += 1) {
      if (offset + 8 > reader.size) break;
      const header = await reader.read(offset, 8);
      const chunk = fourCc(header, 4);
      if (chunk === "tRNS") return { dimensions, mayHaveAlpha: true };
      if (chunk === "IDAT" || chunk === "IEND") break;
      offset += 12 + u32be(header, 0);
    }
    return { dimensions, mayHaveAlpha: false };
  }
  if (type === "image/webp") {
    const head = await reader.read(0, Math.min(30, reader.size));
    if (head.byteLength < 30) throw new MediaParseError("truncated");
    const chunk = fourCc(head, 12);
    if (chunk === "VP8X") {
      const width = 1 + (head[24]! | (head[25]! << 8) | (head[26]! << 16));
      const height = 1 + (head[27]! | (head[28]! << 8) | (head[29]! << 16));
      return {
        dimensions: { width, height },
        mayHaveAlpha: (head[20]! & 0x10) !== 0,
      };
    }
    if (chunk === "VP8L") {
      const bits = u32le(head, 21);
      return {
        dimensions: {
          width: (bits & 0x3fff) + 1,
          height: ((bits >>> 14) & 0x3fff) + 1,
        },
        mayHaveAlpha: ((bits >>> 28) & 1) === 1,
      };
    }
    if (chunk === "VP8 ")
      return {
        dimensions: {
          width: (head[26]! | (head[27]! << 8)) & 0x3fff,
          height: (head[28]! | (head[29]! << 8)) & 0x3fff,
        },
        mayHaveAlpha: false,
      };
    throw new MediaParseError("structure_invalid");
  }
  if (type === "image/jpeg") return { dimensions: null, mayHaveAlpha: false };
  // HEIF alpha lives in auxiliary items; decide from decoded pixels instead.
  return { dimensions: null, mayHaveAlpha: true };
}

/** Reads the signature of a file through a bounded reader. */
export const readSignature = async (
  reader: ByteReader,
): Promise<MediaSignature> =>
  sniffSignature(await readHead(reader, SIGNATURE_HEAD_BYTES));
