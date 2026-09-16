import { constants } from "node:fs";
import { open } from "node:fs/promises";

import { MediaParseError } from "./errors.js";

/** Random-access, bounds-checked reads over untrusted bytes. */
export interface ByteReader {
  readonly size: number;
  /** Resolves exactly `length` bytes or rejects with `truncated`. */
  read(offset: number, length: number): Promise<Uint8Array>;
}

const assertRange = (size: number, offset: number, length: number) => {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > size
  ) {
    throw new MediaParseError("truncated");
  }
};

export const bufferByteReader = (bytes: Uint8Array): ByteReader => ({
  size: bytes.byteLength,
  read: async (offset, length) => {
    assertRange(bytes.byteLength, offset, length);
    return bytes.subarray(offset, offset + length);
  },
});

/** Opens a regular file without following a final symbolic link. */
export async function openFileByteReader(
  filePath: string,
): Promise<ByteReader & { close(): Promise<void> }> {
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  try {
    const info = await handle.stat();
    if (!info.isFile()) throw new MediaParseError("structure_invalid");
    const size = info.size;
    return {
      size,
      read: async (offset, length) => {
        assertRange(size, offset, length);
        const target = new Uint8Array(length);
        let filled = 0;
        while (filled < length) {
          const { bytesRead } = await handle.read(
            target,
            filled,
            length - filled,
            offset + filled,
          );
          if (bytesRead === 0) throw new MediaParseError("truncated");
          filled += bytesRead;
        }
        return target;
      },
      close: () => handle.close(),
    };
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

export const u16be = (bytes: Uint8Array, offset: number): number => {
  if (offset < 0 || offset + 2 > bytes.byteLength) {
    throw new MediaParseError("truncated");
  }
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
};

export const u32be = (bytes: Uint8Array, offset: number): number => {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new MediaParseError("truncated");
  }
  return (
    ((bytes[offset]! << 24) >>> 0) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
};

export const i32be = (bytes: Uint8Array, offset: number): number =>
  u32be(bytes, offset) | 0;

/** 64-bit big-endian unsigned value, rejected when not a safe integer. */
export const u64be = (bytes: Uint8Array, offset: number): number => {
  const high = u32be(bytes, offset);
  const low = u32be(bytes, offset + 4);
  if (high >= 0x200000) throw new MediaParseError("offset_invalid");
  return high * 0x100000000 + low;
};

export const fourCc = (bytes: Uint8Array, offset: number): string => {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new MediaParseError("truncated");
  }
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
};

export const asciiEquals = (
  bytes: Uint8Array,
  offset: number,
  text: string,
): boolean => {
  if (offset < 0 || offset + text.length > bytes.byteLength) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
};
