/**
 * Dedicated worker: streaming SHA-256 of one component Blob in bounded
 * chunks. Answers `{ ok, sha256 }` only; no content or names leave it.
 */
import { sha256HexOfBlob } from "./sha256";

interface HashWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = globalThis as unknown as HashWorkerScope;

scope.onmessage = (event) => {
  const blob = (event.data as { blob?: unknown }).blob;
  if (!(blob instanceof Blob)) {
    scope.postMessage({ ok: false });
    return;
  }
  sha256HexOfBlob(blob).then(
    (sha256) => scope.postMessage({ ok: true, sha256 }),
    () => scope.postMessage({ ok: false }),
  );
};
