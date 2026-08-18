"use client";

import { useState } from "react";

import styles from "./home-screen.module.css";

import type { PublicMedia } from "@moya/contracts";

const MediaFallback = () => (
  <span className={styles.mediaFallback} data-media-fallback>
    <span className="yoyi-visually-hidden">暂无公开图像</span>
  </span>
);

export function CatalogMedia({ media }: { media: PublicMedia | undefined }) {
  const [failed, setFailed] = useState(false);

  if (media === undefined || failed) return <MediaFallback />;

  return (
    <img
      alt={media.alt}
      className={styles.media}
      decoding="async"
      height={media.height}
      loading="lazy"
      onError={() => setFailed(true)}
      src={media.src}
      width={media.width}
    />
  );
}
