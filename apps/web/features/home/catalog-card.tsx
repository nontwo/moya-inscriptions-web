"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@moya/ui";

import styles from "./home-screen.module.css";
import { QuickActionCardAction } from "../quick-actions/quick-action-card-action";

import type { CSSProperties } from "react";
import type { CatalogSummary, PublicMedia } from "@moya/contracts";

export type CatalogCardVariant = "feed" | "inscription";

export interface CatalogCardProps {
  readonly item: CatalogSummary;
  readonly onMediaSettled?: () => void;
  readonly onOpenCatalog?: (
    item: CatalogSummary,
    opener: HTMLButtonElement,
  ) => void;
  readonly variant: CatalogCardVariant;
}

type CatalogMediaDimensions = Pick<PublicMedia, "height" | "width">;

export const isUltraWideCatalogMedia = (
  media: CatalogMediaDimensions | undefined,
): boolean => {
  if (media === undefined) return false;
  const { height, width } = media;
  return (
    Number.isFinite(height) &&
    Number.isFinite(width) &&
    height > 0 &&
    width > 0 &&
    width / height >= 2.4
  );
};

const catalogKindLabels = {
  calligraphy: "书帖",
  inscription: "碑刻",
} as const satisfies Record<CatalogSummary["kind"], string>;

const MediaFallback = ({
  aspectRatio,
  label,
  state,
}: {
  readonly aspectRatio?: string;
  readonly label: string;
  readonly state: "failed" | "missing";
}) => (
  <div
    aria-label={label}
    className={styles.mediaFallback}
    data-catalog-media-state={state}
    role="img"
    style={
      aspectRatio === undefined
        ? undefined
        : ({ aspectRatio } satisfies CSSProperties)
    }
  >
    <Icon aria-hidden="true" name={state === "failed" ? "error" : "image"} />
    <span>{state === "failed" ? "图像无法加载" : "暂无公开图像"}</span>
  </div>
);

const CatalogCardMedia = ({
  media,
  onMediaSettled,
  title,
  variant,
}: {
  readonly media: PublicMedia | undefined;
  readonly onMediaSettled?: () => void;
  readonly title: string;
  readonly variant: CatalogCardVariant;
}) => {
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const image = imageRef.current;
    if (image?.complete === true && image.naturalWidth === 0) {
      setFailed(true);
      onMediaSettled?.();
    }
  }, [media, onMediaSettled]);

  if (media === undefined) {
    return <MediaFallback label={`暂无公开图像：${title}`} state="missing" />;
  }
  if (failed) {
    return (
      <MediaFallback
        {...(variant === "feed"
          ? { aspectRatio: `${media.width} / ${media.height}` }
          : {})}
        label={`图像无法加载：${title}`}
        state="failed"
      />
    );
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
        onError={() => {
          setFailed(true);
          onMediaSettled?.();
        }}
        onLoad={onMediaSettled}
        src={media.src}
        width={media.width}
      />
    </div>
  );
};

export const CatalogCard = ({
  item,
  onMediaSettled,
  onOpenCatalog,
  variant,
}: CatalogCardProps) => {
  const feedSpan =
    variant === "feed" && isUltraWideCatalogMedia(item.representativeMedia)
      ? "full"
      : undefined;
  const metadata = [catalogKindLabels[item.kind], item.periodLabel]
    .filter((value) => value !== undefined)
    .join(" · ");

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
      <CatalogCardMedia
        media={item.representativeMedia}
        {...(onMediaSettled === undefined ? {} : { onMediaSettled })}
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
      {onOpenCatalog === undefined ? null : (
        <QuickActionCardAction
          className={styles.cardAction}
          enabled={variant === "feed"}
          item={item}
          onOpenCatalog={onOpenCatalog}
        />
      )}
    </article>
  );
};
