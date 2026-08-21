"use client";

import { useEffect, useRef, useState } from "react";

import {
  classifyFocusWheel,
  containedImagePanBounds,
  dynamicFocusMaxScale,
  edgeCarouselDelta,
  lockGalleryGestureAxis,
  recentPointerVelocity,
  shouldCommitGallerySwipe,
  shouldSuppressFocusOpen,
  wheelGestureDelta,
  zoomFocusAt,
} from "./catalog-detail-gallery-math";
import styles from "./catalog-detail-screen.module.css";

export interface CatalogMediaGalleryProps {
  media: readonly {
    alt: string;
    height?: number;
    key: string;
    src: string;
    width?: number;
  }[];
}

const settleMs = 220;
const wheelIdleMs = 24;
const wheelIgnoreMs = 180;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const canOpenCatalogMediaFocus = (failed: boolean) => !failed;

export const CatalogMediaGallery = ({ media }: CatalogMediaGalleryProps) => {
  const [index, setIndex] = useState(0);
  const [failedKey, setFailedKey] = useState<string>();
  const [dragX, setDragX] = useState(0);
  const [settling, setSettling] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focusScale, setFocusScale] = useState(1);
  const [focusPan, setFocusPan] = useState({ x: 0, y: 0 });
  const [focusDragX, setFocusDragX] = useState(0);
  const [focusSettling, setFocusSettling] = useState(false);
  const [focusPagerVisible, setFocusPagerVisible] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLDivElement>(null);
  const focusStageRef = useRef<HTMLDivElement>(null);
  const focusImageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<
    | {
        axis: "horizontal" | "vertical" | null;
        id: number;
        lastTime: number;
        lastX: number;
        startedAt: number;
        startX: number;
        startY: number;
      }
    | undefined
  >(undefined);
  const suppressClick = useRef(false);
  const focusClosedAt = useRef(Number.NEGATIVE_INFINITY);
  const focusPagerTimer = useRef<number | undefined>(undefined);
  const focusPointers = useRef(new Map<number, { x: number; y: number }>());
  const focusGesture = useRef<
    | {
        axis: "horizontal" | "vertical" | null;
        carouselDelta: number;
        carouselDragging: boolean;
        distance?: number;
        lastTime: number;
        lastX: number;
        moved: boolean;
        originPan: { x: number; y: number };
        startedAt: number;
        startX: number;
        startY: number;
      }
    | undefined
  >(undefined);
  const wheel = useRef<{ startedAt: number; totalX: number } | undefined>(
    undefined,
  );
  const wheelTimer = useRef<number | undefined>(undefined);
  const wheelIgnoreUntil = useRef(0);
  const item = media[index];

  useEffect(() => {
    setIndex((current) => clamp(current, 0, Math.max(0, media.length - 1)));
  }, [media.length]);

  useEffect(() => {
    if (!focusOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeFocus();
      if (event.key === "ArrowLeft") focusMove(-1);
      if (event.key === "ArrowRight") focusMove(1);
    };
    window.addEventListener("keydown", onKeyDown);
    focusRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    if (!focusOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [focusOpen]);

  useEffect(
    () => () => {
      if (focusPagerTimer.current !== undefined)
        window.clearTimeout(focusPagerTimer.current);
      if (wheelTimer.current !== undefined)
        window.clearTimeout(wheelTimer.current);
    },
    [],
  );

  if (item === undefined) return null;

  const resetFocusTransform = () => {
    setFocusScale(1);
    setFocusPan({ x: 0, y: 0 });
  };

  const revealFocusPager = () => {
    setFocusPagerVisible(true);
    if (focusPagerTimer.current !== undefined)
      window.clearTimeout(focusPagerTimer.current);
    focusPagerTimer.current = window.setTimeout(() => {
      setFocusPagerVisible(false);
      focusPagerTimer.current = undefined;
    }, 2000);
  };

  const closeFocus = () => {
    focusClosedAt.current = Date.now();
    setFocusOpen(false);
    setFocusPagerVisible(false);
    resetFocusTransform();
  };

  const focusStageSize = () => {
    const stage = focusStageRef.current;
    if (stage === null) return { height: 1, left: 0, top: 0, width: 1 };
    const style = window.getComputedStyle(stage);
    const rect = stage.getBoundingClientRect();
    const leftPadding = Number.parseFloat(style.paddingLeft) || 0;
    const topPadding = Number.parseFloat(style.paddingTop) || 0;
    return {
      height: Math.max(
        1,
        stage.clientHeight -
          topPadding -
          (Number.parseFloat(style.paddingBottom) || 0),
      ),
      width: Math.max(
        1,
        stage.clientWidth -
          leftPadding -
          (Number.parseFloat(style.paddingRight) || 0),
      ),
      left: rect.left + leftPadding,
      top: rect.top + topPadding,
    };
  };

  const naturalSize = () => ({
    height: focusImageRef.current?.naturalHeight || item.height || 1,
    width: focusImageRef.current?.naturalWidth || item.width || 1,
  });

  const selectMedia = (nextIndex: number) => {
    setFailedKey(undefined);
    setIndex(clamp(nextIndex, 0, media.length - 1));
    resetFocusTransform();
    if (focusOpen) revealFocusPager();
  };

  const multipleMedia = media.length > 1;
  const failed = failedKey === item.key;

  const move = (step: number) => {
    if (!multipleMedia || settling) return false;
    const nextIndex = index + step;
    if (nextIndex < 0 || nextIndex >= media.length) return false;
    const width = frameRef.current?.clientWidth ?? 1;
    setSettling(true);
    setDragX(step > 0 ? -width : width);
    window.setTimeout(() => {
      selectMedia(nextIndex);
      setDragX(0);
      setSettling(false);
    }, settleMs);
    return true;
  };

  const focusMove = (step: number) => {
    if (!multipleMedia || focusSettling) return false;
    const nextIndex = index + step;
    if (nextIndex < 0 || nextIndex >= media.length) return false;
    const width = focusRef.current?.clientWidth ?? 1;
    setFocusSettling(true);
    setFocusDragX(step > 0 ? -width : width);
    window.setTimeout(() => {
      selectMedia(nextIndex);
      setFocusDragX(0);
      setFocusSettling(false);
    }, settleMs);
    return true;
  };

  const rebound = (focus = false) => {
    if (focus) {
      setFocusSettling(true);
      setFocusDragX(0);
      window.setTimeout(() => setFocusSettling(false), settleMs);
      return;
    }
    setSettling(true);
    setDragX(0);
    window.setTimeout(() => setSettling(false), settleMs);
  };

  const settleWheel = (focus = false) => {
    const gesture = wheel.current;
    wheel.current = undefined;
    wheelTimer.current = undefined;
    if (gesture === undefined) return;
    const deltaX = gesture.totalX;
    const committed = shouldCommitGallerySwipe({
      deltaX,
      deltaY: 0,
      duration: performance.now() - gesture.startedAt,
      index,
      total: media.length,
      width: (focus ? focusRef : frameRef).current?.clientWidth ?? 1,
    });
    wheelIgnoreUntil.current = performance.now() + wheelIgnoreMs;
    if (
      committed &&
      (focus ? focusMove(deltaX < 0 ? 1 : -1) : move(deltaX < 0 ? 1 : -1))
    )
      return;
    rebound(focus);
  };

  const accumulateWheel = (event: React.WheelEvent, focus = false) => {
    if (!multipleMedia || performance.now() < wheelIgnoreUntil.current) return;
    const deltaX = wheelGestureDelta({
      deltaMode: event.deltaMode,
      deltaX: event.deltaX,
    });
    if (deltaX === 0) return;
    const gesture =
      wheel.current ??
      (wheel.current = { startedAt: performance.now(), totalX: 0 });
    gesture.totalX += deltaX;
    const atEdge =
      (index === 0 && gesture.totalX > 0) ||
      (index === media.length - 1 && gesture.totalX < 0);
    if (focus) setFocusDragX(atEdge ? gesture.totalX * 0.32 : gesture.totalX);
    else setDragX(atEdge ? gesture.totalX * 0.32 : gesture.totalX);
    if (wheelTimer.current !== undefined)
      window.clearTimeout(wheelTimer.current);
    wheelTimer.current = window.setTimeout(
      () => settleWheel(focus),
      wheelIdleMs,
    );
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    drag.current = {
      axis: null,
      id: event.pointerId,
      lastTime: event.timeStamp,
      lastX: event.clientX,
      startedAt: event.timeStamp,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId || !multipleMedia) return;
    const x = event.clientX - current.startX;
    const y = event.clientY - current.startY;
    current.axis ??= lockGalleryGestureAxis(x, y);
    if (current.axis !== "horizontal") return;
    event.preventDefault();
    suppressClick.current = true;
    const atEdge =
      (index === 0 && x > 0) || (index === media.length - 1 && x < 0);
    setDragX(atEdge ? x * 0.32 : x);
    current.lastTime = event.timeStamp;
    current.lastX = event.clientX;
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = undefined;
    if (current.axis !== "horizontal") return;
    const x = event.clientX - current.startX;
    const y = event.clientY - current.startY;
    const committed = shouldCommitGallerySwipe({
      deltaX: x,
      deltaY: y,
      duration: event.timeStamp - current.startedAt,
      index,
      total: media.length,
      velocity: recentPointerVelocity({
        currentTime: event.timeStamp,
        currentX: event.clientX,
        lastTime: current.lastTime,
        lastX: current.lastX,
        startTime: current.startedAt,
        startX: current.startX,
      }),
      width: frameRef.current?.clientWidth ?? 1,
    });
    const next = x < 0;
    if (committed) move(next ? 1 : -1);
    else rebound();
  };

  const openFocus = () => {
    if (
      !canOpenCatalogMediaFocus(failed) ||
      suppressClick.current ||
      shouldSuppressFocusOpen(focusClosedAt.current, Date.now())
    ) {
      suppressClick.current = false;
      return;
    }
    setFocusOpen(true);
    revealFocusPager();
  };

  const onFocusPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    focusPointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pointers = [...focusPointers.current.values()];
    revealFocusPager();
    const gesture = {
      axis: null as "horizontal" | "vertical" | null,
      carouselDelta: 0,
      carouselDragging: false,
      lastTime: event.timeStamp,
      lastX: event.clientX,
      moved: false,
      originPan: focusPan,
      startedAt: event.timeStamp,
      startX: event.clientX,
      startY: event.clientY,
    };
    if (pointers.length === 2) {
      focusGesture.current = {
        ...gesture,
        moved: true,
        distance: Math.hypot(
          pointers[0]!.x - pointers[1]!.x,
          pointers[0]!.y - pointers[1]!.y,
        ),
      };
    } else focusGesture.current = gesture;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onFocusPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!focusPointers.current.has(event.pointerId)) return;
    focusPointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pointers = [...focusPointers.current.values()];
    const gesture = focusGesture.current;
    if (gesture === undefined) return;
    if (pointers.length === 2 && gesture.distance !== undefined) {
      const distance = Math.hypot(
        pointers[0]!.x - pointers[1]!.x,
        pointers[0]!.y - pointers[1]!.y,
      );
      const stage = focusStageSize();
      const natural = naturalSize();
      const next = zoomFocusAt({
        maxScale: dynamicFocusMaxScale({
          naturalHeight: natural.height,
          naturalWidth: natural.width,
          stageHeight: stage.height,
          stageWidth: stage.width,
        }),
        naturalHeight: natural.height,
        naturalWidth: natural.width,
        originX: (pointers[0]!.x + pointers[1]!.x) / 2 - stage.left,
        originY: (pointers[0]!.y + pointers[1]!.y) / 2 - stage.top,
        panX: focusPan.x,
        panY: focusPan.y,
        scale: focusScale,
        stageHeight: stage.height,
        stageWidth: stage.width,
        targetScale: focusScale * (distance / gesture.distance),
      });
      setFocusScale(next.scale);
      setFocusPan({ x: next.x, y: next.y });
      gesture.distance = distance;
      gesture.moved = true;
      return;
    }
    const x = event.clientX - gesture.startX;
    const y = event.clientY - gesture.startY;
    gesture.axis ??= lockGalleryGestureAxis(x, y);
    if (gesture.axis === null) return;
    gesture.moved = true;
    if (focusScale <= 1) {
      if (gesture.axis !== "horizontal") return;
      const atEdge =
        (index === 0 && x > 0) || (index === media.length - 1 && x < 0);
      setFocusDragX(atEdge ? x * 0.32 : x);
      gesture.carouselDelta = x;
      gesture.lastX = event.clientX;
      gesture.lastTime = event.timeStamp;
      return;
    }
    const stage = focusStageSize();
    const natural = naturalSize();
    const bounds = containedImagePanBounds({
      naturalHeight: natural.height,
      naturalWidth: natural.width,
      scale: focusScale,
      stageHeight: stage.height,
      stageWidth: stage.width,
    });
    const attemptedX = gesture.originPan.x + x;
    const boundedX = clamp(attemptedX, -bounds.maxX, bounds.maxX);
    setFocusPan({
      x: boundedX,
      y: clamp(gesture.originPan.y + y, -bounds.maxY, bounds.maxY),
    });
    const excess = edgeCarouselDelta({
      attemptedPanX: attemptedX,
      boundedPanX: boundedX,
    });
    if (gesture.axis === "horizontal" && excess !== 0) {
      gesture.carouselDragging = true;
      gesture.carouselDelta = excess;
      setFocusDragX(excess * 0.32);
    }
    gesture.lastX = event.clientX;
    gesture.lastTime = event.timeStamp;
  };

  const onFocusPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    focusPointers.current.delete(event.pointerId);
    if (focusPointers.current.size > 0) return;
    const gesture = focusGesture.current;
    focusGesture.current = undefined;
    if (gesture === undefined) return;
    const deltaX = gesture.carouselDragging
      ? gesture.carouselDelta
      : event.clientX - gesture.startX;
    const committed =
      gesture.axis === "horizontal" &&
      shouldCommitGallerySwipe({
        deltaX,
        deltaY: event.clientY - gesture.startY,
        duration: event.timeStamp - gesture.startedAt,
        index,
        total: media.length,
        velocity: recentPointerVelocity({
          currentTime: event.timeStamp,
          currentX: event.clientX,
          lastTime: gesture.lastTime,
          lastX: gesture.lastX,
          startTime: gesture.startedAt,
          startX: gesture.startX,
        }),
        width: focusRef.current?.clientWidth ?? 1,
      });
    if (committed && focusMove(deltaX < 0 ? 1 : -1)) return;
    if (gesture.moved) {
      if (gesture.carouselDragging || focusScale === 1) rebound(true);
      return;
    }
    closeFocus();
  };

  return (
    <section aria-label="图像" className={styles.gallery}>
      <div
        className={styles.mediaStage}
        onWheel={(event) => {
          if (
            !multipleMedia ||
            Math.abs(event.deltaX) <= Math.abs(event.deltaY)
          )
            return;
          event.preventDefault();
          accumulateWheel(event);
        }}
      >
        <div
          aria-label="查看图像"
          className={styles.mediaFrame}
          onClick={openFocus}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") move(-1);
            if (event.key === "ArrowRight") move(1);
            if (event.key === "Enter" || event.key === " ") openFocus();
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          ref={frameRef}
          role="button"
          tabIndex={0}
        >
          <div
            className={`${styles.mediaTrack}${settling ? ` ${styles.isSettling}` : ""}`}
            style={{ transform: `translate3d(calc(-100% + ${dragX}px), 0, 0)` }}
          >
            {[media[index - 1], item, media[index + 1]].map(
              (entry, entryIndex) => (
                <div
                  className={styles.mediaSlide}
                  key={entry?.key ?? `empty-${entryIndex}`}
                >
                  {entry === undefined ? null : failed && entry === item ? (
                    <p className={styles.mediaFailure} role="status">
                      图像暂时无法加载
                    </p>
                  ) : (
                    <img
                      alt={entry.alt}
                      draggable={false}
                      height={entry.height}
                      onError={() => entry === item && setFailedKey(entry.key)}
                      src={entry.src}
                      width={entry.width}
                    />
                  )}
                </div>
              ),
            )}
          </div>
        </div>
        {multipleMedia ? (
          <button
            aria-label="上一张图像"
            className={`${styles.galleryEdge} ${styles.galleryEdgePrevious}`}
            disabled={index === 0}
            onClick={() => move(-1)}
            type="button"
          />
        ) : null}
        {multipleMedia ? (
          <button
            aria-label="下一张图像"
            className={`${styles.galleryEdge} ${styles.galleryEdgeNext}`}
            disabled={index === media.length - 1}
            onClick={() => move(1)}
            type="button"
          />
        ) : null}
        {multipleMedia ? (
          <p aria-live="polite" className={styles.mediaPosition}>
            {index + 1} / {media.length}
          </p>
        ) : null}
        {multipleMedia ? (
          <div
            aria-label="图像位置"
            className={styles.galleryDots}
            role="group"
          >
            {media.map((entry, entryIndex) => (
              <button
                aria-current={entryIndex === index ? "true" : undefined}
                aria-label={`第 ${entryIndex + 1} 张图像`}
                className={styles.galleryDot}
                key={entry.key}
                onClick={() => selectMedia(entryIndex)}
                type="button"
              />
            ))}
          </div>
        ) : null}
      </div>
      {focusOpen ? (
        <div
          aria-label="图像查看器"
          aria-modal="true"
          className={styles.focusViewer}
          onWheel={(event) => {
            event.preventDefault();
            revealFocusPager();
            const intent = classifyFocusWheel({
              ctrlKey: event.ctrlKey,
              deltaMode: event.deltaMode,
              deltaX: event.deltaX,
              deltaY: event.deltaY,
              metaKey: event.metaKey,
              scale: focusScale,
            });
            const stage = focusStageSize();
            const natural = naturalSize();
            if (intent === "zoom") {
              const next = zoomFocusAt({
                maxScale: dynamicFocusMaxScale({
                  naturalHeight: natural.height,
                  naturalWidth: natural.width,
                  stageHeight: stage.height,
                  stageWidth: stage.width,
                }),
                naturalHeight: natural.height,
                naturalWidth: natural.width,
                originX: event.clientX - stage.left,
                originY: event.clientY - stage.top,
                panX: focusPan.x,
                panY: focusPan.y,
                scale: focusScale,
                stageHeight: stage.height,
                stageWidth: stage.width,
                targetScale: focusScale + (event.deltaY < 0 ? 0.2 : -0.2),
              });
              setFocusScale(next.scale);
              setFocusPan({ x: next.x, y: next.y });
              return;
            }
            if (intent === "pan") {
              const bounds = containedImagePanBounds({
                naturalHeight: natural.height,
                naturalWidth: natural.width,
                scale: focusScale,
                stageHeight: stage.height,
                stageWidth: stage.width,
              });
              const attemptedX = focusPan.x - event.deltaX;
              const boundedX = clamp(attemptedX, -bounds.maxX, bounds.maxX);
              setFocusPan({
                x: boundedX,
                y: clamp(focusPan.y - event.deltaY, -bounds.maxY, bounds.maxY),
              });
              const excess = edgeCarouselDelta({
                attemptedPanX: attemptedX,
                boundedPanX: boundedX,
              });
              if (
                excess !== 0 &&
                Math.abs(event.deltaX) >= Math.abs(event.deltaY)
              ) {
                accumulateWheel(
                  { ...event, deltaX: -excess } as React.WheelEvent,
                  true,
                );
              }
              return;
            }
            if (Math.abs(event.deltaX) >= Math.abs(event.deltaY))
              accumulateWheel(event, true);
          }}
          ref={focusRef}
          role="dialog"
          tabIndex={-1}
        >
          <div
            className={styles.focusStage}
            onPointerDown={onFocusPointerDown}
            onPointerMove={onFocusPointerMove}
            onPointerUp={onFocusPointerUp}
            ref={focusStageRef}
          >
            <div
              className={`${styles.focusTrack}${focusSettling ? ` ${styles.isSettling}` : ""}`}
              style={{
                transform: `translate3d(calc(-100% + ${focusDragX}px), 0, 0)`,
              }}
            >
              {[media[index - 1], item, media[index + 1]].map(
                (entry, entryIndex) => (
                  <div
                    className={styles.focusSlide}
                    key={entry?.key ?? `empty-focus-${entryIndex}`}
                  >
                    {entry === undefined ? null : (
                      <img
                        alt={entry.alt}
                        draggable={false}
                        ref={entry === item ? focusImageRef : undefined}
                        src={entry.src}
                        style={
                          entry === item
                            ? {
                                transform: `translate3d(${focusPan.x}px, ${focusPan.y}px, 0) scale(${focusScale})`,
                              }
                            : undefined
                        }
                      />
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
          {multipleMedia ? (
            <>
              <button
                aria-label="上一张图像"
                className={`${styles.focusEdge} ${styles.focusEdgePrevious}`}
                disabled={index === 0}
                onClick={() => focusMove(-1)}
                type="button"
              />
              <button
                aria-label="下一张图像"
                className={`${styles.focusEdge} ${styles.focusEdgeNext}`}
                disabled={index === media.length - 1}
                onClick={() => focusMove(1)}
                type="button"
              />
              <p
                aria-live="polite"
                className={`${styles.focusPosition}${focusPagerVisible ? ` ${styles.focusPagerVisible}` : ""}`}
              >
                {index + 1} / {media.length}
              </p>
              <div
                aria-label="图像分页"
                className={`${styles.focusDots}${focusPagerVisible ? ` ${styles.focusPagerVisible}` : ""}`}
                role="tablist"
              >
                {media.map((entry, entryIndex) => (
                  <button
                    aria-current={entryIndex === index ? "true" : undefined}
                    aria-label={`第 ${entryIndex + 1} 张图像`}
                    className={styles.galleryDot}
                    key={entry.key}
                    onClick={() => selectMedia(entryIndex)}
                    type="button"
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
