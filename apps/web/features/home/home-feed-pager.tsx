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
  const activePanelRef = useRef<HTMLElement | null>(null);
  const gestureRef = useRef<PointerGesture | null>(null);
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

  const cancelGesture = () => {
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

  const armGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (platform === "pc") return;
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
  };

  const moveGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    if (!event.isPrimary) {
      cancelGesture();
      return;
    }
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (gesture.axis === null) {
      const axis = resolveHomePagerAxis(deltaX, deltaY);
      if (axis === null) return;
      gesture.axis = axis;
      if (axis === "vertical") {
        gestureRef.current = null;
        return;
      }
      const height = activePanelRef.current?.getBoundingClientRect().height;
      if (frameRef.current !== null && height !== undefined && height > 0) {
        frameRef.current.style.height = `${height}px`;
      }
      setFollowing(true);
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is optional; window-level cancellation still rebounds.
      }
    }
    if (gesture.axis !== "horizontal") return;
    event.preventDefault();
    gesture.lastX = event.clientX;
    gesture.lastTime = event.timeStamp;
    setOffset(resistHomePagerEdge(deltaX, activeIndex, homeFeeds.length - 1));
  };

  const completeGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (gesture.axis !== "horizontal") return;
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
      onPointerCancel={cancelGesture}
      onPointerDown={armGesture}
      onPointerMove={moveGesture}
      onPointerUp={completeGesture}
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
