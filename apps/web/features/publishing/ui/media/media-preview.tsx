"use client";

import { useEffect, useState } from "react";

import { sharedPreviewCache } from "./bounded-preview";
import { previewPlacement } from "./media-geometry";
import styles from "./media.module.css";

import type { BoundedImage, PreviewCache } from "./bounded-preview";
import type { Size } from "./media-geometry";
import type { MediaEdit } from "@moya/contracts";
import type { CSSProperties } from "react";

export interface BoundedPreviewState {
  /** `loading` until the shared preview of this Blob is known. */
  readonly status: "idle" | "loading" | "ready";
  readonly url: string | null;
  readonly size: Size | null;
}

/**
 * A bounded preview of a local Blob (see bounded-preview.ts): decoded once
 * at `maxEdge`, shared between users of the same Blob, released when the
 * Blob is replaced or the component unmounts.
 */
export const useBoundedPreview = (
  blob: Blob | null,
  maxEdge: number,
  cache: PreviewCache = sharedPreviewCache(),
): BoundedPreviewState => {
  const [shown, setShown] = useState<{
    readonly blob: Blob;
    readonly maxEdge: number;
    readonly image: BoundedImage | null;
  } | null>(null);
  useEffect(() => {
    if (blob === null) return;
    const handle = cache.acquire(blob, maxEdge);
    let active = true;
    void handle.result.then((image) => {
      if (active) setShown({ blob, maxEdge, image });
    });
    return () => {
      active = false;
      handle.release();
    };
  }, [blob, maxEdge, cache]);
  if (blob === null) return { status: "idle", url: null, size: null };
  if (shown === null || shown.blob !== blob || shown.maxEdge !== maxEdge)
    return { status: "loading", url: null, size: null };
  return {
    status: "ready",
    url: shown.image?.url ?? null,
    size: shown.image?.size ?? null,
  };
};

/**
 * A still shown in its edited frame (rotation, then crop) without drawing
 * pixels: the rotated frame is placed inside a box of the edited aspect.
 * Falls back to a neutral label when the browser cannot decode the source
 * (e.g. HEIC outside WebKit) or no source exists yet.
 */
export const EditedImage = ({
  src,
  edit,
  fallback,
  knownSize = null,
}: {
  readonly src: string | null;
  readonly edit: MediaEdit;
  /** Shown instead of the image (decorative; the owner labels the item). */
  readonly fallback: string;
  readonly knownSize?: Size | null;
}) => {
  const [loaded, setLoaded] = useState<{
    readonly src: string;
    readonly size: Size;
  } | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (src === null || failedSrc === src)
    return (
      <span aria-hidden="true" className={styles.previewFallback}>
        {fallback}
      </span>
    );
  const size = loaded?.src === src ? loaded.size : knownSize;
  const placement =
    size !== null && size.width > 0 && size.height > 0
      ? previewPlacement(size, edit)
      : null;
  const boxStyle: CSSProperties | undefined = placement
    ? { aspectRatio: String(placement.aspectRatio) }
    : undefined;
  return (
    <span
      className={styles.previewBox}
      data-orientation={
        placement === null
          ? "unknown"
          : placement.aspectRatio >= 1
            ? "landscape"
            : "portrait"
      }
      style={boxStyle}
    >
      <span
        className={styles.previewFrame}
        style={placement?.frame}
        data-rotation={placement?.rotation ?? 0}
      >
        <img
          alt=""
          className={styles.previewImage}
          decoding="async"
          draggable={false}
          loading="lazy"
          onError={() => setFailedSrc(src)}
          onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth > 0 && image.naturalHeight > 0)
              setLoaded({
                src,
                size: {
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                },
              });
          }}
          src={src}
        />
      </span>
    </span>
  );
};
