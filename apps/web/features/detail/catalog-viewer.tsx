"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./catalog-detail.module.css";

import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import type { PublicMedia } from "@moya/contracts";
import type { PresentationPlatform } from "../shell/device-platform";

interface ViewerPoint {
  readonly x: number;
  readonly y: number;
}

interface ViewerDrag {
  readonly startX: number;
  readonly startY: number;
  readonly originX: number;
  readonly originY: number;
}

const VIEWER_MAX_SCALE = 4;
const VIEWER_SWIPE_THRESHOLD_PX = 52;

export interface CatalogViewerProps {
  readonly index: number;
  readonly media: readonly PublicMedia[];
  readonly onClose: () => void;
  readonly onIndexChange: (index: number) => void;
  readonly open: boolean;
  readonly platform: PresentationPlatform;
}

export const CatalogViewer = ({
  index,
  media,
  onClose,
  onIndexChange,
  open,
  platform,
}: CatalogViewerProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pointersRef = useRef(new Map<number, ViewerPoint>());
  const dragRef = useRef<ViewerDrag | null>(null);
  const pinchRef = useRef<{ distance: number; scale: number } | null>(null);
  const movedRef = useRef(false);
  const wheelLockRef = useRef(false);
  const wheelTimeoutRef = useRef<number | null>(null);
  const [failedMediaIds, setFailedMediaIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [scale, setScale] = useState(1);
  const [translation, setTranslation] = useState({ x: 0, y: 0 });
  const active = media[index];

  const resetTransform = () => {
    setScale(1);
    setTranslation({ x: 0, y: 0 });
    pointersRef.current.clear();
    dragRef.current = null;
    pinchRef.current = null;
    movedRef.current = false;
    wheelLockRef.current = false;
    if (wheelTimeoutRef.current !== null) {
      window.clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = null;
    }
  };

  const changeIndex = (nextIndex: number) => {
    const bounded = Math.min(Math.max(nextIndex, 0), media.length - 1);
    if (bounded === index) return;
    resetTransform();
    onIndexChange(bounded);
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(
    () => () => {
      if (wheelTimeoutRef.current !== null) {
        window.clearTimeout(wheelTimeoutRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    for (const candidate of [media[index - 1], media[index + 1]]) {
      if (candidate === undefined) continue;
      const preload = new Image();
      preload.src = candidate.src;
    }
  }, [index, media, open]);

  useEffect(() => {
    resetTransform();
  }, [active?.id, open]);

  useEffect(() => {
    setFailedMediaIds(new Set());
  }, [media]);

  const pointerDistance = (): number => {
    const [first, second] = [...pointersRef.current.values()];
    if (first === undefined || second === undefined) return 0;
    return Math.hypot(second.x - first.x, second.y - first.y);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Synthetic and interrupted pointers may not be capture-eligible.
    }
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    movedRef.current = false;
    if (pointersRef.current.size >= 2) {
      pinchRef.current = { distance: pointerDistance(), scale };
      dragRef.current = null;
      return;
    }
    dragRef.current = {
      originX: translation.x,
      originY: translation.y,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointersRef.current.size >= 2 && pinchRef.current !== null) {
      const distance = pointerDistance();
      if (distance <= 0 || pinchRef.current.distance <= 0) return;
      const nextScale = Math.min(
        VIEWER_MAX_SCALE,
        Math.max(
          1,
          pinchRef.current.scale * (distance / pinchRef.current.distance),
        ),
      );
      movedRef.current = true;
      setScale(nextScale);
      if (nextScale === 1) setTranslation({ x: 0, y: 0 });
      return;
    }
    const drag = dragRef.current;
    if (drag === null) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (Math.hypot(dx, dy) > 8) movedRef.current = true;
    if (scale > 1) {
      setTranslation({ x: drag.originX + dx, y: drag.originY + dy });
    }
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    pointersRef.current.delete(event.pointerId);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // A cancelled pointer may already have lost capture.
    }
    if (pointersRef.current.size > 0) return;
    pinchRef.current = null;
    dragRef.current = null;
    if (scale > 1 || drag === null) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (
      Math.abs(dx) >= VIEWER_SWIPE_THRESHOLD_PX &&
      Math.abs(dx) > Math.abs(dy)
    ) {
      changeIndex(index + (dx < 0 ? 1 : -1));
    }
  };

  const cancelPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    pointersRef.current.clear();
    pinchRef.current = null;
    dragRef.current = null;
    movedRef.current = true;
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Interrupted pointers may already have released capture.
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (scale === 1 && Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.25) {
      if (wheelLockRef.current) return;
      wheelLockRef.current = true;
      changeIndex(index + (event.deltaX > 0 ? 1 : -1));
      wheelTimeoutRef.current = window.setTimeout(() => {
        wheelLockRef.current = false;
        wheelTimeoutRef.current = null;
      }, 180);
      return;
    }
    const nextScale = Math.min(
      VIEWER_MAX_SCALE,
      Math.max(1, scale * Math.exp(-event.deltaY * 0.002)),
    );
    setScale(nextScale);
    if (nextScale === 1) setTranslation({ x: 0, y: 0 });
  };

  const imageStyle = {
    "--viewer-scale": scale,
    "--viewer-x": `${translation.x}px`,
    "--viewer-y": `${translation.y}px`,
  } as CSSProperties;
  const activeFailed = active === undefined || failedMediaIds.has(active.id);

  return (
    <dialog
      aria-label="图像查看"
      className={styles.viewer}
      data-detail-viewer=""
      data-platform={platform}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => {
        if (open) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          changeIndex(index - 1);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          changeIndex(index + 1);
        } else if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      ref={dialogRef}
    >
      <button
        aria-label="关闭图像查看"
        className={styles.viewerClose}
        onClick={onClose}
        type="button"
      >
        关闭图像查看
      </button>
      {active === undefined ? null : (
        <div
          className={styles.viewerStage}
          data-viewer-scale={scale > 1.05 ? "zoomed" : "fit"}
          onLostPointerCapture={cancelPointer}
          onPointerCancel={cancelPointer}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishPointer}
          onWheel={handleWheel}
        >
          {activeFailed ? (
            <div
              className={styles.viewerMediaError}
              data-detail-viewer-media-state="failed"
              role="status"
            >
              图像无法加载
            </div>
          ) : (
            <img
              alt={active.alt}
              className={styles.viewerImage}
              data-detail-viewer-image=""
              draggable={false}
              height={active.height}
              onClick={() => {
                if (!movedRef.current) onClose();
              }}
              onError={() => {
                setFailedMediaIds((current) => new Set(current).add(active.id));
              }}
              src={active.src}
              style={imageStyle}
              width={active.width}
            />
          )}
          {media.length > 1 ? (
            <>
              <span
                aria-live="polite"
                className={styles.viewerCounter}
                data-detail-viewer-index=""
              >
                {index + 1} / {media.length}
              </span>
              <button
                aria-label="上一张图像"
                className={`${styles.viewerEdge} ${styles.viewerEdgePrevious}`}
                disabled={index === 0 || scale > 1.05}
                onClick={() => changeIndex(index - 1)}
                type="button"
              />
              <button
                aria-label="下一张图像"
                className={`${styles.viewerEdge} ${styles.viewerEdgeNext}`}
                disabled={index === media.length - 1 || scale > 1.05}
                onClick={() => changeIndex(index + 1)}
                type="button"
              />
            </>
          ) : null}
        </div>
      )}
    </dialog>
  );
};
