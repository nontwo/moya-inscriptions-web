"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";

import styles from "./horizontal-pager.module.css";
import {
  HORIZONTAL_PAGER_CLICK_SUPPRESS_PX,
  HORIZONTAL_PAGER_FALLBACK_STABLE_FRAMES,
  horizontalPagerProgress,
  isExplicitHorizontalWheel,
  isHorizontalPagerAtOffset,
  resolveHorizontalPagerSettledIndex,
} from "./horizontal-pager-motion";

import type {
  ForwardedRef,
  ReactNode,
  RefAttributes,
  WheelEvent as ReactWheelEvent,
} from "react";
import type { PresentationPlatform } from "./device-platform";

interface ScrollSession {
  readonly generation: number;
  hasScrolled: boolean;
  readonly mode: "native" | "programmatic";
  readonly originIndex: number;
  readonly requestedIndex: number | null;
  scrollEndPending: boolean;
}

export interface HorizontalPagerHandle<Key extends string> {
  readonly scrollToKey: (key: Key) => void;
}
type DataAttributes = Readonly<Record<`data-${string}`, string | undefined>>;
export interface HorizontalPagerProps<Key extends string> {
  readonly keys: readonly Key[];
  readonly activeKey: Key;
  readonly onCommit: (key: Key) => void;
  readonly onProgress?: (progress: number) => void;
  readonly visible?: boolean;
  readonly registerActiveScrollElement?: (element: HTMLElement) => () => void;
  readonly panels: Readonly<Record<Key, ReactNode>>;
  readonly platform: PresentationPlatform;
  readonly scrollOwner: "document" | "panel";
  readonly frameClassName?: string | undefined;
  readonly trackClassName?: string | undefined;
  readonly panelClassName?: string | undefined;
  readonly frameAttributes?: DataAttributes;
  readonly trackAttributes?: DataAttributes;
  readonly panelAttributes?: (key: Key, selected: boolean) => DataAttributes;
  readonly panelId: (key: Key) => string;
  readonly panelLabelledBy: (key: Key) => string;
  readonly diagnosticPrefix?: string;
}
const initialValues = <Key extends string, Value>(
  keys: readonly Key[],
  value: Value,
): Record<Key, Value> =>
  Object.fromEntries(keys.map((key) => [key, value])) as Record<Key, Value>;

const reducedMotionPreferred = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

function HorizontalPagerImplementation<Key extends string>(
  {
    keys,
    activeKey,
    onCommit,
    onProgress,
    panels,
    platform,
    scrollOwner,
    visible = true,
    registerActiveScrollElement,
    frameClassName,
    trackClassName,
    panelClassName,
    frameAttributes,
    trackAttributes,
    panelAttributes,
    panelId,
    panelLabelledBy,
    diagnosticPrefix = "horizontal",
  }: HorizontalPagerProps<Key>,
  ref: ForwardedRef<HorizontalPagerHandle<Key>>,
) {
  const frameRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef(initialValues<Key, HTMLElement | null>(keys, null));
  const heightsRef = useRef(initialValues(keys, 0));
  const preservedPanelScrollTopsRef = useRef(initialValues(keys, 0));
  const activeIndex = keys.indexOf(activeKey);
  const activeIndexRef = useRef(activeIndex);
  const visibleRef = useRef(visible);
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
  visibleRef.current = visible;
  onCommitRef.current = onCommit;
  onProgressRef.current = onProgress;

  const setScrolling = useCallback(
    (scrolling: boolean) => {
      const frame = frameRef.current;
      if (frame !== null) {
        frame.dataset.horizontalPagerScrolling = String(scrolling);
        frame.setAttribute(
          `data-${diagnosticPrefix}-pager-scrolling`,
          String(scrolling),
        );
      }
    },
    [diagnosticPrefix],
  );

  const readPanelHeight = useCallback((feed: Key): number => {
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
    for (const feed of keys) {
      const panel = panelRefs.current[feed];
      if (panel === null) return [];
      offsets.push(panel.offsetLeft);
    }
    return offsets;
  }, [keys]);

  const restorePreservedPanelScrollTops = useCallback(() => {
    if (scrollOwner === "document") return;
    for (const feed of keys) {
      const panel = panelRefs.current[feed];
      if (panel === null) continue;
      panel.scrollTop = Math.min(
        preservedPanelScrollTopsRef.current[feed],
        Math.max(0, panel.scrollHeight - panel.clientHeight),
      );
    }
  }, [keys, scrollOwner]);

  const applyPanelHeight = useCallback(
    (index: number) => {
      const frame = frameRef.current;
      const feed = keys[index];
      if (frame === null || feed === undefined) return;
      const height = readPanelHeight(feed);
      if (height > 0) frame.style.height = `${height}px`;
    },
    [keys, readPanelHeight],
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
        const progress = horizontalPagerProgress(frame.scrollLeft, offsets);
        frame.dataset.horizontalPagerProgress = String(progress);
        onProgressRef.current?.(progress);
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
      if (scrollOwner === "document") applyPanelHeight(originIndex);
      return session;
    },
    [
      applyPanelHeight,
      cancelFallback,
      cancelProgressFrame,
      scrollOwner,
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
      if (scrollOwner === "document") applyPanelHeight(targetIndex);
      publishProgress(true);
      const targetFeed = keys[targetIndex];
      if (targetFeed !== undefined && targetIndex !== activeIndexRef.current) {
        internalCommitIndexRef.current = targetIndex;
        onCommitRef.current(targetFeed);
      }
    },
    [
      applyPanelHeight,
      cancelFallback,
      keys,
      scrollOwner,
      publishProgress,
      setScrolling,
    ],
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
      if (offsets.length !== keys.length) return;
      const targetIndex = resolveHorizontalPagerSettledIndex(
        frame.scrollLeft,
        offsets,
      );
      const targetOffset = offsets[targetIndex];
      if (
        targetOffset === undefined ||
        !isHorizontalPagerAtOffset(frame.scrollLeft, targetOffset)
      ) {
        return;
      }
      finishSettle(generation, targetIndex);
    },
    [finishSettle, keys, readSnapOffsets],
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
        if (stableFrames >= HORIZONTAL_PAGER_FALLBACK_STABLE_FRAMES) {
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
    (feed: Key) => {
      const frame = frameRef.current;
      const targetIndex = keys.indexOf(feed);
      const offsets = readSnapOffsets();
      const targetOffset = offsets[targetIndex];
      if (frame === null || targetIndex < 0 || targetOffset === undefined)
        return;
      if (
        targetIndex === activeIndexRef.current &&
        isHorizontalPagerAtOffset(frame.scrollLeft, targetOffset)
      ) {
        publishProgress(true);
        return;
      }
      const originIndex = resolveHorizontalPagerSettledIndex(
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
      keys,
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
      scrollToKey: requestFeed,
    }),
    [requestFeed],
  );

  const handleScroll = useCallback(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    const touchStart = touchStartScrollLeftRef.current;
    if (
      touchStart !== null &&
      Math.abs(frame.scrollLeft - touchStart) >
        HORIZONTAL_PAGER_CLICK_SUPPRESS_PX
    ) {
      suppressClickUntilRef.current = performance.now() + 500;
    }
    const offsets = readSnapOffsets();
    const currentWidth = frame.clientWidth;
    const previousWidth = frameWidthRef.current;
    if (
      previousWidth > 0 &&
      currentWidth > 0 &&
      Math.abs(currentWidth - previousWidth) > 0.5
    ) {
      invalidateSession();
      const committedOffset = offsets[activeIndexRef.current];
      if (
        committedOffset !== undefined &&
        !isHorizontalPagerAtOffset(frame.scrollLeft, committedOffset)
      ) {
        frame.scrollLeft = committedOffset;
      }
      publishProgress(true);
      return;
    }
    const activeOffset = offsets[activeIndexRef.current];
    let session = sessionRef.current;
    if (
      session === null &&
      activeOffset !== undefined &&
      isHorizontalPagerAtOffset(frame.scrollLeft, activeOffset)
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
  }, [
    invalidateSession,
    publishProgress,
    readSnapOffsets,
    scheduleFallback,
    startSession,
  ]);

  const handleTouchStart = useCallback(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    touchActiveRef.current = true;
    suppressClickUntilRef.current = 0;
    touchStartScrollLeftRef.current = frame.scrollLeft;
    const offsets = readSnapOffsets();
    const originIndex = resolveHorizontalPagerSettledIndex(
      frame.scrollLeft,
      offsets,
    );
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
        !isExplicitHorizontalWheel(event.deltaX, event.deltaY, event.ctrlKey)
      ) {
        return;
      }
      event.preventDefault();
      if (!wheelHandledRef.current) {
        const direction = event.deltaX > 0 ? 1 : -1;
        const targetIndex = Math.max(
          0,
          Math.min(keys.length - 1, activeIndexRef.current + direction),
        );
        const targetFeed = keys[targetIndex];
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
    [platform, keys, requestFeed],
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
        !isHorizontalPagerAtOffset(frame.scrollLeft, offset)
      ) {
        frame.scrollLeft = offset;
      }
    }
    frameWidthRef.current = frame.clientWidth;
    if (scrollOwner === "document") {
      for (const feed of keys) readPanelHeight(feed);
      applyPanelHeight(activeIndex);
    } else {
      frame.style.height = "";
    }
    publishProgress(true);
  }, [
    activeKey,
    activeIndex,
    keys,
    applyPanelHeight,
    invalidateSession,
    keys,
    scrollOwner,
    publishProgress,
    readPanelHeight,
    readSnapOffsets,
  ]);

  useLayoutEffect(() => {
    if (
      scrollOwner === "document" ||
      registerActiveScrollElement === undefined
    ) {
      return undefined;
    }
    const panel = panelRefs.current[activeKey];
    if (panel === null) return undefined;
    if (visibleRef.current) {
      preservedPanelScrollTopsRef.current[activeKey] = panel.scrollTop;
    }
    return registerActiveScrollElement(panel);
  }, [activeKey, scrollOwner, registerActiveScrollElement]);

  useLayoutEffect(() => {
    if (visible) {
      restorePreservedPanelScrollTops();
    } else {
      invalidateSession();
      scrollFrameToIndex(activeIndexRef.current, "auto");
    }
  }, [
    invalidateSession,
    scrollFrameToIndex,
    visible,
    restorePreservedPanelScrollTops,
  ]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return undefined;
    supportsScrollEndRef.current = "onscrollend" in frame;
    frame.setAttribute(
      `data-${diagnosticPrefix}-pager-settle-mode`,
      supportsScrollEndRef.current ? "scrollend" : "stable-frames",
    );
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
  }, [diagnosticPrefix]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (frame === null || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => {
      if (scrollOwner === "document") {
        for (const feed of keys) readPanelHeight(feed);
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
      if (scrollOwner === "document" && sessionRef.current === null) {
        applyPanelHeight(activeIndexRef.current);
      }
    });
    observer.observe(frame);
    if (scrollOwner === "document") {
      for (const feed of keys) {
        const panel = panelRefs.current[feed];
        if (panel !== null) observer.observe(panel);
      }
    }
    return () => observer.disconnect();
  }, [
    applyPanelHeight,
    invalidateSession,
    scrollOwner,
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
      {...frameAttributes}
      className={`${styles.frame} ${frameClassName ?? ""}`}
      data-horizontal-pager=""
      data-horizontal-pager-platform={platform}
      data-horizontal-pager-scroll-owner={scrollOwner}
      data-horizontal-pager-active-key={activeKey}
      data-horizontal-pager-scrolling="false"
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
      onTouchCancelCapture={() => {
        invalidateSession();
        scrollFrameToIndex(activeIndexRef.current, "auto");
        publishProgress(true);
      }}
      onTouchEndCapture={handleTouchFinish}
      onTouchStartCapture={handleTouchStart}
      onWheel={handleWheel}
    >
      <div
        {...trackAttributes}
        className={`${styles.track} ${trackClassName ?? ""}`}
        data-horizontal-pager-track=""
      >
        {keys.map((feed) => {
          const selected = feed === activeKey;
          return (
            <section
              {...panelAttributes?.(feed, selected)}
              key={feed}
              ref={(node) => {
                panelRefs.current[feed] = node;
              }}
              aria-hidden={!selected}
              aria-labelledby={panelLabelledBy(feed)}
              className={`${styles.panel} ${panelClassName ?? ""}`}
              data-horizontal-panel-key={feed}
              id={panelId(feed)}
              inert={!selected || undefined}
              onScroll={(event) => {
                if (
                  scrollOwner === "document" ||
                  !visibleRef.current ||
                  feed !== keys[activeIndexRef.current] ||
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
}

export const HorizontalPager = forwardRef(HorizontalPagerImplementation) as <
  Key extends string,
>(
  props: HorizontalPagerProps<Key> & RefAttributes<HorizontalPagerHandle<Key>>,
) => ReactNode;
