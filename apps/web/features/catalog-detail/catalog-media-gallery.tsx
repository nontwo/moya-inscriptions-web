"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./catalog-detail-screen.module.css";

import type { PublicMedia } from "@moya/contracts";

export interface CatalogMediaGalleryProps {
  media: readonly PublicMedia[];
}

export const CatalogMediaGallery = ({ media }: CatalogMediaGalleryProps) => {
  const [index, setIndex] = useState(0);
  const [failedMediaId, setFailedMediaId] = useState<string>();
  const imageRef = useRef<HTMLImageElement>(null);
  const item = media[index];

  useEffect(() => {
    const image = imageRef.current;
    if (image === null || item === undefined) return;

    const markFailed = () => setFailedMediaId(item.id);
    if (image.complete) {
      if (image.naturalWidth === 0) markFailed();
      return;
    }

    image.addEventListener("error", markFailed, { once: true });
    return () => image.removeEventListener("error", markFailed);
  }, [item]);

  if (item === undefined) return null;

  const selectMedia = (nextIndex: number) => {
    setFailedMediaId(undefined);
    setIndex(nextIndex);
  };
  const multipleMedia = media.length > 1;
  const failed = failedMediaId === item.id;

  return (
    <section aria-label="图像" className={styles.gallery}>
      <div className={styles.mediaFrame}>
        {failed ? (
          <p className={styles.mediaFailure} role="status">
            图像暂时无法加载
          </p>
        ) : (
          <img
            alt={item.alt}
            className={styles.media}
            height={item.height}
            onError={() => setFailedMediaId(item.id)}
            ref={imageRef}
            src={item.src}
            width={item.width}
          />
        )}
        {multipleMedia ? (
          <p aria-live="polite" className={styles.mediaPosition}>
            {index + 1} / {media.length}
          </p>
        ) : null}
      </div>
      {multipleMedia ? (
        <div className={styles.galleryControls}>
          <button
            aria-label="上一张图像"
            className={styles.galleryButton}
            disabled={index === 0}
            onClick={() => selectMedia(index - 1)}
            type="button"
          >
            上一张
          </button>
          <div aria-label="图像位置" className={styles.galleryDots} role="group">
            {media.map((entry, entryIndex) => (
              <button
                aria-current={entryIndex === index ? "true" : undefined}
                aria-label={`第 ${entryIndex + 1} 张图像`}
                className={styles.galleryDot}
                key={entry.id}
                onClick={() => selectMedia(entryIndex)}
                type="button"
              />
            ))}
          </div>
          <button
            aria-label="下一张图像"
            className={styles.galleryButton}
            disabled={index === media.length - 1}
            onClick={() => selectMedia(index + 1)}
            type="button"
          >
            下一张
          </button>
        </div>
      ) : null}
    </section>
  );
};
