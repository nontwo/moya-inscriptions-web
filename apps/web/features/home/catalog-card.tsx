"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@moya/ui";

import { isUltraWideCatalogMedia } from "../catalog/media-layout";
import styles from "./home-screen.module.css";

import type { CatalogSummary, PublicMedia } from "@moya/contracts";

export { isUltraWideCatalogMedia } from "../catalog/media-layout";

export type CatalogCardVariant = "feed" | "inscription";

export interface CatalogCardProps {
  readonly item: CatalogSummary;
  readonly onOpen?: ((opener: HTMLElement) => void) | undefined;
  readonly variant: CatalogCardVariant;
}

const catalogKindLabels = {
  calligraphy: "书帖",
  inscription: "碑刻",
} as const satisfies Record<CatalogSummary["kind"], string>;

const MediaFallback = ({
  label,
  state,
}: {
  readonly label: string;
  readonly state: "failed" | "missing";
}) => (
  <div
    aria-label={label}
    className={styles.mediaFallback}
    data-catalog-media-state={state}
    role="img"
  >
    <Icon aria-hidden="true" name={state === "failed" ? "error" : "image"} />
    <span>{state === "failed" ? "图像无法加载" : "暂无公开图像"}</span>
  </div>
);

const CatalogCardMedia = ({
  media,
  title,
  variant,
}: {
  readonly media: PublicMedia | undefined;
  readonly title: string;
  readonly variant: CatalogCardVariant;
}) => {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete === true && image.naturalWidth === 0) {
      setFailed(true);
    }
  }, [media]);

  if (media === undefined) {
    return <MediaFallback label={`暂无公开图像：${title}`} state="missing" />;
  }

  if (failed) {
    return <MediaFallback label={`图像无法加载：${title}`} state="failed" />;
  }

  return (
    <div
      className={`${styles.media} ${
        variant === "inscription" ? styles.inscriptionMedia : styles.feedMedia
      }`}
      data-catalog-media-state="valid"
    >
      <img
        ref={imageRef}
        alt={media.alt}
        decoding="async"
        height={media.height}
        loading="lazy"
        onError={() => setFailed(true)}
        src={media.src}
        width={media.width}
      />
    </div>
  );
};

export const CatalogCard = ({ item, onOpen, variant }: CatalogCardProps) => {
  const mediaKey = item.representativeMedia?.id ?? `${item.id}-missing-media`;
  const feedSpan =
    variant === "feed" && isUltraWideCatalogMedia(item.representativeMedia)
      ? "full"
      : undefined;
  const metadata = [catalogKindLabels[item.kind], item.periodLabel]
    .filter((value) => value !== undefined)
    .join(" · ");

  const content = (
    <>
      <CatalogCardMedia
        key={mediaKey}
        media={item.representativeMedia}
        title={item.title}
        variant={variant}
      />
      <div className={styles.cardBody}>
        <h3 className={styles.cardTitle}>{item.title}</h3>
        <p className={styles.cardMetadata}>{metadata}</p>
        {variant === "inscription" && item.summary !== undefined ? (
          <p className={styles.cardSummary}>{item.summary}</p>
        ) : null}
      </div>
    </>
  );

  return (
    <article
      className={`${styles.card} ${
        variant === "inscription" ? styles.inscriptionCard : styles.feedCard
      }`}
      data-catalog-card=""
      data-catalog-card-variant={variant}
      data-catalog-feed-span={feedSpan}
      data-catalog-id={item.id}
      data-catalog-kind={item.kind}
      role={variant === "feed" ? "listitem" : undefined}
    >
      {onOpen === undefined ? (
        content
      ) : (
        <button
          aria-label={`查看${item.title}详情`}
          className={styles.cardAction}
          data-open-catalog-detail=""
          onClick={(event) => onOpen(event.currentTarget)}
          type="button"
        >
          {content}
        </button>
      )}
    </article>
  );
};
