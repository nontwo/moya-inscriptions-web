import { describe, expect, it } from "vitest";

import {
  HASH_CHUNK_BYTES,
  Sha256,
  createBlobHasher,
  sha256Hex,
  sha256HexOfBlob,
} from "./hashing";

const reference = async (data: Uint8Array) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", data as BufferSource)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");

const pattern = (length: number) => {
  const data = new Uint8Array(length);
  for (let index = 0; index < length; index += 1)
    data[index] = (index * 31 + 7) & 255;
  return data;
};

describe("incremental SHA-256", () => {
  it("matches WebCrypto across padding boundaries", async () => {
    for (const length of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const data = pattern(length);
      expect(sha256Hex(data)).toBe(await reference(data));
    }
  });

  it("gives the same digest however the input is chunked", async () => {
    const data = pattern(10_000);
    const hash = new Sha256();
    for (const size of [1, 63, 64, 65, 500, 9307]) {
      const offset = [1, 63, 64, 65, 500]
        .slice(0, [1, 63, 64, 65, 500, 9307].indexOf(size))
        .reduce((a, b) => a + b, 0);
      hash.update(data.subarray(offset, offset + size));
    }
    expect(hash.digestHex()).toBe(await reference(data));
  });

  it("streams a Blob in bounded chunks without reading it whole", async () => {
    const data = pattern(HASH_CHUNK_BYTES + 12_345);
    const reads: number[] = [];
    const blob = new Blob([data as BlobPart]);
    const tracked = {
      size: blob.size,
      slice: (start?: number, end?: number) => {
        reads.push((end ?? blob.size) - (start ?? 0));
        return blob.slice(start, end);
      },
    };
    expect(await sha256HexOfBlob(tracked)).toBe(await reference(data));
    expect(Math.max(...reads)).toBeLessThanOrEqual(HASH_CHUNK_BYTES);
    expect(reads).toHaveLength(2);
  });

  it("hashes on this thread in the same chunks when workers are unavailable", async () => {
    const data = pattern(2048);
    expect(
      await createBlobHasher(null).hash(new Blob([data as BlobPart])),
    ).toBe(await reference(data));
  });
});
