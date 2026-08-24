"use client";

import { useEffect, useRef, useState } from "react";

import { Icon } from "@moya/ui";

import { isUltraWideCatalogMedia } from "../catalog/media-layout";
import styles from "./catalog-detail.module.css";

import type { PointerEvent as ReactPointerEvent } from "react";
import type { CSSProperties } from "react";
import type { PublicMedia } from "@moya/contracts";
import type { PresentationPlatform } from "../shell/device-platform";

interface GalleryPointerGesture {
  readonly id: number;
  readonly startX: number;
  readonly startY: number;
}

const GALLERY_SWIPE_THRESHOLD_PX = 44;

export interface CatalogGalleryProps {
  readonly activeIndex: number;
  readonly media: readonly PublicMedia[];
  readonly onActiveIndexChange: (index: number) => void;
  readonly onOpenViewer: (index: number, opener: HTMLElement) => void;
  readonly platform: PresentationPlatform;
}

const GalleryImage = ({
  eager = false,
  media,
  onError,
}: {
  readonly eager?: boolean;
  readonly media: PublicMedia;
  readonly onError: () => void;
}) => (
  <img
    alt={media.alt}
    decoding="async"
    fetchPriority={eager ? "high" : "auto"}
    height={media.height}
    loading={eager ? "eager" : "lazy"}
    onError={onError}
    src={media.src}
    width={media.width}
  />
);

export const CatalogGallery = ({
  activeIndex,
  media,
  onActiveIndexChange,
  onOpenViewer,
  platform,
}: CatalogGalleryProps) => {
  const [failedMediaIds, setFailedMediaIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const gestureRef = useRef<GalleryPointerGesture | null>(null);
  const active = media[activeIndex];

  useEffect(() => {
    setFailedMediaIds(new Set());
    gestureRef.current = null;
  }, [media]);

  const markFailed = (id: string) => {
    setFailedMediaIds((current) => new Set(current).add(id));
  };

  const selectAdjacent = (step: -1 | 1) => {
    const nextIndex = Math.min(
      Math.max(activeIndex + step, 0),
      Math.max(media.length - 1, 0),
    );
    if (nextIndex !== activeIndex) onActiveIndexChange(nextIndex);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    gestureRef.current = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (gesture === null || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.startX;
    const dy = event.clientY - gesture.startY;
    if (
      Math.abs(dx) < GALLERY_SWIPE_THRESHOLD_PX ||
      Math.abs(dx) <= Math.abs(dy)
    ) {
      return;
    }
    selectAdjacent(dx < 0 ? 1 : -1);
  };

  if (active === undefined) {
    return (
      <section
        aria-label="图像"
        className={styles.missingMedia}
        data-detail-media-state="missing"
      >
        <Icon aria-hidden="true" name="image" />
        <p>暂无公开图像</p>
      </section>
    );
  }

  const activeFailed = failedMediaIds.has(active.id);

  return (
    <section
      aria-label="图像 Gallery"
      className={styles.gallery}
      data-detail-gallery=""
      data-gallery-count={media.length}
      data-platform={platform}
    >
      <div
        className={styles.mainStage}
        data-detail-main-stage=""
        onPointerCancel={() => {
          gestureRef.current = null;
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
      >
        <button
          aria-label={activeFailed ? "图像无法加载" : `查看图像：${active.alt}`}
          className={styles.mainImageButton}
          data-detail-main-image=""
          disabled={activeFailed}
          onClick={(event) => onOpenViewer(activeIndex, event.currentTarget)}
          type="button"
        >
          {activeFailed ? (
            <span
              className={styles.mediaError}
              data-detail-media-state="failed"
            >
              <Icon aria-hidden="true" name="error" />
              图像无法加载
            </span>
          ) : (
            <GalleryImage
              eager
              media={active}
              onError={() => markFailed(active.id)}
            />
          )}
        </button>

        {media.length > 1 ? (
          <>
            <span
              aria-live="polite"
              className={styles.mediaCounter}
              data-detail-media-index=""
            >
              {activeIndex + 1}/{media.length}
            </span>
            <button
              aria-label="上一张图像"
              className={`${styles.galleryEdge} ${styles.galleryEdgePrevious}`}
              data-detail-media-previous=""
              disabled={activeIndex === 0}
              onClick={() => selectAdjacent(-1)}
              type="button"
            />
            <button
              aria-label="下一张图像"
              className={`${styles.galleryEdge} ${styles.galleryEdgeNext}`}
              data-detail-media-next=""
              disabled={activeIndex === media.length - 1}
              onClick={() => selectAdjacent(1)}
              type="button"
            />
          </>
        ) : null}
      </div>

      {media.length > 1 ? (
        <div
          aria-label="Gallery 缩略图"
          className={styles.thumbnailGrid}
          data-detail-thumbnail-grid=""
          role="group"
        >
          {media.map((item, index) => {
            const failed = failedMediaIds.has(item.id);
            const selected = index === activeIndex;
            return (
              <button
                aria-current={selected ? "true" : undefined}
                aria-label={`选择第 ${index + 1} 张图像：${item.alt}`}
                className={styles.thumbnail}
                data-gallery-span={
                  isUltraWideCatalogMedia(item) ? "full" : "single"
                }
                data-media-id={item.id}
                data-selected={selected ? "true" : "false"}
                key={item.id}
                onClick={() => onActiveIndexChange(index)}
                style={
                  {
                    "--media-aspect-ratio": `${item.width} / ${item.height}`,
                  } as CSSProperties
                }
                type="button"
              >
                {failed ? (
                  <span
                    className={styles.mediaError}
                    data-detail-media-state="failed"
                  >
                    <Icon aria-hidden="true" name="error" />
                    图像无法加载
                  </span>
                ) : (
                  <GalleryImage
                    media={item}
                    onError={() => markFailed(item.id)}
                  />
                )}
                <span className={styles.visuallyHidden}>
                  {selected ? "当前图像" : ""}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
};
