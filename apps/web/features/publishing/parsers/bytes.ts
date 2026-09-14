/**
 * Bounded random-access reads over untrusted media bytes in the browser. Every
 * parser reads through a `ByteReader` with a total read budget, so a hostile
 * file can never make a parser read (or allocate) more than its documented
 * bound. Error messages never contain input bytes or file names.
 */

export type MediaParseErrorCode =
  | "truncated"
  | "box_invalid"
  | "limit_exceeded"
  | "offset_invalid"
  | "structure_invalid";

export class MediaParseError extends Error {
  constructor(readonly code: MediaParseErrorCode) {
    super(`Publishing media parse failure: ${code}`);
    this.name = "MediaParseError";
  }
}

export interface ByteReader {
  readonly size: number;
  /** Resolves exactly `length` bytes or rejects with `truncated`. */
  read(offset: number, length: number): Promise<Uint8Array>;
}

/** Total bytes one extraction may read from a file (headers and metadata only). */
export const DEFAULT_READ_BUDGET = 32 * 1024 * 1024;

const assertRange = (size: number, offset: number, length: number) => {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > size
  )
    throw new MediaParseError("truncated");
};

interface SliceableBlob {
  readonly size: number;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

/** Reads slices of a Blob or File; never the whole file. */
export const blobByteReader = (
  blob: SliceableBlob,
  budget = DEFAULT_READ_BUDGET,
): ByteReader => {
  let spent = 0;
  return {
    size: blob.size,
    read: async (offset, length) => {
      assertRange(blob.size, offset, length);
      spent += length;
      if (spent > budget) throw new MediaParseError("limit_exceeded");
      const bytes = new Uint8Array(
        await blob.slice(offset, offset + length).arrayBuffer(),
      );
      if (bytes.byteLength !== length) throw new MediaParseError("truncated");
      return bytes;
    },
  };
};

export const bufferByteReader = (
  bytes: Uint8Array,
  budget = DEFAULT_READ_BUDGET,
): ByteReader => {
  let spent = 0;
  return {
    size: bytes.byteLength,
    read: async (offset, length) => {
      assertRange(bytes.byteLength, offset, length);
      spent += length;
      if (spent > budget) throw new MediaParseError("limit_exceeded");
      return bytes.subarray(offset, offset + length);
    },
  };
};

/**
 * Serves small reads from one cached window of the underlying reader, so
 * byte-by-byte walks (GIF blocks, box headers) cost few underlying reads.
 */
export const windowedByteReader = (
  reader: ByteReader,
  windowBytes = 64 * 1024,
): ByteReader => {
  let windowStart = 0;
  let window: Uint8Array = new Uint8Array(0);
  return {
    size: reader.size,
    read: async (offset, length) => {
      assertRange(reader.size, offset, length);
      if (length > windowBytes) return reader.read(offset, length);
      if (
        offset < windowStart ||
        offset + length > windowStart + window.byteLength
      ) {
        windowStart = offset;
        window = await reader.read(
          offset,
          Math.min(windowBytes, reader.size - offset),
        );
      }
      return window.subarray(
        offset - windowStart,
        offset - windowStart + length,
      );
    },
  };
};

export const u16be = (bytes: Uint8Array, offset: number): number => {
  if (offset < 0 || offset + 2 > bytes.byteLength)
    throw new MediaParseError("truncated");
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
};

export const u32be = (bytes: Uint8Array, offset: number): number => {
  if (offset < 0 || offset + 4 > bytes.byteLength)
    throw new MediaParseError("truncated");
  return (
    ((bytes[offset]! << 24) >>> 0) +
    (bytes[offset + 1]! << 16) +
    (bytes[offset + 2]! << 8) +
    bytes[offset + 3]!
  );
};

export const u32le = (bytes: Uint8Array, offset: number): number => {
  if (offset < 0 || offset + 4 > bytes.byteLength)
    throw new MediaParseError("truncated");
  return (
    bytes[offset]! +
    (bytes[offset + 1]! << 8) +
    (bytes[offset + 2]! << 16) +
    ((bytes[offset + 3]! << 24) >>> 0)
  );
};

/** 64-bit big-endian unsigned value, rejected when not a safe integer. */
export const u64be = (bytes: Uint8Array, offset: number): number => {
  const high = u32be(bytes, offset);
  const low = u32be(bytes, offset + 4);
  if (high >= 0x200000) throw new MediaParseError("offset_invalid");
  return high * 0x100000000 + low;
};

export const fourCc = (bytes: Uint8Array, offset: number): string => {
  if (offset < 0 || offset + 4 > bytes.byteLength)
    throw new MediaParseError("truncated");
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
  for (let index = 0; index < text.length; index += 1)
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  return true;
};

/** Reads up to `length` leading bytes (fewer for a short file). */
export const readHead = (reader: ByteReader, length: number) =>
  reader.read(0, Math.min(length, reader.size));
