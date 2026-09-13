import { inflateSync } from "node:zlib";
import { CommunityInputError } from "@moya/api";

const MAX_PNG_BYTES = 4 * 1024 * 1024;
const MAX_PIXELS = 16 * 1024 * 1024;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++)
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
/** Canvas-exported RGB/RGBA PNG only: bounded pixels, chunks, CRC and inflate. */
export const validateAuthorPng = (
  input: Uint8Array,
): { width: number; height: number } => {
  const b = Buffer.from(input);
  if (
    b.length > MAX_PNG_BYTES ||
    b.length < 57 ||
    !b.subarray(0, 8).equals(signature)
  )
    throw new CommunityInputError("Upload a PNG image no larger than 4 MiB");
  let offset = 8,
    width = 0,
    height = 0,
    channels = 0,
    ended = false,
    dataEnded = false;
  const compressed: Buffer[] = [];
  while (offset < b.length) {
    if (offset + 12 > b.length) throw new CommunityInputError("Incomplete PNG");
    const n = b.readUInt32BE(offset),
      type = b.toString("ascii", offset + 4, offset + 8);
    if (
      n > b.length - offset - 12 ||
      crc32(b.subarray(offset + 4, offset + 8 + n)) !==
        b.readUInt32BE(offset + 8 + n)
    )
      throw new CommunityInputError("Invalid PNG chunk");
    const chunk = b.subarray(offset + 8, offset + 8 + n);
    if (offset === 8 && type !== "IHDR")
      throw new CommunityInputError("PNG header is missing");
    if (type === "IHDR") {
      if (offset !== 8 || n !== 13)
        throw new CommunityInputError("Invalid PNG header");
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      channels = chunk[9] === 6 ? 4 : chunk[9] === 2 ? 3 : 0;
      if (
        !width ||
        !height ||
        width > 8192 ||
        height > 8192 ||
        width * height > MAX_PIXELS ||
        chunk[8] !== 8 ||
        channels === 0 ||
        chunk[10] !== 0 ||
        chunk[11] !== 0 ||
        chunk[12] !== 0
      )
        throw new CommunityInputError(
          "Unsupported PNG dimensions or encoding; crop/export the image first",
        );
    } else if (type === "IDAT") {
      if (dataEnded)
        throw new CommunityInputError("PNG data chunks must be contiguous");
      compressed.push(chunk);
    } else if (type === "IEND") {
      if (n !== 0 || compressed.length === 0 || offset + 12 !== b.length)
        throw new CommunityInputError("Invalid PNG ending");
      ended = true;
    } else {
      if (compressed.length) dataEnded = true;
      // Ancillary metadata is excluded: uploaded files contain pixels only.
      if (!["sRGB", "gAMA", "pHYs", "cHRM"].includes(type))
        throw new CommunityInputError(
          "Unsupported PNG metadata; export through the image editor",
        );
    }
    offset += n + 12;
  }
  if (!ended) throw new CommunityInputError("Incomplete PNG");
  const stride = width * channels + 1,
    expected = stride * height;
  let raw: Buffer;
  try {
    raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected });
  } catch {
    throw new CommunityInputError("Invalid PNG image data");
  }
  if (raw.length !== expected)
    throw new CommunityInputError("PNG pixel size mismatch");
  for (let y = 0; y < height; y++)
    if (raw[y * stride]! > 4)
      throw new CommunityInputError("Invalid PNG filter");
  return { width, height };
};
