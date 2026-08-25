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
  HOME_PAGER_FALLBACK_STABLE_FRAMES,
  homePagerProgress,
  isExplicitHorizontalHomeWheel,
  isHomePagerAtOffset,
  resolveHomePagerSettledIndex,
} from "./home-feed-pager-motion";
import { homeFeeds } from "./home-feed";

import type { ReactNode, WheelEvent as ReactWheelEvent } from "react";
import type { HomeFeed } from "./home-feed";
import type { PresentationPlatform } from "../shell/device-platform";

interface ScrollSession {
  readonly generation: number;
  hasScrolled: boolean;
  readonly mode: "native" | "programmatic";
  readonly originIndex: number;
  readonly requestedIndex: number | null;
  scrollEndPending: boolean;
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
  const generationRef = useRef(0);
  const fallbackFrameRef = useRef<number | null>(null);
  const fallbackTokenRef = useRef(0);
  const progressFrameRef = useRef<number | null>(null);
  const wheelTimerRef = useRef<number | null>(null);
  const wheelHandledRef = useRef(false);
  const frameWidthRef = useRef(0);
  const frameWasUnavailableRef = useRef(false);
  const touchActiveRef = useRef(false);
  const touchStartScrollLeftRef = useRef<number | null>(null);
  const suppressClickUntilRef = useRef(0);
  const supportsScrollEndRef = useRef(false);
  const internalCommitIndexRef = useRef<number | null>(null);
  const settleRef = useRef<(generation: number) => void>(() => undefined);

  activeIndexRef.current = activeIndex;
  primaryVisibleRef.current = primaryVisible;
  onCommitRef.current = onCommit;
  onProgressRef.current = onProgress;

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

  const readSnapOffsets = useCallback((): number[] => {
    const offsets: number[] = [];
    for (const feed of homeFeeds) {
      const panel = panelRefs.current[feed];
      if (panel === null) return [];
      offsets.push(panel.offsetLeft);
    }
    return offsets;
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

  const cancelProgressFrame = useCallback(() => {
    if (progressFrameRef.current === null) return;
    window.cancelAnimationFrame(progressFrameRef.current);
    progressFrameRef.current = null;
  }, []);

  const publishProgress = useCallback(
    (immediate = false) => {
      const publish = () => {
        progressFrameRef.current = null;
        const frame = frameRef.current;
        if (frame === null) return;
        const offsets = readSnapOffsets();
        onProgressRef.current?.(homePagerProgress(frame.scrollLeft, offsets));
      };
      if (immediate) {
        cancelProgressFrame();
        publish();
        return;
      }
      if (progressFrameRef.current === null) {
        progressFrameRef.current = window.requestAnimationFrame(publish);
      }
    },
    [cancelProgressFrame, readSnapOffsets],
  );

  const cancelFallback = useCallback(() => {
    fallbackTokenRef.current += 1;
    if (fallbackFrameRef.current !== null) {
      window.cancelAnimationFrame(fallbackFrameRef.current);
      fallbackFrameRef.current = null;
    }
  }, []);

  const invalidateSession = useCallback(
    (resetTouch = true) => {
      generationRef.current += 1;
      cancelFallback();
      cancelProgressFrame();
      sessionRef.current = null;
      internalCommitIndexRef.current = null;
      if (resetTouch) touchActiveRef.current = false;
      touchStartScrollLeftRef.current = null;
      setScrolling(false);
    },
    [cancelFallback, cancelProgressFrame, setScrolling],
  );

  const startSession = useCallback(
    (
      mode: ScrollSession["mode"],
      requestedIndex: number | null,
      originIndex: number,
    ): ScrollSession => {
      generationRef.current += 1;
      cancelFallback();
      cancelProgressFrame();
      internalCommitIndexRef.current = null;
      const session: ScrollSession = {
        generation: generationRef.current,
        hasScrolled: false,
        mode,
        originIndex,
        requestedIndex,
        scrollEndPending: false,
      };
      sessionRef.current = session;
      setScrolling(true);
      if (platform === "pc") applyPanelHeight(originIndex);
      return session;
    },
    [
      applyPanelHeight,
      cancelFallback,
      cancelProgressFrame,
      platform,
      setScrolling,
    ],
  );

  const finishSettle = useCallback(
    (generation: number, targetIndex: number) => {
      const session = sessionRef.current;
      if (session === null || session.generation !== generation) return;
      cancelFallback();
      sessionRef.current = null;
      touchStartScrollLeftRef.current = null;
      setScrolling(false);
      if (platform === "pc") applyPanelHeight(targetIndex);
      publishProgress(true);
      const targetFeed = homeFeeds[targetIndex];
      if (targetFeed !== undefined && targetIndex !== activeIndexRef.current) {
        internalCommitIndexRef.current = targetIndex;
        onCommitRef.current(targetFeed);
      }
    },
    [applyPanelHeight, cancelFallback, platform, publishProgress, setScrolling],
  );

  const settlePager = useCallback(
    (generation: number) => {
      const frame = frameRef.current;
      const session = sessionRef.current;
      if (
        frame === null ||
        session === null ||
        session.generation !== generation ||
        touchActiveRef.current
      ) {
        return;
      }
      const offsets = readSnapOffsets();
      if (offsets.length !== homeFeeds.length) return;
      const targetIndex = resolveHomePagerSettledIndex(
        frame.scrollLeft,
        offsets,
      );
      const targetOffset = offsets[targetIndex];
      if (
        targetOffset === undefined ||
        !isHomePagerAtOffset(frame.scrollLeft, targetOffset)
      ) {
        return;
      }
      finishSettle(generation, targetIndex);
    },
    [finishSettle, readSnapOffsets],
  );
  settleRef.current = settlePager;

  const scheduleFallback = useCallback(
    (generation: number) => {
      if (supportsScrollEndRef.current) return;
      cancelFallback();
      const frame = frameRef.current;
      if (frame === null) return;
      const token = fallbackTokenRef.current;
      let lastLeft = frame.scrollLeft;
      let stableFrames = 0;
      const sample = () => {
        fallbackFrameRef.current = null;
        const currentFrame = frameRef.current;
        const session = sessionRef.current;
        if (
          currentFrame === null ||
          token !== fallbackTokenRef.current ||
          session === null ||
          session.generation !== generation
        ) {
          return;
        }
        const nextLeft = currentFrame.scrollLeft;
        if (touchActiveRef.current) {
          stableFrames = 0;
        } else if (Math.abs(nextLeft - lastLeft) <= 0.25) {
          stableFrames += 1;
        } else {
          stableFrames = 0;
        }
        lastLeft = nextLeft;
        if (stableFrames >= HOME_PAGER_FALLBACK_STABLE_FRAMES) {
          settleRef.current(generation);
          return;
        }
        fallbackFrameRef.current = window.requestAnimationFrame(sample);
      };
      fallbackFrameRef.current = window.requestAnimationFrame(sample);
    },
    [cancelFallback],
  );

  const scrollFrameToIndex = useCallback(
    (index: number, behavior: ScrollBehavior) => {
      const frame = frameRef.current;
      const offset = readSnapOffsets()[index];
      if (frame === null || offset === undefined) return;
      if (typeof frame.scrollTo === "function") {
        frame.scrollTo({ behavior, left: offset, top: 0 });
      } else {
        frame.scrollLeft = offset;
        frame.dispatchEvent(new Event("scroll"));
      }
    },
    [readSnapOffsets],
  );

  const requestFeed = useCallback(
    (feed: HomeFeed) => {
      const frame = frameRef.current;
      const targetIndex = homeFeeds.indexOf(feed);
      const offsets = readSnapOffsets();
      const targetOffset = offsets[targetIndex];
      if (frame === null || targetIndex < 0 || targetOffset === undefined)
        return;
      if (
        targetIndex === activeIndexRef.current &&
        isHomePagerAtOffset(frame.scrollLeft, targetOffset)
      ) {
        publishProgress(true);
        return;
      }
      const originIndex = resolveHomePagerSettledIndex(
        frame.scrollLeft,
        offsets,
      );
      startSession("programmatic", targetIndex, originIndex);
      scrollFrameToIndex(
        targetIndex,
        platform === "pc" || reducedMotionPreferred() ? "auto" : "smooth",
      );
    },
    [
      platform,
      publishProgress,
      readSnapOffsets,
      scrollFrameToIndex,
      startSession,
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
    const touchStart = touchStartScrollLeftRef.current;
    if (
      touchStart !== null &&
      Math.abs(frame.scrollLeft - touchStart) > HOME_PAGER_CLICK_SUPPRESS_PX
    ) {
      suppressClickUntilRef.current = performance.now() + 500;
    }
    const offsets = readSnapOffsets();
    const activeOffset = offsets[activeIndexRef.current];
    let session = sessionRef.current;
    if (
      session === null &&
      activeOffset !== undefined &&
      isHomePagerAtOffset(frame.scrollLeft, activeOffset)
    ) {
      return;
    }
    if (session === null) {
      session = startSession("native", null, activeIndexRef.current);
    }
    session.hasScrolled = true;
    session.scrollEndPending = false;
    publishProgress();
    scheduleFallback(session.generation);
  }, [publishProgress, readSnapOffsets, scheduleFallback, startSession]);

  const handleTouchStart = useCallback(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    touchActiveRef.current = true;
    suppressClickUntilRef.current = 0;
    touchStartScrollLeftRef.current = frame.scrollLeft;
    const offsets = readSnapOffsets();
    const originIndex = resolveHomePagerSettledIndex(frame.scrollLeft, offsets);
    startSession("native", null, originIndex);
  }, [readSnapOffsets, startSession]);

  const handleTouchFinish = useCallback(() => {
    touchActiveRef.current = false;
    const session = sessionRef.current;
    if (session === null) {
      touchStartScrollLeftRef.current = null;
      return;
    }
    if (!session.hasScrolled) {
      invalidateSession(false);
      return;
    }
    if (session.scrollEndPending) {
      session.scrollEndPending = false;
      settleRef.current(session.generation);
      return;
    }
    scheduleFallback(session.generation);
  }, [invalidateSession, scheduleFallback]);

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
    const internalCommit = internalCommitIndexRef.current === activeIndex;
    if (internalCommit) {
      internalCommitIndexRef.current = null;
    } else {
      invalidateSession();
      const offset = readSnapOffsets()[activeIndex];
      if (
        offset !== undefined &&
        !isHomePagerAtOffset(frame.scrollLeft, offset)
      ) {
        frame.scrollLeft = offset;
      }
    }
    frameWidthRef.current = frame.clientWidth;
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
    invalidateSession,
    platform,
    publishProgress,
    readPanelHeight,
    readSnapOffsets,
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
    if (frame === null) return undefined;
    supportsScrollEndRef.current = "onscrollend" in frame;
    frame.dataset.homePagerSettleMode = supportsScrollEndRef.current
      ? "scrollend"
      : "stable-frames";
    const handleScrollEnd = () => {
      const session = sessionRef.current;
      if (session === null) return;
      if (touchActiveRef.current) {
        session.scrollEndPending = true;
        return;
      }
      settleRef.current(session.generation);
    };
    frame.addEventListener("scrollend", handleScrollEnd);
    return () => frame.removeEventListener("scrollend", handleScrollEnd);
  }, []);

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
      if (Math.abs(width - frameWidthRef.current) > 0.5) {
        frameWidthRef.current = width;
        invalidateSession();
        const offset = readSnapOffsets()[activeIndexRef.current];
        if (offset !== undefined) frame.scrollLeft = offset;
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
    invalidateSession,
    platform,
    publishProgress,
    readPanelHeight,
    readSnapOffsets,
    restorePreservedPanelScrollTops,
  ]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      cancelFallback();
      cancelProgressFrame();
      if (wheelTimerRef.current !== null) {
        window.clearTimeout(wheelTimerRef.current);
      }
    },
    [cancelFallback, cancelProgressFrame],
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
