/**
 * Dedicated worker: Standard static preprocessing with the verified browser
 * techniques (createImageBitmap `imageOrientation: "from-image"`,
 * OffscreenCanvas `convertToBlob`). Bitmaps are closed and canvases dropped
 * after every request. Messages carry content-free reasons only.
 */
import { canvasEncodes } from "./capabilities";
import { preprocessStaticImage } from "./static-image";

import type {
  EncodableCanvas,
  StaticImageDeps,
  StaticPreprocessRequest,
} from "./static-image";

interface WorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
  postMessage(message: unknown): void;
}

const scope = globalThis as unknown as WorkerScope;

let webp: Promise<boolean> | null = null;

const deps: StaticImageDeps = {
  decode: (file) => createImageBitmap(file, { imageOrientation: "from-image" }),
  createCanvas: (width, height) =>
    typeof OffscreenCanvas === "undefined"
      ? null
      : (new OffscreenCanvas(width, height) as unknown as EncodableCanvas),
  webpEncodes: () =>
    (webp ??=
      typeof OffscreenCanvas === "undefined"
        ? Promise.resolve(false)
        : canvasEncodes(
            (width, height) =>
              new OffscreenCanvas(width, height) as unknown as EncodableCanvas,
            "image/webp",
          )),
};

scope.onmessage = (event) => {
  const request = event.data as StaticPreprocessRequest;
  preprocessStaticImage(request, deps).then(
    (result) => scope.postMessage({ ok: true, result }),
    () => scope.postMessage({ ok: false }),
  );
};
