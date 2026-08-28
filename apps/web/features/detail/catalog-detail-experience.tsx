"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { CatalogDetailScreen } from "./catalog-detail-screen";
import { CatalogViewer } from "./catalog-viewer";
import styles from "./catalog-detail.module.css";

import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
  UIEvent,
  WheelEvent as ReactWheelEvent,
} from "react";
import type { CatalogDetailPresentationState } from "./catalog-detail-presentation";
import type { PresentationPlatform } from "../shell/device-platform";

export interface CatalogDetailExperienceProps {
  readonly activeViewerMediaId: string | null;
  readonly backButtonRef: RefObject<HTMLButtonElement | null>;
  readonly catalogId: string;
  readonly initialScrollTop: number;
  readonly onBack: () => void;
  readonly onCloseViewer: () => void;
  readonly onOpenViewer: (mediaId: string) => void;
  readonly onScrollTopChange: (top: number) => void;
  readonly onViewerMediaChange: (mediaId: string) => void;
  readonly orientation: "landscape" | "portrait";
  readonly platform: PresentationPlatform;
  readonly state: CatalogDetailPresentationState;
}

const SCROLL_KEYS = new Set([
  " ",
  "ArrowDown",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

export const CatalogDetailExperience = ({
  activeViewerMediaId,
  backButtonRef,
  catalogId,
  initialScrollTop,
  onBack,
  onCloseViewer,
  onOpenViewer,
  onScrollTopChange,
  onViewerMediaChange,
  orientation,
  platform,
  state,
}: CatalogDetailExperienceProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const restoreFrameRef = useRef<number | null>(null);
  const resizeRestoreFrameRef = useRef<number | null>(null);
  const scrollSuppressionFrameRef = useRef<number | null>(null);
  const scrollIntentTimerRef = useRef<number | null>(null);
  const suppressScrollRef = useRef(false);
  const userScrollIntentRef = useRef(false);
  const pointerCandidateRef = useRef<{
    readonly id: number;
    readonly x: number;
    readonly y: number;
  } | null>(null);
  const desiredScrollTopRef = useRef(initialScrollTop);
  const restoredCatalogIdRef = useRef(catalogId);
  const viewerOpenerRef = useRef<HTMLElement | null>(null);
  const viewerWasOpenRef = useRef(false);
  const viewerOpenSuppressedUntilRef = useRef(0);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const media = state.state === "loaded" ? state.detail.media : [];
  const requestedViewerIndex =
    activeViewerMediaId === null
      ? -1
      : media.findIndex(({ id }) => id === activeViewerMediaId);
  const viewerOpen = activeViewerMediaId !== null && requestedViewerIndex >= 0;

  const clearUserScrollIntent = useCallback(() => {
    userScrollIntentRef.current = false;
    if (scrollIntentTimerRef.current !== null) {
      window.clearTimeout(scrollIntentTimerRef.current);
      scrollIntentTimerRef.current = null;
    }
  }, []);

  const markUserScrollIntent = useCallback(() => {
    userScrollIntentRef.current = true;
    if (scrollIntentTimerRef.current !== null) {
      window.clearTimeout(scrollIntentTimerRef.current);
    }
    scrollIntentTimerRef.current = window.setTimeout(() => {
      scrollIntentTimerRef.current = null;
      userScrollIntentRef.current = false;
    }, 240);
  }, []);

  const restoreDesiredScroll = useCallback(() => {
    const scroller = scrollRef.current;
    if (scroller === null) return;
    suppressScrollRef.current = true;
    scroller.scrollTop = Math.max(0, desiredScrollTopRef.current);
    if (scrollSuppressionFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollSuppressionFrameRef.current);
    }
    scrollSuppressionFrameRef.current = window.requestAnimationFrame(() => {
      scrollSuppressionFrameRef.current = window.requestAnimationFrame(() => {
        scrollSuppressionFrameRef.current = null;
        suppressScrollRef.current = false;
      });
    });
  }, []);

  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null) return;
    if (restoredCatalogIdRef.current !== catalogId) {
      restoredCatalogIdRef.current = catalogId;
      desiredScrollTopRef.current = initialScrollTop;
    }
    restoreDesiredScroll();
    restoreFrameRef.current = window.requestAnimationFrame(() => {
      restoreFrameRef.current = window.requestAnimationFrame(() => {
        restoreFrameRef.current = null;
        restoreDesiredScroll();
      });
    });
    return () => {
      if (restoreFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFrameRef.current);
        restoreFrameRef.current = null;
      }
    };
  }, [
    catalogId,
    initialScrollTop,
    orientation,
    platform,
    restoreDesiredScroll,
    state.state,
  ]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      clearUserScrollIntent();
      suppressScrollRef.current = true;
      if (resizeRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeRestoreFrameRef.current);
      }
      resizeRestoreFrameRef.current = window.requestAnimationFrame(() => {
        resizeRestoreFrameRef.current = null;
        restoreDesiredScroll();
      });
    });
    observer.observe(scroller);
    return () => {
      observer.disconnect();
      if (resizeRestoreFrameRef.current !== null) {
        window.cancelAnimationFrame(resizeRestoreFrameRef.current);
        resizeRestoreFrameRef.current = null;
      }
    };
  }, [catalogId, clearUserScrollIntent, restoreDesiredScroll]);

  useEffect(() => {
    setActiveMediaIndex(0);
  }, [catalogId]);

  useEffect(() => {
    if (activeViewerMediaId === null || state.state === "loading") return;
    if (requestedViewerIndex < 0) {
      onCloseViewer();
      return;
    }
    setActiveMediaIndex(requestedViewerIndex);
  }, [activeViewerMediaId, onCloseViewer, requestedViewerIndex, state.state]);

  useLayoutEffect(() => {
    if (viewerOpen) {
      viewerWasOpenRef.current = true;
      return;
    }
    if (!viewerWasOpenRef.current) return;
    viewerWasOpenRef.current = false;
    viewerOpenSuppressedUntilRef.current = performance.now() + 500;
    restoreDesiredScroll();
    const firstFrame = window.requestAnimationFrame(() => {
      restoreDesiredScroll();
      window.requestAnimationFrame(() => {
        const currentOpener = scrollRef.current?.querySelector<HTMLElement>(
          "[data-detail-main-image]",
        );
        const opener = currentOpener ?? viewerOpenerRef.current;
        if (opener?.isConnected === true) opener.focus({ preventScroll: true });
      });
    });
    return () => window.cancelAnimationFrame(firstFrame);
  }, [restoreDesiredScroll, viewerOpen]);

  useEffect(
    () => () => {
      if (scrollSuppressionFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollSuppressionFrameRef.current);
        scrollSuppressionFrameRef.current = null;
      }
      clearUserScrollIntent();
      onScrollTopChange(desiredScrollTopRef.current);
    },
    [clearUserScrollIntent, onScrollTopChange],
  );

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const scroller = event.currentTarget;
    const top = scroller.scrollTop;
    if (suppressScrollRef.current && top <= desiredScrollTopRef.current) {
      return;
    }
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    if (!userScrollIntentRef.current && top < desiredScrollTopRef.current) {
      return;
    }
    if (desiredScrollTopRef.current > maximum && Math.abs(top - maximum) <= 1) {
      return;
    }
    desiredScrollTopRef.current = top;
    onScrollTopChange(top);
    if (userScrollIntentRef.current) markUserScrollIntent();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    pointerCandidateRef.current = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const candidate = pointerCandidateRef.current;
    if (candidate === null || candidate.id !== event.pointerId) return;
    const deltaX = event.clientX - candidate.x;
    const deltaY = event.clientY - candidate.y;
    if (Math.hypot(deltaX, deltaY) < 10) return;
    pointerCandidateRef.current = null;
    if (Math.abs(deltaY) > Math.abs(deltaX) * 1.1) markUserScrollIntent();
  };

  const clearPointerCandidate = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointerCandidateRef.current?.id === event.pointerId) {
      pointerCandidateRef.current = null;
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) markUserScrollIntent();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (SCROLL_KEYS.has(event.key)) markUserScrollIntent();
  };

  return (
    <div className={styles.experience} data-detail-experience="">
      <div
        className={styles.detailScroller}
        data-detail-scroll=""
        onKeyDown={handleKeyDown}
        onPointerCancel={clearPointerCandidate}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={clearPointerCandidate}
        onScroll={handleScroll}
        onWheel={handleWheel}
        ref={scrollRef}
      >
        <CatalogDetailScreen
          activeMediaIndex={activeMediaIndex}
          backButtonRef={backButtonRef}
          onActiveMediaIndexChange={setActiveMediaIndex}
          onBack={onBack}
          onOpenViewer={(index, opener) => {
            const item = media[index];
            if (
              item === undefined ||
              performance.now() < viewerOpenSuppressedUntilRef.current
            ) {
              return;
            }
            const scroller = scrollRef.current;
            if (scroller !== null) {
              desiredScrollTopRef.current = scroller.scrollTop;
              onScrollTopChange(scroller.scrollTop);
            }
            viewerOpenerRef.current = opener;
            setActiveMediaIndex(index);
            onOpenViewer(item.id);
          }}
          orientation={orientation}
          platform={platform}
          state={state}
        />
      </div>
      <CatalogViewer
        index={activeMediaIndex}
        media={media}
        onClose={() => {
          viewerOpenSuppressedUntilRef.current = performance.now() + 500;
          onCloseViewer();
        }}
        onIndexChange={(index) => {
          const item = media[index];
          if (item === undefined) return;
          setActiveMediaIndex(index);
          onViewerMediaChange(item.id);
        }}
        open={viewerOpen}
        platform={platform}
      />
    </div>
  );
};
