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

import {
  HORIZONTAL_PAGER_SETTLE_MS,
  pagerSettleProgress,
  resolvePagerDirection,
  resolvePagerRelease,
} from "../shell/horizontal-pager-motion";
import type { PagerDirection } from "../shell/horizontal-pager-motion";

interface PagerTouch {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  readonly left: number;
  readonly origin: number;
  readonly target: Element | null;
  direction: PagerDirection;
  lastX: number;
  lastTime: number;
  velocity: number;
}

interface ScrollSession {
  readonly generation: number;
  hasScrolled: boolean;
  controlled?: boolean;
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
}

const reducedMotionPreferred = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

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
  },
  ref,
) {
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
  const sessionRef = useRef<ScrollSession | null>(null);
  const pagerTouchRef = useRef<PagerTouch | null>(null);
  const animationFrameRef = useRef<number | null>(null);
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
    [cancelProgressFrame, readSnapOffsets],
  );

  const cancelFallback = useCallback(() => {
    fallbackTokenRef.current += 1;
    if (fallbackFrameRef.current !== null) {
      window.cancelAnimationFrame(fallbackFrameRef.current);
      fallbackFrameRef.current = null;
    }
  }, []);

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const invalidateSession = useCallback(
    (resetTouch = true) => {
      generationRef.current += 1;
      cancelAnimation();
      const capturedPointer = pagerTouchRef.current?.pointerId;
      pagerTouchRef.current = null;
      if (
        capturedPointer !== undefined &&
        frameRef.current?.hasPointerCapture?.(capturedPointer)
      )
        frameRef.current.releasePointerCapture(capturedPointer);
      if (frameRef.current) frameRef.current.style.scrollSnapType = "";
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
    [cancelAnimation, cancelFallback, cancelProgressFrame],
  );

  const startSession = useCallback(
    (originIndex: number): ScrollSession => {
      cancelAnimation();
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
    [cancelAnimation, cancelFallback, cancelProgressFrame],
  );

  const finishSettle = useCallback(
    (generation: number, targetIndex: number) => {
      const session = sessionRef.current;
      if (session === null || session.generation !== generation) return;
      cancelAnimation();
      if (frameRef.current) frameRef.current.style.scrollSnapType = "";
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
    [cancelAnimation, applyPanelHeight, cancelFallback, publishProgress],
  );

  const settlePager = useCallback(
    (generation: number) => {
      const frame = frameRef.current;
      const session = sessionRef.current;
      if (
        frame === null ||
        session === null ||
        session.generation !== generation ||
        session.controlled ||
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

  const animateToIndex = useCallback(
    (targetIndex: number, generation: number) => {
      const frame = frameRef.current;
      const session = sessionRef.current;
      const offset = readSnapOffsets()[targetIndex];
      if (
        !frame ||
        !session ||
        session.generation !== generation ||
        offset === undefined
      )
        return;
      cancelAnimation();
      session.controlled = true;
      frame.style.scrollSnapType = "none";
      const from = frame.scrollLeft;
      const began = performance.now();
      const complete = () => {
        frame.scrollLeft = offset;
        // Position, active category and inert ownership change in the same frame.
        flushSync(() => finishSettle(generation, targetIndex));
      };
      if (reducedMotionPreferred() || Math.abs(from - offset) <= 2) {
        complete();
        return;
      }
      const tick = (time: number) => {
        animationFrameRef.current = null;
        if (sessionRef.current?.generation !== generation) return;
        if (time - began >= HORIZONTAL_PAGER_SETTLE_MS) {
          complete();
          return;
        }
        frame.scrollLeft =
          from + (offset - from) * pagerSettleProgress(time - began);
        publishProgress(true);
        animationFrameRef.current = window.requestAnimationFrame(tick);
      };
      animationFrameRef.current = window.requestAnimationFrame(tick);
    },
    [cancelAnimation, finishSettle, publishProgress, readSnapOffsets],
  );

  const requestCategory = useCallback(
    (category: CalligraphyCategory) => {
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
      const session = startSession(
        resolveHomePagerSettledIndex(frame.scrollLeft, offsets),
      );
      if (platform === "pc") scrollFrameToIndex(targetIndex, "auto");
      else animateToIndex(targetIndex, session.generation);
    },
    [
      animateToIndex,
      platform,
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
    const frame = frameRef.current;
    if (frame === null) return;
    if (sessionRef.current?.controlled) {
      publishProgress();
      return;
    }
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
      suppressClickUntilRef.current = 0;
      touchStartScrollLeftRef.current = frame.scrollLeft;
      startSession(
        resolveHomePagerSettledIndex(frame.scrollLeft, readSnapOffsets()),
      );
    },
    [platform, readSnapOffsets, startSession],
  );

  const handleTouchFinish = useCallback(() => {
    touchActiveRef.current = false;
    if (sessionRef.current?.controlled) return;
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
  }, [platform, applyPanelHeight, invalidateSession, scheduleFallback]);

  const cancelToCommitted = useCallback(() => {
    const frame = frameRef.current;
    const offset = readSnapOffsets()[activeIndexRef.current];
    invalidateSession();
    if (frame !== null && offset !== undefined) frame.scrollLeft = offset;
    applyPanelHeight(activeIndexRef.current);
    publishProgress(true);
  }, [applyPanelHeight, invalidateSession, publishProgress, readSnapOffsets]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || platform === "pc" || !primaryVisible) return;
    const cancel = () => {
      const touch = pagerTouchRef.current;
      const capture = touch?.pointerId;
      invalidateSession();
      const offset = readSnapOffsets()[activeIndexRef.current];
      if (offset !== undefined) frame.scrollLeft = offset;
      publishProgress(true);
      if (capture !== undefined && frame.hasPointerCapture?.(capture))
        frame.releasePointerCapture(capture);
    };
    const down = (event: PointerEvent) => {
      if (event.pointerType === "mouse") return;
      if (!event.isPrimary) {
        cancel();
        return;
      }
      if (!frame.contains(event.target as Node)) return;
      if (animationFrameRef.current !== null) {
        const index = resolveHomePagerSettledIndex(
          frame.scrollLeft,
          readSnapOffsets(),
        );
        const generation = sessionRef.current?.generation;
        if (generation !== undefined) {
          cancelAnimation();
          frame.scrollLeft = readSnapOffsets()[index] ?? frame.scrollLeft;
          flushSync(() => finishSettle(generation, index));
        }
      }
      suppressClickUntilRef.current = 0;
      pagerTouchRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        left: frame.scrollLeft,
        origin: activeIndexRef.current,
        target: event.target instanceof Element ? event.target : null,
        direction: "pending",
        lastX: event.clientX,
        lastTime: event.timeStamp,
        velocity: 0,
      };
    };
    const move = (event: PointerEvent) => {
      const touch = pagerTouchRef.current;
      if (!touch || touch.pointerId !== event.pointerId) return;
      if (
        touch.target
          ?.closest("[data-quick-actions]")
          ?.getAttribute("data-quick-action-phase") === "menu-open"
      ) {
        pagerTouchRef.current = null;
        return;
      }
      const dx = event.clientX - touch.x,
        dy = event.clientY - touch.y;
      const direction = resolvePagerDirection(touch.direction, dx, dy);
      if (direction === "horizontal" && touch.direction !== "horizontal") {
        const session = startSession(touch.origin);
        session.controlled = true;
        frame.style.scrollSnapType = "none";
        frame.setPointerCapture?.(event.pointerId);
      }
      touch.direction = direction;
      if (direction !== "horizontal") return;
      const elapsed = event.timeStamp - touch.lastTime;
      if (elapsed > 0) touch.velocity = (touch.lastX - event.clientX) / elapsed;
      touch.lastX = event.clientX;
      touch.lastTime = event.timeStamp;
      const offsets = readSnapOffsets();
      frame.scrollLeft = Math.max(
        offsets[Math.max(0, touch.origin - 1)] ?? 0,
        Math.min(
          offsets[Math.min(offsets.length - 1, touch.origin + 1)] ??
            frame.scrollWidth,
          touch.left - dx,
        ),
      );
      suppressClickUntilRef.current = performance.now() + 500;
      publishProgress(true);
    };
    const up = (event: PointerEvent) => {
      const touch = pagerTouchRef.current;
      if (!touch || touch.pointerId !== event.pointerId) return;
      pagerTouchRef.current = null;
      if (touch.direction === "horizontal") {
        suppressClickUntilRef.current = performance.now() + 500;
        const generation = sessionRef.current?.generation;
        const target = resolvePagerRelease(
          frame.scrollLeft,
          readSnapOffsets(),
          touch.origin,
          event.timeStamp - touch.lastTime > 80 ? 0 : touch.velocity,
        );
        if (generation !== undefined) animateToIndex(target, generation);
      }
      if (frame.hasPointerCapture?.(event.pointerId))
        frame.releasePointerCapture(event.pointerId);
    };
    const interrupted = (event: PointerEvent) => {
      if (event.type === "lostpointercapture" && event.target !== frame) return;
      if (pagerTouchRef.current?.pointerId !== event.pointerId) return;
      if (sessionRef.current?.controlled) cancel();
      else pagerTouchRef.current = null;
    };
    const touches = (event: TouchEvent) => {
      if (event.touches?.length > 1) cancel();
    };
    const hidden = () => {
      if (document.hidden) cancel();
    };
    const blur = (event: FocusEvent) => {
      if (event.target === window) cancel();
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", interrupted, true);
    frame.addEventListener("lostpointercapture", interrupted);
    window.addEventListener("touchstart", touches, {
      capture: true,
      passive: true,
    });
    window.addEventListener("blur", blur);
    window.addEventListener("pagehide", cancel);
    window.addEventListener("resize", cancel);
    window.visualViewport?.addEventListener("resize", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancel();
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", interrupted, true);
      frame.removeEventListener("lostpointercapture", interrupted);
      window.removeEventListener("touchstart", touches, true);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pagehide", cancel);
      window.removeEventListener("resize", cancel);
      window.visualViewport?.removeEventListener("resize", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [
    animateToIndex,
    cancelAnimation,
    finishSettle,
    invalidateSession,
    platform,
    primaryVisible,
    publishProgress,
    readSnapOffsets,
    startSession,
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
    if (frame === null) return;
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
    if (frame === null) return undefined;
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
  }, []);

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
        if (offset !== undefined) frame.scrollLeft = offset;
        publishProgress(true);
      }
      const height = readPanelHeight(activeIndexRef.current);
      if (
        sessionRef.current !== null ||
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
          sessionRef.current !== null
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
      if (offset !== undefined) frame.scrollLeft = offset;
    }
    applyPanelHeight(activeIndexRef.current);
    publishProgress(true);
  }, [
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
      data-calligraphy-pager-native=""
      data-calligraphy-pager-platform={platform}
      data-calligraphy-pager-scrolling="false"
      onClickCapture={(event) => {
        if (
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
        if (event.pointerType !== "touch") cancelToCommitted();
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
