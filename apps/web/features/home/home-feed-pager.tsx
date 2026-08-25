"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./home-screen.module.css";
import {
  isExplicitHorizontalHomeWheel,
  resistHomePagerEdge,
  resolveHomePagerAxis,
  resolveHomePagerTarget,
} from "./home-feed-pager-motion";
import { homeFeeds } from "./home-feed";

import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import type { HomeFeed } from "./home-feed";
import type { PresentationPlatform } from "../shell/device-platform";

interface PointerGesture {
  axis: "horizontal" | "vertical" | null;
  lastTime: number;
  lastX: number;
  pointerId: number;
  startTime: number;
  startX: number;
  startY: number;
}

interface PointerTracking {
  readonly cancel: (event: PointerEvent) => void;
  readonly down: (event: PointerEvent) => void;
  mode: "active" | "peek";
  readonly move: (event: PointerEvent) => void;
  readonly up: (event: PointerEvent) => void;
}

const homePagerPeekMoveOptions = { passive: true } as const;
const homePagerActiveMoveOptions = { passive: false } as const;

export interface HomeFeedPagerProps {
  readonly activeFeed: HomeFeed;
  readonly onCommit: (feed: HomeFeed) => void;
  readonly panels: Readonly<Record<HomeFeed, ReactNode>>;
  readonly platform: PresentationPlatform;
}

export const HomeFeedPager = ({
  activeFeed,
  onCommit,
  panels,
  platform,
}: HomeFeedPagerProps) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activePanelRef = useRef<HTMLElement | null>(null);
  const gestureRef = useRef<PointerGesture | null>(null);
  const pointerTrackingRef = useRef<PointerTracking | null>(null);
  const pendingFeedRef = useRef<HomeFeed | null>(null);
  const settleFrameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const wheelTimerRef = useRef<number | null>(null);
  const wheelCommittedRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const [following, setFollowing] = useState(false);
  const [settling, setSettling] = useState(false);
  const [offset, setOffset] = useState(0);
  const activeIndex = homeFeeds.indexOf(activeFeed);

  const stopPointerTracking = () => {
    const tracking = pointerTrackingRef.current;
    if (tracking === null) return;
    window.removeEventListener("pointerdown", tracking.down);
    window.removeEventListener("pointermove", tracking.move);
    window.removeEventListener("pointerup", tracking.up);
    window.removeEventListener("pointercancel", tracking.cancel);
    pointerTrackingRef.current = null;
  };

  useEffect(
    () => () => {
      if (wheelTimerRef.current !== null) {
        window.clearTimeout(wheelTimerRef.current);
      }
      if (settleFrameRef.current !== null) {
        window.cancelAnimationFrame(settleFrameRef.current);
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      stopPointerTracking();
    },
    [],
  );

  const clearSettleWork = () => {
    if (settleFrameRef.current !== null) {
      window.cancelAnimationFrame(settleFrameRef.current);
      settleFrameRef.current = null;
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  };

  const finishVisualState = () => {
    clearSettleWork();
    const pendingFeed = pendingFeedRef.current;
    pendingFeedRef.current = null;
    setFollowing(false);
    setSettling(false);
    setOffset(0);
    if (frameRef.current !== null) frameRef.current.style.height = "";
    if (pendingFeed !== null && pendingFeed !== activeFeed) {
      onCommit(pendingFeed);
    }
  };

  const clearPreparedGesture = () => {
    setFollowing(false);
    setSettling(false);
    setOffset(0);
    if (frameRef.current !== null) frameRef.current.style.height = "";
  };

  const cancelGesture = () => {
    const pointerId = gestureRef.current?.pointerId;
    stopPointerTracking();
    try {
      if (
        pointerId !== undefined &&
        frameRef.current?.hasPointerCapture?.(pointerId)
      ) {
        frameRef.current.releasePointerCapture?.(pointerId);
      }
    } catch {
      // Safari may already have released capture while cancelling the gesture.
    }
    clearSettleWork();
    gestureRef.current = null;
    pendingFeedRef.current = null;
    setSettling(true);
    setOffset(0);
    settleFrameRef.current = window.requestAnimationFrame(() => {
      settleFrameRef.current = null;
      settleTimerRef.current = window.setTimeout(finishVisualState, 260);
    });
  };

  const moveGesture = (event: PointerEvent) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    if (!event.isPrimary) {
      cancelGesture();
      return;
    }
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const trackingWasActive = pointerTrackingRef.current?.mode === "active";
    if (gesture.axis === null) {
      const axis = resolveHomePagerAxis(deltaX, deltaY);
      if (axis === null) return;
      gesture.axis = axis;
      if (axis === "vertical") {
        gestureRef.current = null;
        stopPointerTracking();
        clearPreparedGesture();
        return;
      }
      try {
        frameRef.current?.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional; window-level cancellation still rebounds.
      }
      const tracking = pointerTrackingRef.current;
      if (tracking !== null && tracking.mode === "peek") {
        window.removeEventListener("pointermove", tracking.move);
        tracking.mode = "active";
        window.addEventListener(
          "pointermove",
          tracking.move,
          homePagerActiveMoveOptions,
        );
      }
    }
    if (gesture.axis !== "horizontal") return;
    if (trackingWasActive) event.preventDefault();
    gesture.lastX = event.clientX;
    gesture.lastTime = event.timeStamp;
    const nextOffset = resistHomePagerEdge(
      deltaX,
      activeIndex,
      homeFeeds.length - 1,
    );
    if (trackRef.current !== null) {
      trackRef.current.style.transform = `translate3d(calc(${
        -activeIndex * 100
      }% + ${nextOffset}px), 0, 0)`;
    }
    setOffset(nextOffset);
  };

  const completeGesture = (event: PointerEvent) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    stopPointerTracking();
    gestureRef.current = null;
    try {
      if (frameRef.current?.hasPointerCapture?.(event.pointerId)) {
        frameRef.current.releasePointerCapture?.(event.pointerId);
      }
    } catch {
      // Safari may release capture before pointerup reaches window.
    }
    if (gesture.axis !== "horizontal") {
      clearPreparedGesture();
      return;
    }
    const width = Math.max(1, frameRef.current?.clientWidth ?? 1);
    const deltaX = event.clientX - gesture.startX;
    const elapsed = Math.max(1, event.timeStamp - gesture.startTime);
    const velocityX = deltaX / elapsed;
    const targetIndex = resolveHomePagerTarget(
      activeIndex,
      homeFeeds.length - 1,
      deltaX,
      width,
      velocityX,
    );
    const targetFeed = homeFeeds[targetIndex];
    pendingFeedRef.current = targetFeed ?? activeFeed;
    suppressClickUntilRef.current = performance.now() + 400;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reducedMotion) {
      finishVisualState();
      return;
    }
    setSettling(true);
    setOffset((activeIndex - targetIndex) * width);
    settleTimerRef.current = window.setTimeout(finishVisualState, 380);
  };

  const armGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (platform === "pc" || event.pointerType !== "touch") return;
    if (settleFrameRef.current !== null || settleTimerRef.current !== null) {
      return;
    }
    if (gestureRef.current !== null) {
      if (gestureRef.current.pointerId !== event.pointerId) cancelGesture();
      return;
    }
    if (!event.isPrimary) return;
    gestureRef.current = {
      axis: null,
      lastTime: event.timeStamp,
      lastX: event.clientX,
      pointerId: event.pointerId,
      startTime: event.timeStamp,
      startX: event.clientX,
      startY: event.clientY,
    };
    const height = activePanelRef.current?.getBoundingClientRect().height;
    if (frameRef.current !== null && height !== undefined && height > 0) {
      frameRef.current.style.height = `${height}px`;
    }
    setFollowing(true);
    setSettling(false);
    setOffset(0);
    const tracking: PointerTracking = {
      cancel: () => cancelGesture(),
      down: (pointerEvent) => {
        if (gestureRef.current?.pointerId !== pointerEvent.pointerId) {
          cancelGesture();
        }
      },
      mode: "peek",
      move: (pointerEvent) => moveGesture(pointerEvent),
      up: (pointerEvent) => completeGesture(pointerEvent),
    };
    pointerTrackingRef.current = tracking;
    window.addEventListener("pointerdown", tracking.down);
    window.addEventListener(
      "pointermove",
      tracking.move,
      homePagerPeekMoveOptions,
    );
    window.addEventListener("pointerup", tracking.up);
    window.addEventListener("pointercancel", tracking.cancel);
  };

  const trackStyle = following
    ? ({
        transform: `translate3d(calc(${-activeIndex * 100}% + ${offset}px), 0, 0)`,
      } satisfies CSSProperties)
    : undefined;

  return (
    <div
      ref={frameRef}
      className={styles.pagerFrame}
      data-home-feed-pager=""
      data-home-pager-following={following ? "true" : "false"}
      data-home-pager-settling={settling ? "true" : "false"}
      onClickCapture={(event) => {
        const suppressUntil = suppressClickUntilRef.current;
        if (suppressUntil > 0 && performance.now() <= suppressUntil) {
          event.preventDefault();
          event.stopPropagation();
          suppressClickUntilRef.current = 0;
        }
      }}
      onLostPointerCapture={() => {
        if (gestureRef.current !== null) cancelGesture();
      }}
      onPointerDown={armGesture}
      onWheel={(event) => {
        if (platform !== "pc") return;
        if (
          !isExplicitHorizontalHomeWheel(
            event.deltaX,
            event.deltaY,
            event.ctrlKey,
          )
        ) {
          return;
        }
        event.preventDefault();
        if (!wheelCommittedRef.current) {
          const direction = event.deltaX > 0 ? 1 : -1;
          const targetIndex = Math.max(
            0,
            Math.min(homeFeeds.length - 1, activeIndex + direction),
          );
          const targetFeed = homeFeeds[targetIndex];
          if (targetFeed !== undefined && targetFeed !== activeFeed) {
            onCommit(targetFeed);
          }
          wheelCommittedRef.current = true;
        }
        if (wheelTimerRef.current !== null) {
          window.clearTimeout(wheelTimerRef.current);
        }
        wheelTimerRef.current = window.setTimeout(() => {
          wheelTimerRef.current = null;
          wheelCommittedRef.current = false;
        }, 160);
      }}
    >
      <div
        ref={trackRef}
        className={styles.pagerTrack}
        data-home-feed-track=""
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && settling) {
            finishVisualState();
          }
        }}
        style={trackStyle}
      >
        {homeFeeds.map((feed) => {
          const selected = feed === activeFeed;
          const visible = following || selected;
          return (
            <section
              key={feed}
              ref={selected ? activePanelRef : undefined}
              aria-hidden={!selected}
              aria-labelledby={`home-tab-${feed}`}
              className={styles.feedPanel}
              data-home-feed-panel={feed}
              hidden={!visible}
              id={`home-panel-${feed}`}
              inert={!selected || undefined}
              role="tabpanel"
              tabIndex={selected ? 0 : -1}
            >
              {panels[feed]}
            </section>
          );
        })}
      </div>
    </div>
  );
};
