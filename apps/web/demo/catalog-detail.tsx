"use client";

import { useEffect, useRef, useState, type PointerEvent } from "react";

import {
  demoCatalogById,
  type DemoContentId,
  type DemoMedia,
} from "./demo-data";
import styles from "./demo.module.css";

import type { CatalogSummary, PublicMedia } from "@moya/contracts";

export type CatalogDetailTarget =
  | { readonly source: "demo"; readonly id: DemoContentId }
  | { readonly source: "real-summary"; readonly summary: CatalogSummary };

const icon = (name: string) => (
  <span aria-hidden="true" className="yoyi-icon" data-icon={name} />
);

const publicMedia = (value: PublicMedia | undefined): DemoMedia[] =>
  value === undefined
    ? []
    : [
        {
          id: String(value.id),
          src: value.src,
          alt: value.alt,
          width: value.width,
          height: value.height,
        },
      ];

const useSwipe = (onStep: (step: -1 | 1) => void) => {
  const gesture = useRef<{ x: number; y: number } | undefined>(undefined);
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      gesture.current = { x: event.clientX, y: event.clientY };
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const start = gesture.current;
      gesture.current = undefined;
      if (!start) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        onStep(dx < 0 ? 1 : -1);
      }
    },
  };
};

export function CatalogDetailSurface({
  target,
  onBack,
}: {
  target: CatalogDetailTarget;
  onBack: () => void;
}) {
  const demo =
    target.source === "demo" ? demoCatalogById.get(target.id) : undefined;
  const summary = target.source === "real-summary" ? target.summary : undefined;
  const title = demo?.title ?? summary?.title ?? "";
  const kind = demo?.kind ?? summary?.kind;
  const periodLabel = demo?.periodLabel ?? summary?.periodLabel;
  const aliases = demo?.aliases ?? summary?.aliases ?? [];
  const media = demo?.media ?? publicMedia(summary?.representativeMedia);
  const [mediaIndex, setMediaIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerScale, setViewerScale] = useState(1);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMediaIndex(0);
    setViewerOpen(false);
    setViewerScale(1);
    requestAnimationFrame(() => backRef.current?.focus());
  }, [target]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (viewerOpen) setViewerOpen(false);
        else onBack();
      } else if (event.key === "ArrowLeft") {
        setMediaIndex((value) => Math.max(0, value - 1));
      } else if (event.key === "ArrowRight") {
        setMediaIndex((value) => Math.min(media.length - 1, value + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [media.length, onBack, viewerOpen]);

  const stepMedia = (step: -1 | 1) =>
    setMediaIndex((value) =>
      Math.max(0, Math.min(media.length - 1, value + step)),
    );
  const swipe = useSwipe(stepMedia);
  const currentMedia = media[mediaIndex];

  const lifecycleId = target.source === "demo" ? String(target.id) : undefined;
  const lifecycle =
    lifecycleId !== undefined
      ? (
          {
            "d08-loading": ["正在加载档案", "status"],
            "d09-not-found": ["未找到档案", "status"],
            "d10-unavailable": ["档案服务暂时不可用", "status"],
            "d10-error": ["无法加载档案", "alert"],
          } as const
        )[lifecycleId]
      : undefined;

  if (lifecycle !== undefined) {
    return (
      <section
        aria-label="档案详情状态"
        className={styles.detail}
        data-catalog-detail
        data-detail-lifecycle={lifecycleId}
      >
        <header className={styles.detailTopBar}>
          <button
            aria-label="返回"
            className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md"
            onClick={onBack}
            ref={backRef}
            type="button"
          >
            {icon("back")}
          </button>
          <h1>档案详情</h1>
          <span aria-hidden="true" />
        </header>
        <div className={styles.detailLifecycle} role={lifecycle[1]}>
          {lifecycle[0]}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={`${title}详情`}
      className={styles.detail}
      data-catalog-detail
      data-detail-source={target.source}
    >
      <header className={styles.detailTopBar}>
        <button
          aria-label="返回"
          className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md"
          onClick={onBack}
          ref={backRef}
          type="button"
        >
          {icon("back")}
        </button>
        <h1>{title}</h1>
        <span aria-hidden="true" />
      </header>
      <main className={styles.detailScroll} data-detail-scroll>
        <div className={styles.detailComposition}>
          <section
            aria-label="图像"
            className={styles.detailMediaStage}
            onPointerDown={swipe.onPointerDown}
            onPointerUp={swipe.onPointerUp}
          >
            {currentMedia === undefined ? (
              <div
                className={styles.detailMediaFallback}
                role="img"
                aria-label="暂无公开图像"
              >
                暂无公开图像
              </div>
            ) : (
              <button
                aria-label="查看图像"
                className={styles.detailImageButton}
                onClick={() => setViewerOpen(true)}
                type="button"
              >
                <img
                  alt={currentMedia.alt}
                  height={currentMedia.height}
                  src={currentMedia.src}
                  width={currentMedia.width}
                />
              </button>
            )}
            {media.length > 1 ? (
              <>
                <span className={styles.mediaCounter}>
                  {mediaIndex + 1} / {media.length}
                </span>
                <button
                  aria-label="上一张"
                  className={`${styles.mediaArrow} ${styles.mediaArrowPrevious}`}
                  disabled={mediaIndex === 0}
                  onClick={() => stepMedia(-1)}
                  type="button"
                >
                  {icon("previous")}
                </button>
                <button
                  aria-label="下一张"
                  className={`${styles.mediaArrow} ${styles.mediaArrowNext}`}
                  disabled={mediaIndex === media.length - 1}
                  onClick={() => stepMedia(1)}
                  type="button"
                >
                  {icon("next")}
                </button>
                <div
                  aria-label="图像页码"
                  className={styles.mediaDots}
                  role="tablist"
                >
                  {media.map((item, index) => (
                    <button
                      aria-label={`第 ${index + 1} 张`}
                      aria-selected={index === mediaIndex}
                      key={item.id}
                      onClick={() => setMediaIndex(index)}
                      role="tab"
                      type="button"
                    />
                  ))}
                </div>
              </>
            ) : null}
          </section>

          <article className={styles.detailPaper}>
            <header className={styles.detailIdentity}>
              <p>{kind === "calligraphy" ? "书帖" : "碑刻"}</p>
              <h2>{title}</h2>
              {periodLabel ? <p>{periodLabel}</p> : null}
              {aliases.length > 0 ? <p>{aliases.join("、")}</p> : null}
            </header>
            {demo?.summary ? (
              <p className={styles.detailSummary}>{demo.summary}</p>
            ) : null}
            {demo?.description ? (
              <section
                aria-labelledby="detail-description-heading"
                className={styles.detailReading}
              >
                <h3 id="detail-description-heading">说明</h3>
                <p>{demo.description}</p>
              </section>
            ) : null}
            {demo?.facts && Object.keys(demo.facts).length > 0 ? (
              <section
                aria-labelledby="detail-facts-heading"
                className={styles.detailReading}
              >
                <h3 id="detail-facts-heading">基本资料</h3>
                <dl className={styles.facts}>
                  {Object.entries(demo.facts).map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}
            {demo?.sources.length ? (
              <section
                aria-labelledby="detail-sources-heading"
                className={styles.detailReading}
              >
                <h3 id="detail-sources-heading">资料来源</h3>
                <ol className={styles.sources}>
                  {demo.sources.map((source, index) => (
                    <li key={`${source.label}-${index}`}>
                      <strong>{source.label}</strong>
                      {source.citation ? <span>{source.citation}</span> : null}
                    </li>
                  ))}
                </ol>
              </section>
            ) : null}
          </article>
        </div>
      </main>

      {viewerOpen && currentMedia ? (
        <section
          aria-label="图像查看器"
          aria-modal="true"
          className={styles.viewer}
          data-media-viewer
          onPointerDown={swipe.onPointerDown}
          onPointerUp={swipe.onPointerUp}
          onWheel={(event) => {
            event.preventDefault();
            setViewerScale((value) =>
              Math.max(
                1,
                Math.min(4, value + (event.deltaY < 0 ? 0.25 : -0.25)),
              ),
            );
          }}
          role="dialog"
        >
          <button
            aria-label="关闭图像查看器"
            className={styles.viewerImageButton}
            onClick={() => setViewerOpen(false)}
            type="button"
          >
            <img
              alt={currentMedia.alt}
              height={currentMedia.height}
              src={currentMedia.src}
              style={{ transform: `scale(${viewerScale})` }}
              width={currentMedia.width}
            />
          </button>
          {media.length > 1 ? (
            <span className={styles.viewerCounter}>
              {mediaIndex + 1} / {media.length}
            </span>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
