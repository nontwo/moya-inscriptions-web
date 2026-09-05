"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState } from "react";

import { useContentQuickActions } from "./content-quick-actions";
import {
  resolveQuickActionCandidate,
  resolveQuickActionLayout,
} from "./quick-action-layout";
import { quickActionNames } from "./quick-action-types";
import styles from "./quick-action-menu.module.css";

import type { CatalogSummary } from "@moya/contracts";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import type {
  QuickActionLayout,
  QuickActionPoint,
} from "./quick-action-layout";
import type {
  ContentQuickActionEnvironment,
  QuickActionName,
  QuickActionPhase,
} from "./quick-action-types";

const HOLDING_FEEDBACK_MS = 220;
const LONG_PRESS_MS = 400;
const MOVEMENT_TOLERANCE = 10;

type QuickActionStyle = CSSProperties &
  Record<`--quick-action-${string}`, string>;

interface ActiveGesture {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly start: QuickActionPoint;
  opened: boolean;
}

const visualViewportMetrics = () => {
  const viewport = window.visualViewport;
  return {
    height: viewport?.height ?? window.innerHeight,
    offsetLeft: viewport?.offsetLeft ?? 0,
    offsetTop: viewport?.offsetTop ?? 0,
    safeInset: 16,
    width: viewport?.width ?? window.innerWidth,
  };
};

const actionLabel = (action: QuickActionName, active: boolean): string => {
  if (action === "like") return active ? "取消喜欢" : "喜欢";
  if (action === "favorite") return active ? "取消收藏" : "收藏";
  return "分享";
};

const QuickActionIcon = ({
  action,
  filled,
}: {
  readonly action: QuickActionName;
  readonly filled: boolean;
}) => {
  if (action === "like") {
    return (
      <svg
        aria-hidden="true"
        className={styles.icon}
        data-filled={filled}
        viewBox="0 0 24 24"
      >
        <path d="M12 20.4 4.5 13.2C1.1 9.9 3 4.5 7.5 4.5c1.9 0 3.5 1 4.5 2.4 1-1.4 2.6-2.4 4.5-2.4 4.5 0 6.4 5.4 3 8.7L12 20.4Z" />
      </svg>
    );
  }
  if (action === "favorite") {
    return (
      <svg
        aria-hidden="true"
        className={styles.icon}
        data-filled={filled}
        viewBox="0 0 24 24"
      >
        <path d="m12 3.2 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9L6.6 20l1-6.1-4.4-4.3 6.1-.9L12 3.2Z" />
      </svg>
    );
  }
  return (
    <svg
      aria-hidden="true"
      className={styles.icon}
      data-filled="false"
      viewBox="0 0 24 24"
    >
      <path d="M20.5 6.4 14.8 2v3.3C8.3 5.8 4.5 9 3.5 15.5c2.2-3.2 5.8-4.8 11.3-4.8V14l5.7-4.4V6.4Z" />
    </svg>
  );
};

const magnetOffset = (
  point: QuickActionPoint | null,
  position: QuickActionPoint,
  selected: boolean,
) => {
  if (!selected || point === null) return { x: 0, y: 0 };
  const dx = point.x - position.x;
  const dy = point.y - position.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  return { x: (dx / distance) * 4, y: (dy / distance) * 4 };
};

const QuickActionMenu = ({
  candidate,
  environment,
  item,
  layout,
  pointer,
}: {
  readonly candidate: QuickActionName | null;
  readonly environment: ContentQuickActionEnvironment;
  readonly item: CatalogSummary;
  readonly layout: QuickActionLayout;
  readonly pointer: QuickActionPoint | null;
}) => {
  const liked = environment.likedIds.includes(item.id);
  const favorited = environment.favoriteIds.includes(item.id);
  const activeByAction = {
    favorite: favorited,
    like: liked,
    share: false,
  } as const;

  return createPortal(
    <div
      aria-label="内容快捷操作"
      className={styles.overlay}
      data-has-candidate={candidate !== null}
      data-quick-action-direction={layout.direction}
      data-quick-action-menu=""
      role="menu"
      style={
        {
          "--quick-action-anchor-x": `${layout.anchor.x}px`,
          "--quick-action-anchor-y": `${layout.anchor.y}px`,
        } as QuickActionStyle
      }
    >
      <span aria-hidden="true" className={styles.deadZone} />
      {layout.positions.map((position, index) => {
        const selected = candidate === position.action;
        const active = activeByAction[position.action];
        const previewActive = selected ? !active : active;
        const magnet = magnetOffset(pointer, position, selected);
        const label = actionLabel(position.action, active);
        return (
          <button
            aria-label={label}
            className={styles.hitTarget}
            data-candidate={selected}
            data-quick-action={position.action}
            data-state-active={active}
            key={position.action}
            role="menuitem"
            style={
              {
                "--quick-action-delay": `${index * 35}ms`,
                "--quick-action-magnet-x": `${magnet.x}px`,
                "--quick-action-magnet-y": `${magnet.y}px`,
                "--quick-action-x": `${position.x}px`,
                "--quick-action-y": `${position.y}px`,
              } as QuickActionStyle
            }
            tabIndex={-1}
            title={label}
            type="button"
          >
            <span className={`${styles.bubble} yoyi-functional-glass`}>
              <QuickActionIcon
                action={position.action}
                filled={previewActive}
              />
            </span>
          </button>
        );
      })}
    </div>,
    document.body,
  );
};

export interface QuickActionCardActionProps {
  readonly className: string | undefined;
  readonly enabled?: boolean;
  readonly item: CatalogSummary;
  readonly onOpenCatalog: (
    item: CatalogSummary,
    opener: HTMLButtonElement,
  ) => void;
}

export const QuickActionCardAction = ({
  className,
  enabled = true,
  item,
  onOpenCatalog,
}: QuickActionCardActionProps) => {
  const configuredEnvironment = useContentQuickActions();
  const environment = enabled ? configuredEnvironment : null;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const gestureRef = useRef<ActiveGesture | null>(null);
  const candidateRef = useRef<QuickActionName | null>(null);
  const layoutRef = useRef<QuickActionLayout | null>(null);
  const suppressActivationRef = useRef(false);
  const [candidate, setCandidate] = useState<QuickActionName | null>(null);
  const [layout, setLayout] = useState<QuickActionLayout | null>(null);
  const [phase, setPhase] = useState<QuickActionPhase>("idle");
  const [pointer, setPointer] = useState<QuickActionPoint | null>(null);

  const clearTimers = useCallback(() => {
    if (feedbackTimerRef.current !== null) {
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = null;
    }
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const setCandidateState = useCallback(
    (next: QuickActionName | null) => {
      if (candidateRef.current === next) return;
      candidateRef.current = next;
      setCandidate(next);
      setPhase(next === null ? "menu-open" : "selecting");
      if (next !== null) {
        environment?.onEvent?.({
          action: next,
          contentId: item.id,
          type: "candidate",
        });
      }
    },
    [environment, item.id],
  );

  const resetGesture = useCallback(
    ({ logCancellation = false, suppressClick = false } = {}) => {
      const gesture = gestureRef.current;
      clearTimers();
      if (
        gesture !== null &&
        buttonRef.current?.hasPointerCapture?.(gesture.pointerId)
      ) {
        try {
          buttonRef.current.releasePointerCapture(gesture.pointerId);
        } catch {
          // The browser may release capture before pointer cancellation.
        }
      }
      if (logCancellation && gesture?.opened === true) {
        environment?.onEvent?.({ contentId: item.id, type: "cancelled" });
      }
      if (suppressClick) suppressActivationRef.current = true;
      gestureRef.current = null;
      candidateRef.current = null;
      layoutRef.current = null;
      setCandidate(null);
      setLayout(null);
      setPhase("idle");
      setPointer(null);
    },
    [clearTimers, environment, item.id],
  );

  const openMenu = useCallback(() => {
    const gesture = gestureRef.current;
    const button = buttonRef.current;
    if (gesture === null || button === null || !button.isConnected) return;
    gesture.opened = true;
    longPressTimerRef.current = null;
    feedbackTimerRef.current = null;
    const nextLayout = resolveQuickActionLayout(
      gesture.start,
      visualViewportMetrics(),
    );
    layoutRef.current = nextLayout;
    setLayout(nextLayout);
    setPointer(gesture.start);
    setPhase("menu-open");
    suppressActivationRef.current = true;
    try {
      button.setPointerCapture?.(gesture.pointerId);
    } catch {
      // Pointer capture is optional after a native gesture interruption.
    }
    environment?.onEvent?.({ contentId: item.id, type: "opened" });
  }, [environment, item.id]);

  useEffect(() => {
    const card = buttonRef.current?.parentElement;
    if (card === null || card === undefined) return undefined;
    card.dataset.quickActionPhase = phase;
    return () => {
      delete card.dataset.quickActionPhase;
    };
  }, [phase]);

  useEffect(
    () => () => {
      clearTimers();
    },
    [clearTimers],
  );

  useEffect(() => {
    if (layout === null) return undefined;
    const cancelForViewportChange = () =>
      resetGesture({ logCancellation: true, suppressClick: true });
    const cancelForHiddenPage = () => {
      if (document.visibilityState !== "visible") cancelForViewportChange();
    };
    const cancelForAdditionalPointer = (event: PointerEvent) => {
      if (event.pointerId !== gestureRef.current?.pointerId) {
        cancelForViewportChange();
      }
    };
    const cancelForMultiTouch = (event: TouchEvent) => {
      if (event.touches.length > 1) cancelForViewportChange();
    };
    const blockNativeTouchScroll = (event: TouchEvent) => {
      if (gestureRef.current?.opened === true && event.cancelable) {
        event.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", cancelForHiddenPage);
    window.addEventListener("blur", cancelForViewportChange);
    window.addEventListener("orientationchange", cancelForViewportChange);
    window.addEventListener("pagehide", cancelForViewportChange);
    window.addEventListener("pointerdown", cancelForAdditionalPointer, true);
    window.addEventListener("resize", cancelForViewportChange);
    window.addEventListener("scroll", cancelForViewportChange, true);
    window.addEventListener("touchmove", blockNativeTouchScroll, {
      passive: false,
    });
    window.addEventListener("touchstart", cancelForMultiTouch, {
      capture: true,
      passive: true,
    });
    window.visualViewport?.addEventListener("resize", cancelForViewportChange);
    window.visualViewport?.addEventListener("scroll", cancelForViewportChange);
    return () => {
      document.removeEventListener("visibilitychange", cancelForHiddenPage);
      window.removeEventListener("blur", cancelForViewportChange);
      window.removeEventListener("orientationchange", cancelForViewportChange);
      window.removeEventListener("pagehide", cancelForViewportChange);
      window.removeEventListener(
        "pointerdown",
        cancelForAdditionalPointer,
        true,
      );
      window.removeEventListener("resize", cancelForViewportChange);
      window.removeEventListener("scroll", cancelForViewportChange, true);
      window.removeEventListener("touchmove", blockNativeTouchScroll);
      window.removeEventListener("touchstart", cancelForMultiTouch, true);
      window.visualViewport?.removeEventListener(
        "resize",
        cancelForViewportChange,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        cancelForViewportChange,
      );
    };
  }, [layout, resetGesture]);

  const commit = useCallback(
    (action: QuickActionName) => {
      if (environment === null) return;
      const liked = environment.likedIds.includes(item.id);
      const favorited = environment.favoriteIds.includes(item.id);
      const result =
        action === "like"
          ? liked
            ? environment.adapter.unlike(item)
            : environment.adapter.like(item)
          : action === "favorite"
            ? favorited
              ? environment.adapter.unfavorite(item)
              : environment.adapter.favorite(item)
            : environment.adapter.share(item);
      void Promise.resolve(result).catch(() => undefined);
      environment.onEvent?.({
        action,
        contentId: item.id,
        type: "committed",
      });
    },
    [environment, item],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!event.isPrimary) {
      if (gestureRef.current !== null) {
        resetGesture({
          logCancellation: gestureRef.current.opened,
          suppressClick: true,
        });
      }
      return;
    }
    if (event.button !== 0) return;
    resetGesture();
    suppressActivationRef.current = false;
    const gesture: ActiveGesture = {
      opened: false,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      start: { x: event.clientX, y: event.clientY },
    };
    gestureRef.current = gesture;
    setPhase("pressing");
    if (environment === null) return;
    feedbackTimerRef.current = window.setTimeout(() => {
      if (gestureRef.current === gesture && !gesture.opened) {
        feedbackTimerRef.current = null;
        setPhase("holding");
      }
    }, HOLDING_FEEDBACK_MS);
    longPressTimerRef.current = window.setTimeout(openMenu, LONG_PRESS_MS);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    const point = { x: event.clientX, y: event.clientY };
    if (!gesture.opened) {
      if (
        Math.hypot(point.x - gesture.start.x, point.y - gesture.start.y) >
        MOVEMENT_TOLERANCE
      ) {
        suppressActivationRef.current = true;
        resetGesture({ suppressClick: true });
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPointer(point);
    const activeLayout = layoutRef.current;
    if (activeLayout === null) return;
    setCandidateState(
      resolveQuickActionCandidate(point, activeLayout, candidateRef.current),
    );
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    if (!gesture.opened) {
      clearTimers();
      gestureRef.current = null;
      setPhase("idle");
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const activeLayout = layoutRef.current;
    const finalCandidate =
      activeLayout === null
        ? candidateRef.current
        : resolveQuickActionCandidate(
            { x: event.clientX, y: event.clientY },
            activeLayout,
            candidateRef.current,
          );
    if (finalCandidate === null) {
      resetGesture({ logCancellation: true, suppressClick: true });
      return;
    }
    commit(finalCandidate);
    resetGesture({ suppressClick: true });
  };

  return (
    <>
      <button
        aria-label={`打开${item.title}`}
        className={className}
        data-open-catalog=""
        data-quick-actions={environment === null ? undefined : "enabled"}
        onClick={(event) => {
          if (suppressActivationRef.current) {
            suppressActivationRef.current = false;
            event.preventDefault();
            return;
          }
          onOpenCatalog(item, event.currentTarget);
        }}
        onContextMenu={(event) => {
          if (environment !== null) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onDragStart={(event) => {
          if (environment !== null) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
        onPointerCancel={() => {
          const opened = gestureRef.current?.opened === true;
          resetGesture({
            logCancellation: opened,
            suppressClick: true,
          });
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        ref={buttonRef}
        type="button"
      />
      {environment !== null && layout !== null ? (
        <QuickActionMenu
          candidate={candidate}
          environment={environment}
          item={item}
          layout={layout}
          pointer={pointer}
        />
      ) : null}
    </>
  );
};

export const QUICK_ACTION_GESTURE_TIMING = {
  holdingFeedbackMs: HOLDING_FEEDBACK_MS,
  longPressMs: LONG_PRESS_MS,
  movementTolerance: MOVEMENT_TOLERANCE,
} as const;

export const QUICK_ACTION_ORDER = quickActionNames;
