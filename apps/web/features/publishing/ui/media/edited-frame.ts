import { drawPlan } from "./media-geometry";

import type { Size } from "./media-geometry";
import type { MediaEdit } from "@moya/contracts";

/**
 * Renders an item's edited frame (rotation, then crop) into a bounded local
 * image for the cover composition dialog, which must crop inside that frame.
 * Preview only: nothing rendered here is uploaded. The canvas is released at
 * once; the caller revokes the returned URL (`release`).
 */

export interface EditedFrameImage {
  readonly url: string;
  readonly size: Size;
  release(): void;
}

/** Long edge of the composition preview; enough to judge a card crop. */
export const EDITED_FRAME_MAX_EDGE = 1600;

const loadImage = async (src: string): Promise<HTMLImageElement> => {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  if (typeof image.decode === "function") await image.decode();
  else
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("decode failed"));
    });
  if (!(image.naturalWidth > 0 && image.naturalHeight > 0))
    throw new Error("decode failed");
  return image;
};

export const renderEditedFrame = async (
  src: string,
  edit: MediaEdit,
  maxEdge = EDITED_FRAME_MAX_EDGE,
): Promise<EditedFrameImage> => {
  // Browsers draw an <img> in its display orientation (EXIF/irot), like the crop's frame.
  const image = await loadImage(src);
  const source = { width: image.naturalWidth, height: image.naturalHeight };
  const plan = drawPlan(source, edit, maxEdge);
  const canvas = document.createElement("canvas");
  canvas.width = plan.canvas.width;
  canvas.height = plan.canvas.height;
  try {
    const context = canvas.getContext("2d");
    if (context === null) throw new Error("canvas unavailable");
    context.scale(plan.scale, plan.scale);
    context.translate(plan.offset.x, plan.offset.y);
    context.translate(plan.origin.x, plan.origin.y);
    context.rotate(plan.radians);
    context.drawImage(image, 0, 0, source.width, source.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/png"),
    );
    if (blob === null) throw new Error("encode failed");
    const url = URL.createObjectURL(blob);
    let released = false;
    return {
      url,
      size: plan.canvas,
      release: () => {
        if (released) return;
        released = true;
        URL.revokeObjectURL(url);
      },
    };
  } finally {
    // Frees the backing store now instead of at garbage collection.
    canvas.width = 0;
    canvas.height = 0;
  }
};
