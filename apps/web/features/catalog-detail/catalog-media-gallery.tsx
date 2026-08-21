"use client";

import { useEffect, useRef, useState } from "react";

import {
  containedImagePanBounds,
  lockGalleryGestureAxis,
  shouldCommitGallerySwipe,
  shouldSuppressFocusOpen,
  zoomedEdgePageStep,
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

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

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
  const focusGesture = useRef<{
    distance?: number;
    edgeStep?: -1 | 1;
    moved: boolean;
    pan?: { x: number; y: number };
  }>({ moved: false });
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
    if (stage === null) return { height: 1, width: 1 };
    const style = window.getComputedStyle(stage);
    return {
      height: Math.max(
        1,
        stage.clientHeight -
          (Number.parseFloat(style.paddingTop) || 0) -
          (Number.parseFloat(style.paddingBottom) || 0),
      ),
      width: Math.max(
        1,
        stage.clientWidth -
          (Number.parseFloat(style.paddingLeft) || 0) -
          (Number.parseFloat(style.paddingRight) || 0),
      ),
    };
  };

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

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    drag.current = {
      axis: null,
      id: event.pointerId,
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
      width: frameRef.current?.clientWidth ?? 1,
    });
    const next = x < 0;
    if (committed) move(next ? 1 : -1);
    else {
      setSettling(true);
      setDragX(0);
      window.setTimeout(() => setSettling(false), settleMs);
    }
  };

  const openFocus = () => {
    if (
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
    focusGesture.current.moved = false;
    delete focusGesture.current.edgeStep;
    revealFocusPager();
    if (pointers.length === 2) {
      focusGesture.current.distance = Math.hypot(
        pointers[0]!.x - pointers[1]!.x,
        pointers[0]!.y - pointers[1]!.y,
      );
    } else focusGesture.current.pan = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onFocusPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!focusPointers.current.has(event.pointerId)) return;
    focusPointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pointers = [...focusPointers.current.values()];
    if (pointers.length === 2 && focusGesture.current.distance !== undefined) {
      const distance = Math.hypot(
        pointers[0]!.x - pointers[1]!.x,
        pointers[0]!.y - pointers[1]!.y,
      );
      setFocusScale((scale) =>
        clamp(scale * (distance / focusGesture.current.distance!), 1, 4),
      );
      focusGesture.current.distance = distance;
      focusGesture.current.moved = true;
      return;
    }
    const pan = focusGesture.current.pan;
    if (!pan) return;
    if (focusScale <= 1) {
      const x = event.clientX - pan.x;
      const y = event.clientY - pan.y;
      const axis = lockGalleryGestureAxis(x, y);
      focusGesture.current.moved = axis !== null;
      if (axis !== "horizontal") return;
      const atEdge =
        (index === 0 && x > 0) || (index === media.length - 1 && x < 0);
      setFocusDragX(atEdge ? x * 0.32 : x);
      return;
    }
    const stage = focusStageSize();
    const bounds = containedImagePanBounds({
      naturalHeight: item.height ?? focusImageRef.current?.naturalHeight ?? 1,
      naturalWidth: item.width ?? focusImageRef.current?.naturalWidth ?? 1,
      scale: focusScale,
      stageHeight: stage.height,
      stageWidth: stage.width,
    });
    const edgeStep = zoomedEdgePageStep({
      deltaX: event.clientX - pan.x,
      maxX: bounds.maxX,
      panX: focusPan.x,
    });
    if (edgeStep !== undefined) {
      focusGesture.current.edgeStep = edgeStep;
      setFocusDragX((event.clientX - pan.x) * 0.32);
      focusGesture.current.moved = true;
      return;
    }
    setFocusPan((current) => ({
      x: clamp(current.x + event.clientX - pan.x, -bounds.maxX, bounds.maxX),
      y: clamp(current.y + event.clientY - pan.y, -bounds.maxY, bounds.maxY),
    }));
    focusGesture.current.pan = { x: event.clientX, y: event.clientY };
    focusGesture.current.moved = true;
  };

  const onFocusPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    focusPointers.current.delete(event.pointerId);
    if (focusPointers.current.size > 0) return;
    const pan = focusGesture.current.pan;
    const x = pan === undefined ? 0 : event.clientX - pan.x;
    const y = pan === undefined ? 0 : event.clientY - pan.y;
    if (focusGesture.current.edgeStep !== undefined) {
      if (focusMove(focusGesture.current.edgeStep)) return;
      setFocusSettling(true);
      setFocusDragX(0);
      window.setTimeout(() => setFocusSettling(false), settleMs);
      return;
    }
    if (
      focusScale === 1 &&
      shouldCommitGallerySwipe({
        deltaX: x,
        deltaY: y,
        duration: 180,
        index,
        total: media.length,
        width: focusRef.current?.clientWidth ?? 1,
      }) &&
      focusMove(x < 0 ? 1 : -1)
    )
      return;
    if (focusScale === 1 && focusGesture.current.moved) {
      setFocusSettling(true);
      setFocusDragX(0);
      window.setTimeout(() => setFocusSettling(false), settleMs);
      return;
    }
    if (!focusGesture.current.moved) closeFocus();
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
          move(event.deltaX > 0 ? 1 : -1);
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
            setFocusScale((scale) =>
              clamp(scale + (event.deltaY < 0 ? 0.2 : -0.2), 1, 4),
            );
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
