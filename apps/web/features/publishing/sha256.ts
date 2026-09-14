/**
 * Incremental SHA-256 (FIPS 180-4) for component bytes and pairing digests.
 *
 * `crypto.subtle.digest` is one-shot (whole-file buffers) and is missing on a
 * private-LAN HTTP acceptance origin, so hashing here streams bounded chunks
 * through a small pure implementation, normally inside `hashing.worker.ts`.
 * The Backend's checksum stays authoritative; the client digest only detects
 * a transfer that stored different bytes than were selected.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
];

export class Sha256 {
  private readonly state = new Uint32Array(INITIAL);
  private readonly block = new Uint8Array(64);
  private readonly words = new Uint32Array(80);
  private blockLength = 0;
  private totalBytes = 0;
  private finished = false;

  update(data: Uint8Array): this {
    if (this.finished) throw new Error("SHA-256 already finished");
    let offset = 0;
    this.totalBytes += data.byteLength;
    if (this.blockLength > 0) {
      const take = Math.min(64 - this.blockLength, data.byteLength);
      this.block.set(data.subarray(0, take), this.blockLength);
      this.blockLength += take;
      offset = take;
      if (this.blockLength === 64) {
        this.compress(this.block, 0);
        this.blockLength = 0;
      }
    }
    while (offset + 64 <= data.byteLength) {
      this.compress(data, offset);
      offset += 64;
    }
    if (offset < data.byteLength) {
      this.block.set(data.subarray(offset), 0);
      this.blockLength = data.byteLength - offset;
    }
    return this;
  }

  /** Lowercase hex digest; the instance cannot be updated afterwards. */
  digestHex(): string {
    if (this.finished) throw new Error("SHA-256 already finished");
    const bitsHigh = Math.floor((this.totalBytes * 8) / 0x100000000);
    const bitsLow = (this.totalBytes * 8) >>> 0;
    const padding = new Uint8Array(
      this.blockLength < 56 ? 64 - this.blockLength : 128 - this.blockLength,
    );
    padding[0] = 0x80;
    const view = new DataView(padding.buffer);
    view.setUint32(padding.byteLength - 8, bitsHigh);
    view.setUint32(padding.byteLength - 4, bitsLow);
    const total = this.totalBytes;
    this.update(padding);
    this.totalBytes = total;
    this.finished = true;
    let hex = "";
    for (const word of this.state) hex += word.toString(16).padStart(8, "0");
    return hex;
  }

  private compress(data: Uint8Array, offset: number): void {
    const w = this.words;
    for (let index = 0; index < 16; index += 1) {
      const at = offset + index * 4;
      w[index] =
        ((data[at]! << 24) |
          (data[at + 1]! << 16) |
          (data[at + 2]! << 8) |
          data[at + 3]!) >>>
        0;
    }
    for (let index = 16; index < 64; index += 1) {
      const a = w[index - 15]!;
      const b = w[index - 2]!;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 =
        ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[index] = (w[index - 16]! + s0 + w[index - 7]! + s1) >>> 0;
    }
    const s = this.state;
    let a = s[0]!;
    let b = s[1]!;
    let c = s[2]!;
    let d = s[3]!;
    let e = s[4]!;
    let f = s[5]!;
    let g = s[6]!;
    let h = s[7]!;
    for (let index = 0; index < 64; index += 1) {
      const t1 =
        (h +
          (((e >>> 6) | (e << 26)) ^
            ((e >>> 11) | (e << 21)) ^
            ((e >>> 25) | (e << 7))) +
          ((e & f) ^ (~e & g)) +
          K[index]! +
          w[index]!) >>>
        0;
      const t2 =
        ((((a >>> 2) | (a << 30)) ^
          ((a >>> 13) | (a << 19)) ^
          ((a >>> 22) | (a << 10))) +
          ((a & b) ^ (a & c) ^ (b & c))) >>>
        0;
      h = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    s[0] = (s[0]! + a) >>> 0;
    s[1] = (s[1]! + b) >>> 0;
    s[2] = (s[2]! + c) >>> 0;
    s[3] = (s[3]! + d) >>> 0;
    s[4] = (s[4]! + e) >>> 0;
    s[5] = (s[5]! + f) >>> 0;
    s[6] = (s[6]! + g) >>> 0;
    s[7] = (s[7]! + h) >>> 0;
  }
}

export const sha256Hex = (data: Uint8Array): string =>
  new Sha256().update(data).digestHex();

/** SHA-256 of a string's UTF-8 bytes. */
export const sha256HexOfText = (text: string): string =>
  sha256Hex(new TextEncoder().encode(text));

/** Bytes read per step when hashing a Blob; bounds memory per step. */
export const HASH_CHUNK_BYTES = 4 * 1024 * 1024;

interface SliceableBlob {
  readonly size: number;
  slice(start?: number, end?: number): { arrayBuffer(): Promise<ArrayBuffer> };
}

/** Streams a Blob through SHA-256 in bounded chunks (no whole-file buffer). */
export const sha256HexOfBlob = async (
  blob: SliceableBlob,
  signal?: AbortSignal,
  onProgress?: (hashedBytes: number) => void,
): Promise<string> => {
  const hash = new Sha256();
  for (let offset = 0; offset < blob.size; offset += HASH_CHUNK_BYTES) {
    if (signal?.aborted) throw signal.reason;
    const chunk = new Uint8Array(
      await blob
        .slice(offset, Math.min(blob.size, offset + HASH_CHUNK_BYTES))
        .arrayBuffer(),
    );
    hash.update(chunk);
    onProgress?.(Math.min(blob.size, offset + chunk.byteLength));
  }
  return hash.digestHex();
};
