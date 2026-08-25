"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import styles from "./home-screen.module.css";
import {
  HOME_PAGER_CLICK_SUPPRESS_PX,
  HOME_PAGER_SCROLL_IDLE_MS,
  homePagerProgress,
  isExplicitHorizontalHomeWheel,
  isHomePagerAtIndex,
  resolveHomePagerSettledIndex,
} from "./home-feed-pager-motion";
import { homeFeeds } from "./home-feed";

import type { ReactNode, WheelEvent as ReactWheelEvent } from "react";
import type { HomeFeed } from "./home-feed";
import type { PresentationPlatform } from "../shell/device-platform";

interface ScrollSession {
  originIndex: number;
  requestedIndex: number | null;
}

export interface HomeFeedPagerHandle {
  readonly scrollToFeed: (feed: HomeFeed) => void;
}

export interface HomeFeedPagerProps {
  readonly activeFeed: HomeFeed;
  readonly onCommit: (feed: HomeFeed) => void;
  readonly onProgress?: (progress: number) => void;
  readonly primaryVisible?: boolean;
  readonly registerActiveScrollElement?: (element: HTMLElement) => () => void;
  readonly panels: Readonly<Record<HomeFeed, ReactNode>>;
  readonly platform: PresentationPlatform;
}

const panelHeights = (): Record<HomeFeed, number> => ({
  discover: 0,
  nearby: 0,
  topics: 0,
});

const reducedMotionPreferred = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

export const HomeFeedPager = forwardRef<
  HomeFeedPagerHandle,
  HomeFeedPagerProps
>(function HomeFeedPager(
  {
    activeFeed,
    onCommit,
    onProgress,
    panels,
    platform,
    primaryVisible = true,
    registerActiveScrollElement,
  },
  ref,
) {
  const frameRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<Record<HomeFeed, HTMLElement | null>>({
    discover: null,
    nearby: null,
    topics: null,
  });
  const heightsRef = useRef(panelHeights());
  const preservedPanelScrollTopsRef = useRef(panelHeights());
  const activeIndex = homeFeeds.indexOf(activeFeed);
  const activeIndexRef = useRef(activeIndex);
  const primaryVisibleRef = useRef(primaryVisible);
  const onCommitRef = useRef(onCommit);
  const onProgressRef = useRef(onProgress);
  const sessionRef = useRef<ScrollSession | null>(null);
  const quietTimerRef = useRef<number | null>(null);
  const progressFrameRef = useRef<number | null>(null);
  const wheelTimerRef = useRef<number | null>(null);
  const wheelHandledRef = useRef(false);
  const frameWidthRef = useRef(0);
  const frameWasUnavailableRef = useRef(false);
  const touchActiveRef = useRef(false);
  const touchStartScrollLeftRef = useRef<number | null>(null);
  const suppressClickUntilRef = useRef(0);
  const settleRef = useRef<() => void>(() => undefined);

  activeIndexRef.current = activeIndex;
  primaryVisibleRef.current = primaryVisible;
  onCommitRef.current = onCommit;
  onProgressRef.current = onProgress;

  const clearQuietTimer = useCallback(() => {
    if (quietTimerRef.current === null) return;
    window.clearTimeout(quietTimerRef.current);
    quietTimerRef.current = null;
  }, []);

  const setScrolling = useCallback((scrolling: boolean) => {
    const frame = frameRef.current;
    if (frame !== null) {
      frame.dataset.homePagerScrolling = String(scrolling);
    }
  }, []);

  const readPanelHeight = useCallback((feed: HomeFeed): number => {
    const panel = panelRefs.current[feed];
    if (panel === null) return heightsRef.current[feed];
    const height = Math.ceil(
      Math.max(panel.scrollHeight, panel.getBoundingClientRect().height),
    );
    if (height > 0) heightsRef.current[feed] = height;
    return height;
  }, []);

  const restorePreservedPanelScrollTops = useCallback(() => {
    if (platform === "pc") return;
    for (const feed of homeFeeds) {
      const panel = panelRefs.current[feed];
      if (panel === null) continue;
      panel.scrollTop = Math.min(
        preservedPanelScrollTopsRef.current[feed],
        Math.max(0, panel.scrollHeight - panel.clientHeight),
      );
    }
  }, [platform]);

  const applyPanelHeight = useCallback(
    (index: number) => {
      const frame = frameRef.current;
      const feed = homeFeeds[index];
      if (frame === null || feed === undefined) return;
      const height = readPanelHeight(feed);
      if (height > 0) frame.style.height = `${height}px`;
    },
    [readPanelHeight],
  );

  const publishProgress = useCallback((immediate = false) => {
    const publish = () => {
      progressFrameRef.current = null;
      const frame = frameRef.current;
      if (frame === null) return;
      const width = Math.max(1, frame.clientWidth);
      onProgressRef.current?.(
        homePagerProgress(frame.scrollLeft, width, homeFeeds.length - 1),
      );
    };
    if (immediate) {
      if (progressFrameRef.current !== null) {
        window.cancelAnimationFrame(progressFrameRef.current);
      }
      publish();
      return;
    }
    if (progressFrameRef.current === null) {
      progressFrameRef.current = window.requestAnimationFrame(publish);
    }
  }, []);

  const scrollFrameTo = useCallback(
    (index: number, behavior: ScrollBehavior) => {
      const frame = frameRef.current;
      if (frame === null) return;
      const left = Math.max(1, frame.clientWidth) * index;
      if (typeof frame.scrollTo === "function") {
        frame.scrollTo({ behavior, left, top: 0 });
      } else {
        frame.scrollLeft = left;
        frame.dispatchEvent(new Event("scroll"));
      }
    },
    [],
  );

  const scheduleSettle = useCallback(() => {
    clearQuietTimer();
    quietTimerRef.current = window.setTimeout(() => {
      quietTimerRef.current = null;
      settleRef.current();
    }, HOME_PAGER_SCROLL_IDLE_MS);
  }, [clearQuietTimer]);

  const finishSettle = useCallback(
    (targetIndex: number) => {
      clearQuietTimer();
      sessionRef.current = null;
      touchStartScrollLeftRef.current = null;
      setScrolling(false);
      if (platform === "pc") applyPanelHeight(targetIndex);
      publishProgress(true);
      const targetFeed = homeFeeds[targetIndex];
      if (targetFeed !== undefined && targetIndex !== activeIndexRef.current) {
        onCommitRef.current(targetFeed);
      }
    },
    [
      applyPanelHeight,
      clearQuietTimer,
      platform,
      publishProgress,
      setScrolling,
    ],
  );

  const settlePager = useCallback(() => {
    const frame = frameRef.current;
    const session = sessionRef.current;
    if (frame === null || session === null) return;
    if (touchActiveRef.current) {
      scheduleSettle();
      return;
    }
    const width = Math.max(1, frame.clientWidth);
    const targetIndex = resolveHomePagerSettledIndex(
      session.originIndex,
      homeFeeds.length - 1,
      frame.scrollLeft,
      width,
      session.requestedIndex,
    );
    if (!isHomePagerAtIndex(frame.scrollLeft, width, targetIndex)) {
      session.requestedIndex = targetIndex;
      scrollFrameTo(targetIndex, reducedMotionPreferred() ? "auto" : "smooth");
      scheduleSettle();
      return;
    }
    finishSettle(targetIndex);
  }, [finishSettle, scheduleSettle, scrollFrameTo]);
  settleRef.current = settlePager;

  const beginSession = useCallback(
    (requestedIndex: number | null) => {
      sessionRef.current = {
        originIndex: activeIndexRef.current,
        requestedIndex,
      };
      setScrolling(true);
      if (platform === "pc") applyPanelHeight(activeIndexRef.current);
    },
    [applyPanelHeight, platform, setScrolling],
  );

  const requestFeed = useCallback(
    (feed: HomeFeed) => {
      const frame = frameRef.current;
      const targetIndex = homeFeeds.indexOf(feed);
      if (frame === null || targetIndex < 0) return;
      const width = Math.max(1, frame.clientWidth);
      if (
        targetIndex === activeIndexRef.current &&
        isHomePagerAtIndex(frame.scrollLeft, width, targetIndex)
      ) {
        publishProgress(true);
        return;
      }
      clearQuietTimer();
      beginSession(targetIndex);
      scrollFrameTo(targetIndex, reducedMotionPreferred() ? "auto" : "smooth");
      scheduleSettle();
    },
    [
      beginSession,
      clearQuietTimer,
      publishProgress,
      scheduleSettle,
      scrollFrameTo,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToFeed: requestFeed,
    }),
    [requestFeed],
  );

  const handleScroll = useCallback(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    publishProgress();
    const touchStart = touchStartScrollLeftRef.current;
    if (
      touchStart !== null &&
      Math.abs(frame.scrollLeft - touchStart) > HOME_PAGER_CLICK_SUPPRESS_PX
    ) {
      suppressClickUntilRef.current = performance.now() + 500;
    }
    const width = Math.max(1, frame.clientWidth);
    if (
      sessionRef.current === null &&
      isHomePagerAtIndex(frame.scrollLeft, width, activeIndexRef.current)
    ) {
      return;
    }
    if (sessionRef.current === null) beginSession(null);
    scheduleSettle();
  }, [beginSession, publishProgress, scheduleSettle]);

  const handleTouchStart = useCallback(() => {
    touchActiveRef.current = true;
    suppressClickUntilRef.current = 0;
    touchStartScrollLeftRef.current = frameRef.current?.scrollLeft ?? null;
    const session = sessionRef.current;
    if (session !== null && session.requestedIndex !== null) {
      session.originIndex = activeIndexRef.current;
      session.requestedIndex = null;
    }
  }, []);

  const handleTouchFinish = useCallback(() => {
    touchActiveRef.current = false;
    if (sessionRef.current !== null) {
      scheduleSettle();
    } else {
      touchStartScrollLeftRef.current = null;
    }
  }, [scheduleSettle]);

  const handleWheel = useCallback(
    (event: ReactWheelEvent<HTMLDivElement>) => {
      if (
        platform !== "pc" ||
        !isExplicitHorizontalHomeWheel(
          event.deltaX,
          event.deltaY,
          event.ctrlKey,
        )
      ) {
        return;
      }
      event.preventDefault();
      if (!wheelHandledRef.current) {
        const direction = event.deltaX > 0 ? 1 : -1;
        const targetIndex = Math.max(
          0,
          Math.min(homeFeeds.length - 1, activeIndexRef.current + direction),
        );
        const targetFeed = homeFeeds[targetIndex];
        if (targetFeed !== undefined) requestFeed(targetFeed);
        wheelHandledRef.current = true;
      }
      if (wheelTimerRef.current !== null) {
        window.clearTimeout(wheelTimerRef.current);
      }
      wheelTimerRef.current = window.setTimeout(() => {
        wheelTimerRef.current = null;
        wheelHandledRef.current = false;
      }, 160);
    },
    [platform, requestFeed],
  );

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    clearQuietTimer();
    sessionRef.current = null;
    touchActiveRef.current = false;
    touchStartScrollLeftRef.current = null;
    setScrolling(false);
    const width = Math.max(1, frame.clientWidth);
    frameWidthRef.current = width;
    frame.scrollLeft = activeIndex * width;
    if (platform === "pc") {
      for (const feed of homeFeeds) readPanelHeight(feed);
      applyPanelHeight(activeIndex);
    } else {
      frame.style.height = "";
    }
    publishProgress(true);
  }, [
    activeFeed,
    activeIndex,
    applyPanelHeight,
    clearQuietTimer,
    platform,
    publishProgress,
    readPanelHeight,
    setScrolling,
  ]);

  useLayoutEffect(() => {
    if (platform === "pc" || registerActiveScrollElement === undefined) {
      return undefined;
    }
    const panel = panelRefs.current[activeFeed];
    if (panel === null) return undefined;
    if (primaryVisibleRef.current) {
      preservedPanelScrollTopsRef.current[activeFeed] = panel.scrollTop;
    }
    return registerActiveScrollElement(panel);
  }, [activeFeed, platform, registerActiveScrollElement]);

  useLayoutEffect(() => {
    if (primaryVisible) restorePreservedPanelScrollTops();
  }, [primaryVisible, restorePreservedPanelScrollTops]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (frame === null || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => {
      if (platform === "pc") {
        for (const feed of homeFeeds) readPanelHeight(feed);
      }
      const width = frame.clientWidth;
      if (width <= 0) {
        frameWasUnavailableRef.current = true;
        return;
      }
      if (frameWasUnavailableRef.current) {
        frameWasUnavailableRef.current = false;
        restorePreservedPanelScrollTops();
      }
      if (width > 0 && Math.abs(width - frameWidthRef.current) > 0.5) {
        frameWidthRef.current = width;
        clearQuietTimer();
        sessionRef.current = null;
        setScrolling(false);
        frame.scrollLeft = activeIndexRef.current * width;
        publishProgress(true);
      }
      if (platform === "pc" && sessionRef.current === null) {
        applyPanelHeight(activeIndexRef.current);
      }
    });
    observer.observe(frame);
    if (platform === "pc") {
      for (const feed of homeFeeds) {
        const panel = panelRefs.current[feed];
        if (panel !== null) observer.observe(panel);
      }
    }
    return () => observer.disconnect();
  }, [
    applyPanelHeight,
    clearQuietTimer,
    platform,
    publishProgress,
    readPanelHeight,
    restorePreservedPanelScrollTops,
    setScrolling,
  ]);

  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    const handleScrollEnd = () => settleRef.current();
    frame.addEventListener("scrollend", handleScrollEnd);
    return () => frame.removeEventListener("scrollend", handleScrollEnd);
  }, []);

  useEffect(
    () => () => {
      clearQuietTimer();
      if (progressFrameRef.current !== null) {
        window.cancelAnimationFrame(progressFrameRef.current);
      }
      if (wheelTimerRef.current !== null) {
        window.clearTimeout(wheelTimerRef.current);
      }
    },
    [clearQuietTimer],
  );

  return (
    <div
      ref={frameRef}
      className={styles.pagerFrame}
      data-home-feed-pager=""
      data-home-pager-native=""
      data-home-pager-platform={platform}
      data-home-pager-scrolling="false"
      onClickCapture={(event) => {
        if (
          suppressClickUntilRef.current > 0 &&
          performance.now() <= suppressClickUntilRef.current
        ) {
          event.preventDefault();
          event.stopPropagation();
          suppressClickUntilRef.current = 0;
        }
      }}
      onScroll={handleScroll}
      onTouchCancelCapture={handleTouchFinish}
      onTouchEndCapture={handleTouchFinish}
      onTouchStartCapture={handleTouchStart}
      onWheel={handleWheel}
    >
      <div className={styles.pagerTrack} data-home-feed-track="">
        {homeFeeds.map((feed) => {
          const selected = feed === activeFeed;
          return (
            <section
              key={feed}
              ref={(node) => {
                panelRefs.current[feed] = node;
              }}
              aria-hidden={!selected}
              aria-labelledby={`home-tab-${feed}`}
              className={styles.feedPanel}
              data-home-feed-panel={feed}
              data-home-feed-scroll-surface={platform === "pc" ? undefined : ""}
              id={`home-panel-${feed}`}
              inert={!selected || undefined}
              onScroll={(event) => {
                if (
                  platform === "pc" ||
                  !primaryVisibleRef.current ||
                  feed !== homeFeeds[activeIndexRef.current] ||
                  frameRef.current?.clientWidth === 0
                ) {
                  return;
                }
                preservedPanelScrollTopsRef.current[feed] =
                  event.currentTarget.scrollTop;
              }}
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
});
