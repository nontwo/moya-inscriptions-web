"use client";

import { useState } from "react";

import { Icon } from "@moya/ui";

import styles from "./home-screen.module.css";

import type { NearbyCard } from "./home-feed";

export const HomeContentCard = ({
  item,
  onMediaSettled,
}: {
  readonly item: NearbyCard;
  readonly onMediaSettled?: () => void;
}) => {
  const [failed, setFailed] = useState(false);
  const media = item.media;

  return (
    <article
      className={`${styles.card} ${styles.feedCard}`}
      data-home-content-card=""
      data-home-content-id={item.id}
      role="listitem"
    >
      {media === undefined || failed ? (
        <div
          aria-label={
            failed ? `图像无法加载：${item.title}` : `暂无图像：${item.title}`
          }
          className={styles.mediaFallback}
          data-catalog-media-state={failed ? "failed" : "missing"}
          role="img"
        >
          <Icon aria-hidden="true" name={failed ? "error" : "image"} />
          <span>{failed ? "图像无法加载" : "暂无图像"}</span>
        </div>
      ) : (
        <div className={`${styles.media} ${styles.feedMedia}`}>
          <img
            alt={media.alt}
            decoding="async"
            height={media.height}
            loading="lazy"
            onError={() => {
              setFailed(true);
              onMediaSettled?.();
            }}
            onLoad={onMediaSettled}
            src={media.src}
            width={media.width}
          />
        </div>
      )}
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{item.title}</h3>
        {item.metadata === undefined ? null : (
          <p className={styles.cardMetadata}>{item.metadata}</p>
        )}
      </div>
    </article>
  );
};
