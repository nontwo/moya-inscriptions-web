"use client";

import { flushSync } from "react-dom";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import {
  HOME_PAGER_CLICK_SUPPRESS_PX,
  HOME_PAGER_FALLBACK_STABLE_FRAMES,
  homePagerProgress,
  isExplicitHorizontalHomeWheel,
  isHomePagerAtOffset,
  resolveHomePagerSettledIndex,
} from "../home/home-feed-pager-motion";
import { createCategoryPagerEngine } from "../shell/category-pager-engine";
import type { CategoryPagerEngine } from "../shell/category-pager-engine";
import { calligraphyCategories } from "./calligraphy-category";
import styles from "./calligraphy-category.module.css";

import type {
  ReactNode,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import type { PresentationPlatform } from "../shell/device-platform";
import type {
  CalligraphyCategory,
  CalligraphyCategoryState,
} from "./calligraphy-category";

interface ScrollSession {
  readonly generation: number;
  hasScrolled: boolean;
  readonly originIndex: number;
  scrollEndPending: boolean;
}

export interface CalligraphyCategoryPagerHandle {
  readonly scrollToCategory: (category: CalligraphyCategory) => void;
}

export interface CalligraphyCategoryPagerProps {
  readonly activeCategory: CalligraphyCategory;
  readonly onCommit: (category: CalligraphyCategory) => void;
  readonly onProgress: (progress: number) => void;
  readonly panels: Readonly<Record<CalligraphyCategory, ReactNode>>;
  readonly panelStates: Readonly<
    Record<CalligraphyCategory, CalligraphyCategoryState["state"]>
  >;
  readonly platform: PresentationPlatform;
  readonly primaryVisible: boolean;
  readonly readCurrentScrollTop: () => number;
  readonly readSavedCategoryScrollTop: (
    category: CalligraphyCategory,
  ) => number;
}

export const CalligraphyCategoryPager = forwardRef<
  CalligraphyCategoryPagerHandle,
  CalligraphyCategoryPagerProps
>(function CalligraphyCategoryPager(
  {
    activeCategory,
    onCommit,
    onProgress,
    panels,
    panelStates,
    platform,
    primaryVisible,
    readCurrentScrollTop,
    readSavedCategoryScrollTop,
  },
  ref,
) {
  const usesEmbla = platform !== "pc";
  const engineRef = useRef<CategoryPagerEngine | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<Record<CalligraphyCategory, HTMLElement | null>>({
    all: null,
    ink: null,
    rubbing: null,
  });
  const activeIndex = calligraphyCategories.indexOf(activeCategory);
  const activeIndexRef = useRef(activeIndex);
  const onCommitRef = useRef(onCommit);
  const onProgressRef = useRef(onProgress);
  const scrollReadersRef = useRef({
    readCurrentScrollTop,
    readSavedCategoryScrollTop,
  });
  // Only this gesture/tail owns these display offsets. Screen retains the
  // actual per-category reading positions and Shell retains restoration.
  const readingTransitionRef = useRef<number[] | null>(null);
  const readingMotionRef = useRef(false);
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
  onCommitRef.current = onCommit;
  onProgressRef.current = onProgress;
  scrollReadersRef.current = {
    readCurrentScrollTop,
    readSavedCategoryScrollTop,
  };

  const readSnapOffsets = useCallback((): number[] => {
    const offsets: number[] = [];
    for (const category of calligraphyCategories) {
      const panel = panelRefs.current[category];
      if (panel === null) return [];
      offsets.push(panel.offsetLeft);
    }
    return offsets;
  }, []);

  const readPanelHeight = useCallback((index: number) => {
    const category = calligraphyCategories[index];
    const panel = category === undefined ? null : panelRefs.current[category];
    if (panel === null) return null;
    const height = Math.ceil(
      Math.max(panel.scrollHeight, panel.getBoundingClientRect().height),
    );
    return height > 0 ? `${height}px` : null;
  }, []);

  const applyPanelHeight = useCallback(
    (index: number) => {
      const frame = frameRef.current;
      const height = readPanelHeight(index);
      if (frame !== null && height !== null && frame.style.height !== height) {
        frame.style.height = height;
      }
    },
    [readPanelHeight],
  );

  const scrollOwner = useCallback(
    () =>
      frameRef.current?.closest<HTMLElement>(
        '[data-primary-destination="calligraphy"]',
      ) ?? null,
    [],
  );

  const readTargetScrollTop = useCallback(
    (index: number) => {
      const category = calligraphyCategories[index];
      const frame = frameRef.current;
      const owner = scrollOwner();
      if (category === undefined || frame === null || owner === null) return 0;
      const panelHeight = Number.parseFloat(readPanelHeight(index) ?? "0");
      const minimumHeight =
        Number.parseFloat(window.getComputedStyle(frame).minHeight) || 0;
      const targetHeight = Math.max(panelHeight, minimumHeight);
      const maximum = Math.max(
        0,
        owner.scrollHeight -
          frame.getBoundingClientRect().height +
          targetHeight -
          owner.clientHeight,
      );
      const saved =
        scrollReadersRef.current.readSavedCategoryScrollTop(category);
      return Number.isFinite(saved) ? Math.max(0, Math.min(saved, maximum)) : 0;
    },
    [readPanelHeight, scrollOwner],
  );

  const prepareReadingTransition = useCallback(() => {
    if (readingTransitionRef.current !== null) return;
    const currentTop = scrollReadersRef.current.readCurrentScrollTop();
    readingTransitionRef.current = calligraphyCategories.map((_, index) =>
      index === activeIndexRef.current
        ? currentTop
        : readTargetScrollTop(index),
    );
  }, [readTargetScrollTop]);

  const clearReadingTransition = useCallback(() => {
    readingTransitionRef.current = null;
    readingMotionRef.current = false;
    // A visibility update can detach callback refs before layout cleanup,
    // while the existing track and its panels remain mounted.
    const track = frameRef.current?.firstElementChild;
    for (const panel of Array.from(track?.children ?? [])) {
      if (panel instanceof HTMLElement) panel.style.transform = "";
    }
  }, []);

  const updateReadingPresentation = useCallback(() => {
    const positions = readingTransitionRef.current;
    if (positions === null || !readingMotionRef.current) return;
    const currentTop = scrollReadersRef.current.readCurrentScrollTop();
    for (const [index, category] of calligraphyCategories.entries()) {
      const panel = panelRefs.current[category];
      if (panel === null) continue;
      // The interactive page always uses the real native scroll position.
      // Only its neighbours retain their own reading view during the X tail.
      const offset =
        index === activeIndexRef.current
          ? 0
          : currentTop - (positions[index] ?? 0);
      panel.style.transform =
        offset === 0 ? "" : `translate3d(0, ${offset}px, 0)`;
    }
  }, []);

  const cancelProgressFrame = useCallback(() => {
    if (progressFrameRef.current === null) return;
    window.cancelAnimationFrame(progressFrameRef.current);
    progressFrameRef.current = null;
  }, []);

  const publishProgress = useCallback(
    (immediate = false) => {
      if (usesEmbla) return;
      const publish = () => {
        progressFrameRef.current = null;
        const frame = frameRef.current;
        if (frame === null) return;
        onProgressRef.current(
          homePagerProgress(frame.scrollLeft, readSnapOffsets()),
        );
      };
      if (immediate) {
        cancelProgressFrame();
        publish();
      } else if (progressFrameRef.current === null) {
        progressFrameRef.current = window.requestAnimationFrame(publish);
      }
    },
    [cancelProgressFrame, readSnapOffsets, usesEmbla],
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
      if (frameRef.current !== null) {
        frameRef.current.dataset.calligraphyPagerScrolling = "false";
      }
    },
    [cancelFallback, cancelProgressFrame],
  );

  const startSession = useCallback(
    (originIndex: number): ScrollSession => {
      generationRef.current += 1;
      cancelFallback();
      cancelProgressFrame();
      internalCommitIndexRef.current = null;
      const session = {
        generation: generationRef.current,
        hasScrolled: false,
        originIndex,
        scrollEndPending: false,
      } satisfies ScrollSession;
      sessionRef.current = session;
      if (frameRef.current !== null) {
        frameRef.current.dataset.calligraphyPagerScrolling = "true";
      }
      return session;
    },
    [cancelFallback, cancelProgressFrame],
  );

  const finishSettle = useCallback(
    (generation: number, targetIndex: number) => {
      const session = sessionRef.current;
      if (session === null || session.generation !== generation) return;
      cancelFallback();
      sessionRef.current = null;
      touchStartScrollLeftRef.current = null;
      if (frameRef.current !== null) {
        frameRef.current.dataset.calligraphyPagerScrolling = "false";
      }
      const target = calligraphyCategories[targetIndex];
      if (target !== undefined && targetIndex !== activeIndexRef.current) {
        internalCommitIndexRef.current = targetIndex;
        onCommitRef.current(target);
      }
      applyPanelHeight(targetIndex);
      publishProgress(true);
    },
    [applyPanelHeight, cancelFallback, publishProgress],
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
      if (offsets.length !== calligraphyCategories.length) return;
      const targetIndex = resolveHomePagerSettledIndex(
        frame.scrollLeft,
        offsets,
      );
      const targetOffset = offsets[targetIndex];
      if (
        targetOffset !== undefined &&
        isHomePagerAtOffset(frame.scrollLeft, targetOffset)
      ) {
        finishSettle(generation, targetIndex);
      }
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
      if (behavior === "auto") {
        frame.scrollLeft = offset;
      } else if (typeof frame.scrollTo === "function") {
        frame.scrollTo({ behavior, left: offset, top: 0 });
      } else {
        frame.scrollLeft = offset;
        frame.dispatchEvent(new Event("scroll"));
      }
    },
    [readSnapOffsets],
  );

  const requestCategory = useCallback(
    (category: CalligraphyCategory) => {
      if (usesEmbla) {
        if (category !== calligraphyCategories[activeIndexRef.current])
          prepareReadingTransition();
        engineRef.current?.scrollTo(calligraphyCategories.indexOf(category));
        return;
      }
      const frame = frameRef.current;
      const targetIndex = calligraphyCategories.indexOf(category);
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
      startSession(resolveHomePagerSettledIndex(frame.scrollLeft, offsets));
      scrollFrameToIndex(targetIndex, "auto");
    },
    [
      usesEmbla,
      prepareReadingTransition,
      publishProgress,
      readSnapOffsets,
      scrollFrameToIndex,
      startSession,
    ],
  );

  useImperativeHandle(ref, () => ({ scrollToCategory: requestCategory }), [
    requestCategory,
  ]);

  const handleScroll = useCallback(() => {
    if (usesEmbla) return;
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
    const currentWidth = frame.clientWidth;
    if (
      frameWidthRef.current > 0 &&
      currentWidth > 0 &&
      Math.abs(currentWidth - frameWidthRef.current) > 0.5
    ) {
      invalidateSession();
      const committedOffset = offsets[activeIndexRef.current];
      if (committedOffset !== undefined) frame.scrollLeft = committedOffset;
      publishProgress(true);
      return;
    }
    const activeOffset = offsets[activeIndexRef.current];
    let session = sessionRef.current;
    if (
      session === null &&
      activeOffset !== undefined &&
      isHomePagerAtOffset(frame.scrollLeft, activeOffset)
    ) {
      return;
    }
    if (session === null) session = startSession(activeIndexRef.current);
    session.hasScrolled = true;
    session.scrollEndPending = false;
    publishProgress();
    scheduleFallback(session.generation);
  }, [
    usesEmbla,
    invalidateSession,
    publishProgress,
    readSnapOffsets,
    scheduleFallback,
    startSession,
  ]);

  const handleTouchStart = useCallback(
    (event: ReactTouchEvent) => {
      if (event.touches?.length > 1) return;
      const frame = frameRef.current;
      if (frame === null) return;
      touchActiveRef.current = true;
      if (usesEmbla) {
        prepareReadingTransition();
        return;
      }
      suppressClickUntilRef.current = 0;
      touchStartScrollLeftRef.current = frame.scrollLeft;
      startSession(
        resolveHomePagerSettledIndex(frame.scrollLeft, readSnapOffsets()),
      );
    },
    [usesEmbla, prepareReadingTransition, readSnapOffsets, startSession],
  );

  const handleTouchFinish = useCallback(
    (event: ReactTouchEvent) => {
      if (event.touches.length > 0) return;
      touchActiveRef.current = false;
      if (usesEmbla) {
        if (!readingMotionRef.current) clearReadingTransition();
        applyPanelHeight(activeIndexRef.current);
        return;
      }
      const session = sessionRef.current;
      if (session === null) {
        touchStartScrollLeftRef.current = null;
        return;
      }
      if (!session.hasScrolled) {
        invalidateSession(false);
        applyPanelHeight(activeIndexRef.current);
      } else if (session.scrollEndPending) {
        session.scrollEndPending = false;
        settleRef.current(session.generation);
      } else {
        scheduleFallback(session.generation);
      }
    },
    [
      usesEmbla,
      applyPanelHeight,
      clearReadingTransition,
      invalidateSession,
      scheduleFallback,
    ],
  );

  const cancelToCommitted = useCallback(() => {
    if (usesEmbla) {
      touchActiveRef.current = false;
      clearReadingTransition();
      applyPanelHeight(activeIndexRef.current);
      return;
    }
    const frame = frameRef.current;
    const offset = readSnapOffsets()[activeIndexRef.current];
    invalidateSession();
    if (frame !== null && offset !== undefined) frame.scrollLeft = offset;
    applyPanelHeight(activeIndexRef.current);
    publishProgress(true);
  }, [
    usesEmbla,
    applyPanelHeight,
    clearReadingTransition,
    invalidateSession,
    publishProgress,
    readSnapOffsets,
  ]);

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
        const targetIndex = Math.max(
          0,
          Math.min(
            calligraphyCategories.length - 1,
            activeIndexRef.current + (event.deltaX > 0 ? 1 : -1),
          ),
        );
        const target = calligraphyCategories[targetIndex];
        if (target !== undefined) requestCategory(target);
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
    [platform, requestCategory],
  );

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!usesEmbla || !primaryVisible || frame === null) return;
    frame.scrollLeft = 0;
    const engine = createCategoryPagerEngine(frame, {
      getCommittedIndex: () => activeIndexRef.current,
      onCommit: (index) => {
        const category = calligraphyCategories[index];
        if (category === undefined) return;
        prepareReadingTransition();
        const positions = readingTransitionRef.current;
        if (positions !== null)
          positions[activeIndexRef.current] =
            scrollReadersRef.current.readCurrentScrollTop();
        const targetTop = readTargetScrollTop(index);
        internalCommitIndexRef.current = index;
        // Save the departing page's scroll before a shorter target height can
        // clamp it. The category and inert ownership change in this input task.
        flushSync(() => onCommitRef.current(category));
        applyPanelHeight(index);
        // The next input can cancel Shell's queued restoration. Hand off the
        // same native owner now, after Screen saved the departing position and
        // the target's real height is in place. No temporary height extends its
        // scroll range, so Shell's later bounded restore sees that same range.
        const owner = scrollOwner();
        if (owner !== null) {
          owner.scrollTop = Math.min(
            targetTop,
            Math.max(0, owner.scrollHeight - owner.clientHeight),
          );
        }
        // A reduced-motion tab jump emits settle before select, so there is
        // no later visual tail to clear these neighbouring display offsets.
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
          clearReadingTransition();
        } else {
          readingMotionRef.current = true;
          updateReadingPresentation();
        }
      },
      onProgress: (progress) => {
        updateReadingPresentation();
        onProgressRef.current(progress);
      },
      onMotion: (moving) => {
        frame.dataset.calligraphyPagerScrolling = String(moving);
        if (moving) {
          prepareReadingTransition();
          readingMotionRef.current = true;
        } else clearReadingTransition();
      },
    });
    engineRef.current = engine;
    const owner = scrollOwner();
    owner?.addEventListener("scroll", updateReadingPresentation, {
      passive: true,
    });
    // The engine cleans its input session, while this host separately owns
    // the page-height freeze. Interrupted touches may never deliver touchend.
    const releaseHeight = () => {
      touchActiveRef.current = false;
      clearReadingTransition();
      applyPanelHeight(activeIndexRef.current);
    };
    const hidden = () => {
      if (document.hidden) releaseHeight();
    };
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", releaseHeight);
    window.addEventListener("blur", releaseHeight);
    window.addEventListener("orientationchange", releaseHeight);
    window.visualViewport?.addEventListener("resize", releaseHeight);
    return () => {
      engineRef.current = null;
      touchActiveRef.current = false;
      engine.destroy();
      clearReadingTransition();
      owner?.removeEventListener("scroll", updateReadingPresentation);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", releaseHeight);
      window.removeEventListener("blur", releaseHeight);
      window.removeEventListener("orientationchange", releaseHeight);
      window.visualViewport?.removeEventListener("resize", releaseHeight);
    };
  }, [
    usesEmbla,
    primaryVisible,
    applyPanelHeight,
    clearReadingTransition,
    prepareReadingTransition,
    readTargetScrollTop,
    scrollOwner,
    updateReadingPresentation,
  ]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    if (usesEmbla) {
      engineRef.current?.sync(activeIndex);
      internalCommitIndexRef.current = null;
      frameWidthRef.current = frame.clientWidth;
      applyPanelHeight(activeIndex);
      return;
    }
    if (internalCommitIndexRef.current === activeIndex) {
      internalCommitIndexRef.current = null;
    } else {
      invalidateSession();
      const offset = readSnapOffsets()[activeIndex];
      if (offset !== undefined) frame.scrollLeft = offset;
    }
    frameWidthRef.current = frame.clientWidth;
    applyPanelHeight(activeIndex);
    publishProgress(true);
  }, [
    usesEmbla,
    activeCategory,
    activeIndex,
    applyPanelHeight,
    invalidateSession,
    platform,
    publishProgress,
    readSnapOffsets,
  ]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (frame === null || usesEmbla) return undefined;
    supportsScrollEndRef.current = "onscrollend" in frame;
    frame.dataset.calligraphyPagerSettleMode = supportsScrollEndRef.current
      ? "scrollend"
      : "stable-frames";
    const handleScrollEnd = () => {
      const session = sessionRef.current;
      if (session === null) return;
      if (touchActiveRef.current) session.scrollEndPending = true;
      else settleRef.current(session.generation);
    };
    frame.addEventListener("scrollend", handleScrollEnd);
    return () => frame.removeEventListener("scrollend", handleScrollEnd);
  }, [usesEmbla]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (
      !primaryVisible ||
      frame === null ||
      typeof ResizeObserver !== "function"
    ) {
      return;
    }
    let disposed = false;
    let heightFrame: number | null = null;
    const cancelHeightFrame = () => {
      if (heightFrame === null) return;
      window.cancelAnimationFrame(heightFrame);
      heightFrame = null;
    };
    const observer = new ResizeObserver(() => {
      if (disposed || frameRef.current !== frame || !frame.isConnected) return;
      const width = frame.clientWidth;
      if (width <= 0) {
        frameWasUnavailableRef.current = true;
        cancelHeightFrame();
        return;
      }
      const becameAvailable = frameWasUnavailableRef.current;
      frameWasUnavailableRef.current = false;
      if (becameAvailable || Math.abs(width - frameWidthRef.current) > 0.5) {
        frameWidthRef.current = width;
        invalidateSession();
        const offset = readSnapOffsets()[activeIndexRef.current];
        if (usesEmbla) engineRef.current?.resize();
        else if (offset !== undefined) frame.scrollLeft = offset;
        publishProgress(true);
      }
      const height = readPanelHeight(activeIndexRef.current);
      if (
        sessionRef.current !== null ||
        touchActiveRef.current ||
        height === null ||
        frame.style.height === height
      ) {
        cancelHeightFrame();
        return;
      }
      // This observer also watches the frame: writing its height during
      // delivery would resize an observed ancestor again in the same cycle.
      if (heightFrame !== null) return;
      heightFrame = window.requestAnimationFrame(() => {
        heightFrame = null;
        if (
          disposed ||
          frameRef.current !== frame ||
          !frame.isConnected ||
          frame.clientWidth <= 0 ||
          sessionRef.current !== null ||
          touchActiveRef.current
        ) {
          return;
        }
        applyPanelHeight(activeIndexRef.current);
      });
    });
    observer.observe(frame);
    for (const category of calligraphyCategories) {
      const panel = panelRefs.current[category];
      if (panel !== null) observer.observe(panel);
    }
    return () => {
      disposed = true;
      observer.disconnect();
      cancelHeightFrame();
    };
  }, [
    usesEmbla,
    applyPanelHeight,
    invalidateSession,
    primaryVisible,
    publishProgress,
    readPanelHeight,
    readSnapOffsets,
  ]);

  useLayoutEffect(() => {
    if (!primaryVisible) {
      invalidateSession();
      return;
    }
    const frame = frameRef.current;
    const offset = readSnapOffsets()[activeIndexRef.current];
    if (frame !== null) {
      const width = frame.clientWidth;
      if (width > 0) {
        frameWidthRef.current = width;
        frameWasUnavailableRef.current = false;
      } else {
        frameWasUnavailableRef.current = true;
      }
      if (!usesEmbla && offset !== undefined) frame.scrollLeft = offset;
    }
    applyPanelHeight(activeIndexRef.current);
    publishProgress(true);
  }, [
    usesEmbla,
    applyPanelHeight,
    invalidateSession,
    primaryVisible,
    publishProgress,
    readSnapOffsets,
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
      data-calligraphy-category-pager=""
      data-calligraphy-pager-native={usesEmbla ? undefined : ""}
      data-category-pager-engine={usesEmbla ? "embla" : undefined}
      data-calligraphy-pager-platform={platform}
      data-calligraphy-pager-scrolling="false"
      onClickCapture={(event) => {
        if (
          !usesEmbla &&
          event.detail !== 0 &&
          suppressClickUntilRef.current > 0 &&
          performance.now() <= suppressClickUntilRef.current
        ) {
          event.preventDefault();
          event.stopPropagation();
          suppressClickUntilRef.current = 0;
        }
      }}
      onPointerCancelCapture={(event) => {
        if (!usesEmbla && event.pointerType !== "touch") cancelToCommitted();
      }}
      onScroll={handleScroll}
      onTouchCancelCapture={cancelToCommitted}
      onTouchEndCapture={handleTouchFinish}
      onTouchStartCapture={handleTouchStart}
      onWheel={handleWheel}
    >
      <div className={styles.pagerTrack} data-calligraphy-category-track="">
        {calligraphyCategories.map((category) => {
          const selected = category === activeCategory;
          return (
            <section
              key={category}
              ref={(node) => {
                panelRefs.current[category] = node;
              }}
              aria-hidden={!selected}
              aria-labelledby={`calligraphy-tab-${category}`}
              className={styles.panel}
              data-calligraphy-category-panel={category}
              data-catalog-presentation={selected ? "calligraphy" : undefined}
              data-catalog-presentation-state={
                selected ? panelStates[category] : undefined
              }
              id={`calligraphy-panel-${category}`}
              inert={!selected || undefined}
              role="tabpanel"
              tabIndex={selected ? 0 : -1}
            >
              {panels[category]}
            </section>
          );
        })}
      </div>
    </div>
  );
});
