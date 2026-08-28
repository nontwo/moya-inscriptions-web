"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon } from "@moya/ui";

import styles from "./catalog-detail.module.css";

import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import type { PublicMedia } from "@moya/contracts";
import type { PresentationPlatform } from "../shell/device-platform";

export const MEDIA_CAROUSEL_AXIS_LOCK_PX = 10;
export const MEDIA_CAROUSEL_SWIPE_DISTANCE_PX = 48;
export const MEDIA_CAROUSEL_FLING_PX_PER_MS = 0.55;
export const MEDIA_CAROUSEL_HORIZONTAL_RATIO = 1.25;
export const MEDIA_CAROUSEL_EDGE_RUBBER = 0.32;
export const MEDIA_CAROUSEL_CLICK_SUPPRESSION_MS = 500;
export const MEDIA_CAROUSEL_NATIVE_SETTLE_MS = 120;

type CarouselAxis = "horizontal" | "vertical" | null;

interface CarouselGesture {
  axis: CarouselAxis;
  readonly id: number;
  lastTime: number;
  lastX: number;
  readonly startX: number;
  readonly startY: number;
  readonly width: number;
}

type CarouselStyle = CSSProperties & {
  readonly "--carousel-index": number;
  readonly "--carousel-x": string;
};

export const resolveCarouselAxis = (
  horizontalDisplacement: number,
  verticalDisplacement: number,
): CarouselAxis => {
  if (
    Math.hypot(horizontalDisplacement, verticalDisplacement) <
    MEDIA_CAROUSEL_AXIS_LOCK_PX
  ) {
    return null;
  }
  return Math.abs(horizontalDisplacement) >
    Math.abs(verticalDisplacement) * MEDIA_CAROUSEL_HORIZONTAL_RATIO
    ? "horizontal"
    : "vertical";
};

export const shouldCommitCarouselSwipe = (
  horizontalDisplacement: number,
  width: number,
  velocity: number,
) =>
  Math.abs(horizontalDisplacement) >=
    Math.max(MEDIA_CAROUSEL_SWIPE_DISTANCE_PX, width * 0.18) ||
  Math.abs(velocity) >= MEDIA_CAROUSEL_FLING_PX_PER_MS;

export interface CatalogMediaCarouselProps {
  readonly activeIndex: number;
  readonly media: readonly PublicMedia[];
  readonly onActiveIndexChange: (index: number) => void;
  readonly onOpenViewer: (index: number, opener: HTMLElement) => void;
  readonly platform: PresentationPlatform;
}

export const CatalogMediaCarousel = ({
  activeIndex,
  media,
  onActiveIndexChange,
  onOpenViewer,
  platform,
}: CatalogMediaCarouselProps) => {
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [failedMediaIds, setFailedMediaIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const stageRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<CarouselGesture | null>(null);
  const activeIndexRef = useRef(activeIndex);
  const nativeProgrammaticIndexRef = useRef<number | null>(null);
  const nativeSettleTimerRef = useRef<number | null>(null);
  const nativeTouchActiveRef = useRef(false);
  const nativeTouchStartScrollLeftRef = useRef(0);
  const nativeViewportWidthRef = useRef(0);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);
  const nativePaging = platform !== "pc";
  activeIndexRef.current = activeIndex;

  const clearClickSuppression = () => {
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = null;
    }
    suppressClickRef.current = false;
  };

  const suppressCompletedGestureClick = () => {
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
    }
    suppressClickRef.current = true;
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, MEDIA_CAROUSEL_CLICK_SUPPRESSION_MS);
  };

  const clearNativeSettleTimer = () => {
    if (nativeSettleTimerRef.current !== null) {
      window.clearTimeout(nativeSettleTimerRef.current);
      nativeSettleTimerRef.current = null;
    }
  };

  const writeNativeScrollLeft = (
    index: number,
    behavior: ScrollBehavior = "auto",
  ) => {
    const stage = stageRef.current;
    if (stage === null || stage.clientWidth <= 0) return;
    const left = index * stage.clientWidth;
    if (behavior === "auto" || typeof stage.scrollTo !== "function") {
      stage.scrollLeft = left;
      return;
    }
    stage.scrollTo({ behavior, left });
  };

  useEffect(() => {
    setDragOffset(0);
    setDragging(false);
  }, [activeIndex]);

  useLayoutEffect(() => {
    if (!nativePaging) return;
    const stage = stageRef.current;
    if (stage === null) return;
    const synchronize = () => {
      if (nativeProgrammaticIndexRef.current === activeIndex) {
        nativeProgrammaticIndexRef.current = null;
        return;
      }
      const target = activeIndex * stage.clientWidth;
      if (Math.abs(stage.scrollLeft - target) > 1) stage.scrollLeft = target;
    };
    synchronize();
    nativeViewportWidthRef.current = stage.clientWidth;
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => {
      const width = stage.clientWidth;
      if (width === nativeViewportWidthRef.current) return;
      nativeViewportWidthRef.current = width;
      if (!nativeTouchActiveRef.current) synchronize();
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [activeIndex, media.length, nativePaging]);

  useEffect(() => {
    gestureRef.current = null;
    setFailedMediaIds(new Set());
  }, [media]);

  useEffect(
    () => () => {
      if (nativeSettleTimerRef.current !== null) {
        window.clearTimeout(nativeSettleTimerRef.current);
      }
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
    },
    [],
  );

  const selectIndex = (index: number, animateNative = true) => {
    const bounded = Math.min(Math.max(index, 0), media.length - 1);
    if (bounded === activeIndexRef.current) return;
    if (nativePaging && animateNative) {
      nativeProgrammaticIndexRef.current = bounded;
      const reducedMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      writeNativeScrollLeft(bounded, reducedMotion ? "auto" : "smooth");
    }
    onActiveIndexChange(bounded);
  };

  const settleNativeScroll = () => {
    clearNativeSettleTimer();
    if (!nativePaging || nativeTouchActiveRef.current) return;
    const stage = stageRef.current;
    if (stage === null || stage.clientWidth <= 0) return;
    const index = Math.min(
      Math.max(Math.round(stage.scrollLeft / stage.clientWidth), 0),
      media.length - 1,
    );
    selectIndex(index, false);
  };

  const scheduleNativeSettle = () => {
    clearNativeSettleTimer();
    nativeSettleTimerRef.current = window.setTimeout(
      settleNativeScroll,
      MEDIA_CAROUSEL_NATIVE_SETTLE_MS,
    );
  };

  const releaseCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // An interrupted pointer may already have released capture.
    }
  };

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.id !== event.pointerId) return;
    gestureRef.current = null;
    const dx = event.clientX - gesture.startX;
    const elapsed = Math.max(event.timeStamp - gesture.lastTime, 1);
    const velocity = (event.clientX - gesture.lastX) / elapsed;
    const moved = Math.hypot(dx, event.clientY - gesture.startY) >= 10;
    if (moved) suppressCompletedGestureClick();
    setDragging(false);
    setDragOffset(0);
    if (
      gesture.axis === "horizontal" &&
      shouldCommitCarouselSwipe(dx, gesture.width, velocity)
    ) {
      selectIndex(activeIndex + (dx < 0 ? 1 : -1));
    }
    releaseCapture(event);
  };

  const cancelGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.id !== event.pointerId) return;
    gestureRef.current = null;
    suppressCompletedGestureClick();
    setDragging(false);
    setDragOffset(0);
    releaseCapture(event);
  };

  if (media.length === 0) {
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

  const carouselStyle: CarouselStyle = {
    "--carousel-index": activeIndex,
    "--carousel-x": `${dragOffset}px`,
  };

  return (
    <section
      aria-label="图像轮播"
      className={styles.carousel}
      data-detail-media-carousel=""
      data-media-count={media.length}
      data-platform={platform}
    >
      <div
        ref={stageRef}
        className={styles.mainStage}
        data-detail-main-stage=""
        data-dragging={dragging ? "true" : undefined}
        data-native-paging={nativePaging ? "true" : "false"}
        onClickCapture={(event: ReactMouseEvent<HTMLDivElement>) => {
          if (!suppressClickRef.current) return;
          if (event.detail === 0) {
            clearClickSuppression();
            return;
          }
          clearClickSuppression();
          event.preventDefault();
          event.stopPropagation();
        }}
        onLostPointerCapture={(event) => {
          if (event.target !== event.currentTarget) return;
          if (gestureRef.current?.id === event.pointerId) cancelGesture(event);
        }}
        onPointerCancel={cancelGesture}
        onPointerDown={(event) => {
          if (
            nativePaging &&
            event.pointerType === "touch" &&
            event.nativeEvent.isTrusted
          ) {
            return;
          }
          if (!event.isPrimary || event.button !== 0) return;
          const target = event.target;
          if (
            target instanceof Element &&
            target.closest("[data-detail-media-control]") !== null
          ) {
            return;
          }
          clearClickSuppression();
          gestureRef.current = {
            axis: null,
            id: event.pointerId,
            lastTime: event.timeStamp,
            lastX: event.clientX,
            startX: event.clientX,
            startY: event.clientY,
            width: event.currentTarget.getBoundingClientRect().width,
          };
        }}
        onPointerMove={(event) => {
          const gesture = gestureRef.current;
          if (gesture === null || gesture.id !== event.pointerId) return;
          const dx = event.clientX - gesture.startX;
          const dy = event.clientY - gesture.startY;
          if (gesture.axis === null) {
            gesture.axis = resolveCarouselAxis(dx, dy);
            if (gesture.axis === "horizontal") {
              setDragging(true);
              try {
                event.currentTarget.setPointerCapture(event.pointerId);
              } catch {
                // Synthetic pointers may not support capture.
              }
            }
          }
          gesture.lastTime = event.timeStamp;
          gesture.lastX = event.clientX;
          if (gesture.axis !== "horizontal") return;
          event.preventDefault();
          const movingPastStart = activeIndex === 0 && dx > 0;
          const movingPastEnd = activeIndex === media.length - 1 && dx < 0;
          setDragOffset(
            movingPastStart || movingPastEnd
              ? dx * MEDIA_CAROUSEL_EDGE_RUBBER
              : dx,
          );
        }}
        onPointerUp={finishGesture}
        onScroll={() => {
          if (!nativePaging) return;
          if (
            nativeTouchActiveRef.current &&
            Math.abs(
              (stageRef.current?.scrollLeft ?? 0) -
                nativeTouchStartScrollLeftRef.current,
            ) >= 10
          ) {
            suppressCompletedGestureClick();
          }
          if (!nativeTouchActiveRef.current) scheduleNativeSettle();
        }}
        onTouchCancelCapture={() => {
          if (!nativePaging) return;
          nativeTouchActiveRef.current = false;
          clearNativeSettleTimer();
          const stage = stageRef.current;
          if (
            stage !== null &&
            Math.abs(
              stage.scrollLeft - nativeTouchStartScrollLeftRef.current,
            ) >= 10
          ) {
            suppressCompletedGestureClick();
          }
          writeNativeScrollLeft(activeIndexRef.current);
        }}
        onTouchEndCapture={() => {
          if (!nativePaging) return;
          nativeTouchActiveRef.current = false;
          const stage = stageRef.current;
          if (
            stage !== null &&
            Math.abs(
              stage.scrollLeft - nativeTouchStartScrollLeftRef.current,
            ) >= 10
          ) {
            suppressCompletedGestureClick();
          }
          scheduleNativeSettle();
        }}
        onTouchStartCapture={(event) => {
          if (!nativePaging || event.touches.length !== 1) return;
          clearClickSuppression();
          clearNativeSettleTimer();
          nativeTouchActiveRef.current = true;
          nativeTouchStartScrollLeftRef.current =
            stageRef.current?.scrollLeft ?? 0;
        }}
      >
        <div
          className={styles.mediaTrack}
          data-detail-media-track=""
          style={carouselStyle}
        >
          {media.map((item, index) => {
            const failed = failedMediaIds.has(item.id);
            const active = index === activeIndex;
            return (
              <div
                aria-hidden={!active}
                className={styles.mediaSlide}
                data-media-id={item.id}
                inert={!active || undefined}
                key={item.id}
              >
                <button
                  aria-label={failed ? "图像无法加载" : `查看图像：${item.alt}`}
                  className={styles.mainImageButton}
                  data-detail-main-image={active ? "" : undefined}
                  disabled={failed}
                  onClick={(event) => {
                    if (!suppressClickRef.current && active) {
                      onOpenViewer(index, event.currentTarget);
                    }
                  }}
                  tabIndex={active ? 0 : -1}
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
                    <img
                      alt={item.alt}
                      decoding="async"
                      draggable={false}
                      fetchPriority={active ? "high" : "auto"}
                      height={item.height}
                      loading={active ? "eager" : "lazy"}
                      onError={() => {
                        setFailedMediaIds((current) =>
                          new Set(current).add(item.id),
                        );
                      }}
                      src={item.src}
                      width={item.width}
                    />
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {media.length > 1 ? (
          <>
            <button
              aria-label="上一张图像"
              className={`${styles.carouselEdge} ${styles.carouselEdgePrevious}`}
              data-detail-media-control=""
              data-detail-media-previous=""
              disabled={activeIndex === 0}
              onClick={() => selectIndex(activeIndex - 1)}
              type="button"
            />
            <button
              aria-label="下一张图像"
              className={`${styles.carouselEdge} ${styles.carouselEdgeNext}`}
              data-detail-media-control=""
              data-detail-media-next=""
              disabled={activeIndex === media.length - 1}
              onClick={() => selectIndex(activeIndex + 1)}
              type="button"
            />
            <div
              aria-label="选择图像"
              className={styles.mediaDots}
              data-detail-media-control=""
              data-detail-media-dots=""
              role="group"
            >
              {media.map((item, index) => (
                <button
                  aria-current={index === activeIndex ? "true" : undefined}
                  aria-label={`第 ${index + 1} 张图像：${item.alt}`}
                  className={styles.mediaDotTarget}
                  data-active={index === activeIndex ? "true" : "false"}
                  data-detail-media-dot=""
                  key={item.id}
                  onClick={() => selectIndex(index)}
                  type="button"
                >
                  <span aria-hidden="true" />
                </button>
              ))}
            </div>
            <span className={styles.mediaCounter} data-detail-media-index="">
              {activeIndex + 1} / {media.length}
            </span>
          </>
        ) : null}
      </div>
    </section>
  );
};
