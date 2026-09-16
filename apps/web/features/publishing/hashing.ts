/**
 * Worker-backed streaming SHA-256 for component Blobs. The pure digest code
 * lives in `sha256.ts` so the worker and this module share it without a
 * dependency cycle.
 */
export {
  HASH_CHUNK_BYTES,
  Sha256,
  sha256Hex,
  sha256HexOfBlob,
  sha256HexOfText,
} from "./sha256";
import { sha256HexOfBlob } from "./sha256";
export interface BlobHasher {
  hash(blob: Blob, signal?: AbortSignal): Promise<string>;
}

type WorkerFactory = () => Worker;

/**
 * Hashes in a dedicated worker when workers exist; otherwise on this thread
 * in the same bounded chunks. One worker per hash, terminated afterwards.
 */
export const createBlobHasher = (
  workerFactory: WorkerFactory | null = typeof Worker === "undefined"
    ? null
    : () =>
        new Worker(new URL("./hashing.worker.ts", import.meta.url), {
          type: "module",
        }),
): BlobHasher => ({
  hash: (blob, signal) => {
    if (workerFactory === null) return sha256HexOfBlob(blob, signal);
    return new Promise<string>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = workerFactory();
      } catch {
        sha256HexOfBlob(blob, signal).then(resolve, reject);
        return;
      }
      const finish = () => {
        worker.terminate();
        signal?.removeEventListener("abort", onAbort);
      };
      const onAbort = () => {
        finish();
        reject(signal?.reason);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      worker.onmessage = (event: MessageEvent<unknown>) => {
        finish();
        const data = event.data as { ok?: unknown; sha256?: unknown };
        if (data.ok === true && typeof data.sha256 === "string")
          resolve(data.sha256);
        else reject(new Error("hash_failed"));
      };
      worker.onerror = () => {
        finish();
        reject(new Error("hash_failed"));
      };
      worker.postMessage({ blob });
    });
  },
});
