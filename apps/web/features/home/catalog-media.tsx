"use client";

import { useState, type CSSProperties } from "react";

import { Icon } from "@moya/ui";
import styles from "./home-screen.module.css";

import type { PublicMedia } from "@moya/contracts";

export interface CatalogMediaProps {
  media?: PublicMedia | undefined;
}

const mediaRatio = (media: PublicMedia): CSSProperties => ({
  aspectRatio: `${media.width} / ${media.height}`,
});

const MediaFallback = ({ media }: CatalogMediaProps) => (
  <div
    className={styles.mediaFallback}
    data-media-state={media === undefined ? "missing" : "unavailable"}
    style={media === undefined ? undefined : mediaRatio(media)}
  >
    <Icon name="image" size="lg" />
    <span>{media === undefined ? "暂无公开图像" : "图像暂不可用"}</span>
  </div>
);

export function CatalogMedia({ media }: CatalogMediaProps) {
  const [failed, setFailed] = useState(false);

  if (media === undefined || failed) {
    return <MediaFallback media={media} />;
  }

  return (
    <div className={styles.mediaFrame} style={mediaRatio(media)}>
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
    </div>
  );
}
