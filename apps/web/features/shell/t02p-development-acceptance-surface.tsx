"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PrimaryNavigationPager } from "./primary-navigation-pager";
import {
  appendBoundedT02pInteractionEntry,
  buildT02pInteractionReport,
  createAnimationFrameThrottle,
  createT02pNodeIdentityTracker,
  formatT02pCurrentState,
  formatT02pFocusActiveEvidence,
  formatT02pMouseEvent,
  formatT02pNavigationMotionEvent,
  formatT02pNavigationMutation,
  formatT02pNavigationSnapshot,
  formatT02pNavigationVisualTrace,
  formatT02pPageEvent,
  formatT02pPointerEvent,
  formatT02pSessionHeader,
  formatT02pUnhandledRejection,
  formatT02pWindowError,
  readT02pClientEnvironment,
  readT02pNavigationSnapshot,
  readT02pNavigationVisualSnapshot,
  t02pMouseEventTypes,
  t02pPointerEventTypes,
} from "./t02p-interaction-log";

import type { CSSProperties, RefObject } from "react";
import type { PresentationPlatform } from "./device-platform";
import type { PrimaryDestination } from "./primary-shell";
import type {
  T02pClientEnvironment,
  T02pNavigationVisualFrame,
  T02pNavigationVisualSnapshot,
  T02pNodeIdentityTracker,
  T02pVisualLifecycleEntry,
} from "./t02p-interaction-log";

const presentationPlatforms = [
  "phone",
  "tablet",
  "pc",
] as const satisfies readonly PresentationPlatform[];

const interactionPanelStyle = {
  boxSizing: "border-box",
  marginBlock: "1rem 6rem",
  maxWidth: "100%",
  padding: "0.75rem",
  border: "1px solid currentColor",
  background: "Canvas",
  color: "CanvasText",
} satisfies CSSProperties;

const interactionLogStyle = {
  boxSizing: "border-box",
  maxHeight: "12rem",
  marginBlockEnd: 0,
  overflow: "auto",
  padding: "0.75rem",
  border: "1px solid currentColor",
  background: "Canvas",
  color: "CanvasText",
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: "0.75rem",
  lineHeight: 1.4,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
} satisfies CSSProperties;

const logControlStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "0.5rem",
  alignItems: "center",
  marginBlock: "0.75rem",
} satisfies CSSProperties;

const pendingEnvironment = {
  devicePixelRatio: 0,
  hasPointerEvent: false,
  hasTouchStart: false,
  maxTouchPoints: 0,
  url: "pending",
  userAgent: "pending",
  viewportHeight: 0,
  viewportWidth: 0,
} satisfies T02pClientEnvironment;

interface T02pInteractionLoggerProps {
  readonly activeDestination: PrimaryDestination;
  readonly platform: PresentationPlatform;
  readonly surfaceRef: RefObject<HTMLElement | null>;
}

interface T02pVisibleLogStatus {
  readonly environment: T02pClientEnvironment;
  readonly eventCount: number;
  readonly hydrated: boolean;
  readonly lastSignificantEvent: string;
  readonly visualTraceCount: number;
}

const visibleStatusDelayMs = 300;

const T02pInteractionLogger = ({
  activeDestination,
  platform,
  surfaceRef,
}: T02pInteractionLoggerProps) => {
  const [copyStatus, setCopyStatus] = useState<
    "" | "Copied" | "Copy failed — manual copy below"
  >("");
  const [manualCopyReport, setManualCopyReport] = useState<string | null>(null);
  const [visibleStatus, setVisibleStatus] = useState<T02pVisibleLogStatus>({
    environment: pendingEnvironment,
    eventCount: 0,
    hydrated: false,
    lastSignificantEvent: "Awaiting hydration",
    visualTraceCount: 0,
  });
  const panelRef = useRef<HTMLElement | null>(null);
  const manualCopyTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const renderCountRef = useRef(0);
  const interactionEntriesRef = useRef<string[]>([]);
  const sequenceRef = useRef(0);
  const sessionHeaderRef = useRef("");
  const hydrationLoggedRef = useRef(false);
  const environmentRef = useRef<T02pClientEnvironment | null>(null);
  const lastSignificantEventRef = useRef("Awaiting hydration");
  const visibleStatusTimerRef = useRef<number | null>(null);
  const nodeIdentityTrackerRef = useRef<T02pNodeIdentityTracker | null>(null);
  const visualLifecycleEntriesRef = useRef<T02pVisualLifecycleEntry[]>([]);
  const pendingVisualLifecycleStartRef = useRef<number | null>(null);
  const visualTraceReportsRef = useRef<string[]>([]);
  const settledVisualSnapshotRef = useRef<T02pNavigationVisualSnapshot | null>(
    null,
  );
  const visualTraceGenerationRef = useRef(0);
  const visualTraceFrameRef = useRef<number | null>(null);
  const visualTraceTimerRef = useRef<number | null>(null);
  const activeDestinationRef = useRef(activeDestination);
  const platformRef = useRef(platform);
  const previousDestinationRef = useRef(activeDestination);
  const previousPlatformRef = useRef(platform);

  if (nodeIdentityTrackerRef.current === null) {
    nodeIdentityTrackerRef.current = createT02pNodeIdentityTracker();
  }

  activeDestinationRef.current = activeDestination;
  platformRef.current = platform;

  useEffect(() => {
    renderCountRef.current += 1;
    panelRef.current?.setAttribute(
      "data-t02p-log-render-count",
      String(renderCountRef.current),
    );
  });

  const stampInteractionEntry = useCallback((body: string) => {
    sequenceRef.current += 1;

    return `#${String(sequenceRef.current).padStart(4, "0")} ${new Date().toISOString()}\n${body}`;
  }, []);

  const refreshVisibleStatus = useCallback(() => {
    setVisibleStatus({
      environment: environmentRef.current ?? pendingEnvironment,
      eventCount: interactionEntriesRef.current.length,
      hydrated: hydrationLoggedRef.current,
      lastSignificantEvent: lastSignificantEventRef.current,
      visualTraceCount: visualTraceReportsRef.current.length,
    });
  }, []);

  const scheduleVisibleStatusRefresh = useCallback(() => {
    if (visibleStatusTimerRef.current !== null) {
      window.clearTimeout(visibleStatusTimerRef.current);
    }

    visibleStatusTimerRef.current = window.setTimeout(() => {
      visibleStatusTimerRef.current = null;
      refreshVisibleStatus();
    }, visibleStatusDelayMs);
  }, [refreshVisibleStatus]);

  const recordInteractionEntry = useCallback(
    (body: string, significantEvent?: string) => {
      appendBoundedT02pInteractionEntry(
        interactionEntriesRef.current,
        stampInteractionEntry(body),
      );
      if (significantEvent !== undefined) {
        lastSignificantEventRef.current = significantEvent;
      }
      scheduleVisibleStatusRefresh();
    },
    [scheduleVisibleStatusRefresh, stampInteractionEntry],
  );

  const readCurrentNavigationSnapshot = useCallback(
    () =>
      readT02pNavigationSnapshot(
        surfaceRef.current,
        activeDestinationRef.current,
      ),
    [surfaceRef],
  );

  const readCurrentVisualSnapshot = useCallback(
    () =>
      readT02pNavigationVisualSnapshot(
        surfaceRef.current,
        activeDestinationRef.current,
        nodeIdentityTrackerRef.current ?? createT02pNodeIdentityTracker(),
      ),
    [surfaceRef],
  );

  const appendVisualLifecycleEntry = useCallback(
    (entry: T02pVisualLifecycleEntry) => {
      visualLifecycleEntriesRef.current.push(entry);
      const overflow = visualLifecycleEntriesRef.current.length - 600;
      if (overflow <= 0) return;

      visualLifecycleEntriesRef.current.splice(0, overflow);
      if (pendingVisualLifecycleStartRef.current !== null) {
        pendingVisualLifecycleStartRef.current = Math.max(
          0,
          pendingVisualLifecycleStartRef.current - overflow,
        );
      }
    },
    [],
  );

  const beginVisualInteraction = useCallback(() => {
    if (pendingVisualLifecycleStartRef.current === null) {
      pendingVisualLifecycleStartRef.current =
        visualLifecycleEntriesRef.current.length;
    }
  }, []);

  const cancelVisualTrace = useCallback(() => {
    visualTraceGenerationRef.current += 1;
    if (visualTraceFrameRef.current !== null) {
      window.cancelAnimationFrame(visualTraceFrameRef.current);
      visualTraceFrameRef.current = null;
    }
    if (visualTraceTimerRef.current !== null) {
      window.clearTimeout(visualTraceTimerRef.current);
      visualTraceTimerRef.current = null;
    }
  }, []);

  const scheduleSettledVisualBaseline = useCallback(() => {
    if (visualTraceFrameRef.current !== null) {
      window.cancelAnimationFrame(visualTraceFrameRef.current);
    }
    visualTraceFrameRef.current = window.requestAnimationFrame(() => {
      visualTraceFrameRef.current = null;
      settledVisualSnapshotRef.current = readCurrentVisualSnapshot();
    });
  }, [readCurrentVisualSnapshot]);

  const startVisualTrace = useCallback(
    (
      from: PrimaryDestination,
      to: PrimaryDestination,
      lifecycleStart: number,
    ) => {
      cancelVisualTrace();
      const generation = visualTraceGenerationRef.current;
      const frames: T02pNavigationVisualFrame[] = [];
      const baseline = settledVisualSnapshotRef.current;
      if (baseline !== null) {
        frames.push({ label: "FRAME 0", snapshot: baseline });
      }

      let frameNumber = baseline === null ? 0 : 1;
      const captureFrame = () => {
        visualTraceFrameRef.current = window.requestAnimationFrame(() => {
          visualTraceFrameRef.current = null;
          if (generation !== visualTraceGenerationRef.current) return;

          const snapshot = readCurrentVisualSnapshot();
          if ([0, 1, 2, 3, 5].includes(frameNumber)) {
            frames.push({ label: `FRAME ${frameNumber}`, snapshot });
          }

          if (frameNumber < 5) {
            frameNumber += 1;
            captureFrame();
            return;
          }

          visualTraceTimerRef.current = window.setTimeout(() => {
            visualTraceTimerRef.current = null;
            visualTraceFrameRef.current = window.requestAnimationFrame(() => {
              visualTraceFrameRef.current = null;
              if (generation !== visualTraceGenerationRef.current) return;

              const settledSnapshot = readCurrentVisualSnapshot();
              frames.push({
                label: "FRAME +300ms",
                snapshot: settledSnapshot,
              });
              settledVisualSnapshotRef.current = settledSnapshot;
              const lifecycle =
                visualLifecycleEntriesRef.current.slice(lifecycleStart);
              visualTraceReportsRef.current.push(
                formatT02pNavigationVisualTrace(from, to, frames, lifecycle),
              );
              if (visualTraceReportsRef.current.length > 12) {
                visualTraceReportsRef.current.splice(
                  0,
                  visualTraceReportsRef.current.length - 12,
                );
              }
              lastSignificantEventRef.current = `NAV VISUAL TRACE ${from} -> ${to} complete`;
              refreshVisibleStatus();
            });
          }, 300);
        });
      };

      captureFrame();
    },
    [cancelVisualTrace, readCurrentVisualSnapshot, refreshVisibleStatus],
  );

  useEffect(() => {
    let disposed = false;
    const environment = readT02pClientEnvironment(window);
    const identities =
      nodeIdentityTrackerRef.current ?? createT02pNodeIdentityTracker();
    nodeIdentityTrackerRef.current = identities;
    environmentRef.current = environment;

    if (!hydrationLoggedRef.current) {
      hydrationLoggedRef.current = true;
      const sessionHeader = formatT02pSessionHeader(
        environment,
        activeDestinationRef.current,
        platformRef.current,
      );
      sessionHeaderRef.current = sessionHeader;
      recordInteractionEntry(
        `${sessionHeader}\n${formatT02pNavigationSnapshot(
          readCurrentNavigationSnapshot(),
        )}`,
        "SESSION HYDRATED",
      );
      refreshVisibleStatus();
    }

    const isLoggerControlEvent = (event: Event) =>
      event.target instanceof Element &&
      event.target.closest("[data-t02p-interaction-log]") !== null;

    const enqueueAfterDispatch = (
      formatEvent: () => string,
      significantEvent: string | undefined,
      includeNavigationSnapshot = false,
      shouldRecord: (() => boolean) | undefined = undefined,
    ) => {
      queueMicrotask(() => {
        if (disposed || (shouldRecord !== undefined && !shouldRecord())) return;

        const eventEntry = formatEvent();
        recordInteractionEntry(
          includeNavigationSnapshot
            ? `${eventEntry}\n${formatT02pNavigationSnapshot(
                readCurrentNavigationSnapshot(),
              )}`
            : eventEntry,
          significantEvent,
        );
      });
    };

    const pointerMoveThrottle = createAnimationFrameThrottle(
      window,
      (observation: () => void) => observation(),
    );

    const handlePointerEvent = (nativeEvent: Event) => {
      if (isLoggerControlEvent(nativeEvent)) return;
      const event = nativeEvent as PointerEvent;
      const eventTarget = event.target instanceof Element ? event.target : null;
      if (
        event.type === "pointerdown" &&
        eventTarget !== null &&
        eventTarget.closest("[data-primary-navigation]") !== null
      ) {
        beginVisualInteraction();
      }
      const includeFocusEvidence = [
        "pointerdown",
        "pointerup",
        "pointercancel",
      ].includes(event.type);
      const observation = () =>
        enqueueAfterDispatch(
          () =>
            [
              formatT02pPointerEvent(event, document),
              includeFocusEvidence
                ? formatT02pFocusActiveEvidence(surfaceRef.current, identities)
                : "",
            ]
              .filter(Boolean)
              .join("\n"),
          event.type === "pointermove" ? undefined : `POINTER ${event.type}`,
          true,
          event.type === "pointermove"
            ? () => readCurrentNavigationSnapshot().dragging === "true"
            : undefined,
        );

      if (event.type === "pointermove") {
        pointerMoveThrottle.push(observation);
        return;
      }
      if (event.type === "pointerup" || event.type === "pointercancel") {
        pointerMoveThrottle.flush();
      }

      observation();
    };

    const handleMouseEvent = (nativeEvent: Event) => {
      if (isLoggerControlEvent(nativeEvent)) return;
      const event = nativeEvent as MouseEvent;
      const eventTarget = event.target instanceof Element ? event.target : null;
      if (
        eventTarget !== null &&
        eventTarget.closest(
          "[data-primary-navigation], [data-primary-pager-action]",
        ) !== null
      ) {
        beginVisualInteraction();
      }
      enqueueAfterDispatch(
        () =>
          `${formatT02pMouseEvent(
            event,
            document,
          )}\n${formatT02pFocusActiveEvidence(surfaceRef.current, identities)}`,
        "CLICK",
        true,
      );
    };

    const handlePageEvent = (event: Event) => {
      environmentRef.current = readT02pClientEnvironment(window);
      enqueueAfterDispatch(
        () => formatT02pPageEvent(event.type, window, document),
        `PAGE ${event.type}`,
      );
    };

    const handleWindowError = (event: ErrorEvent) => {
      enqueueAfterDispatch(() => formatT02pWindowError(event), "ERROR");
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      enqueueAfterDispatch(
        () => formatT02pUnhandledRejection(event),
        "ERROR unhandledrejection",
      );
    };

    const handleNavigationMotionEvent = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (
        target === null ||
        target.closest("[data-primary-navigation]") === null
      )
        return;

      appendVisualLifecycleEntry({
        kind: "motion",
        summary: formatT02pNavigationMotionEvent(
          event as TransitionEvent | AnimationEvent,
          identities,
        ),
      });
    };

    const navigation = surfaceRef.current?.querySelector<HTMLElement>(
      "[data-primary-navigation]",
    );
    const navigationObserver =
      navigation === null || navigation === undefined
        ? null
        : new MutationObserver((mutations) => {
            for (const mutation of mutations) {
              appendVisualLifecycleEntry(
                formatT02pNavigationMutation(mutation, identities),
              );
            }
          });
    navigationObserver?.observe(navigation as HTMLElement, {
      attributeFilter: [
        "aria-current",
        "class",
        "data-active-index",
        "data-bubble-preview-index",
        "data-dragging",
        "data-selected",
        "style",
      ],
      attributeOldValue: true,
      attributes: true,
      childList: true,
      subtree: true,
    });

    const navigationMotionEventTypes = [
      "transitionrun",
      "transitionstart",
      "transitionend",
      "transitioncancel",
      "animationstart",
      "animationend",
      "animationcancel",
    ] as const;

    for (const eventType of t02pPointerEventTypes) {
      document.addEventListener(eventType, handlePointerEvent, {
        capture: true,
        passive: true,
      });
    }
    for (const eventType of t02pMouseEventTypes) {
      document.addEventListener(eventType, handleMouseEvent, {
        capture: true,
        passive: true,
      });
    }
    window.addEventListener("resize", handlePageEvent, true);
    window.addEventListener("orientationchange", handlePageEvent, true);
    document.addEventListener("visibilitychange", handlePageEvent, true);
    window.addEventListener("error", handleWindowError, true);
    window.addEventListener(
      "unhandledrejection",
      handleUnhandledRejection,
      true,
    );
    for (const eventType of navigationMotionEventTypes) {
      document.addEventListener(eventType, handleNavigationMotionEvent, true);
    }
    scheduleSettledVisualBaseline();

    return () => {
      disposed = true;
      navigationObserver?.disconnect();
      pointerMoveThrottle.dispose();
      cancelVisualTrace();
      if (visibleStatusTimerRef.current !== null) {
        window.clearTimeout(visibleStatusTimerRef.current);
        visibleStatusTimerRef.current = null;
      }
      for (const eventType of t02pPointerEventTypes) {
        document.removeEventListener(eventType, handlePointerEvent, true);
      }
      for (const eventType of t02pMouseEventTypes) {
        document.removeEventListener(eventType, handleMouseEvent, true);
      }
      window.removeEventListener("resize", handlePageEvent, true);
      window.removeEventListener("orientationchange", handlePageEvent, true);
      document.removeEventListener("visibilitychange", handlePageEvent, true);
      window.removeEventListener("error", handleWindowError, true);
      window.removeEventListener(
        "unhandledrejection",
        handleUnhandledRejection,
        true,
      );
      for (const eventType of navigationMotionEventTypes) {
        document.removeEventListener(
          eventType,
          handleNavigationMotionEvent,
          true,
        );
      }
    };
  }, [
    appendVisualLifecycleEntry,
    beginVisualInteraction,
    cancelVisualTrace,
    readCurrentNavigationSnapshot,
    recordInteractionEntry,
    refreshVisibleStatus,
    scheduleSettledVisualBaseline,
    surfaceRef,
  ]);

  useEffect(() => {
    const previousDestination = previousDestinationRef.current;
    if (previousDestination === activeDestination) return;

    previousDestinationRef.current = activeDestination;
    const lifecycleStart =
      pendingVisualLifecycleStartRef.current ??
      visualLifecycleEntriesRef.current.length;
    pendingVisualLifecycleStartRef.current = null;
    recordInteractionEntry(
      `STATE activeDestination: ${previousDestination} -> ${activeDestination}\n${formatT02pNavigationSnapshot(
        readCurrentNavigationSnapshot(),
      )}`,
      `STATE activeDestination: ${previousDestination} -> ${activeDestination}`,
    );
    startVisualTrace(previousDestination, activeDestination, lifecycleStart);
  }, [
    activeDestination,
    readCurrentNavigationSnapshot,
    recordInteractionEntry,
    startVisualTrace,
  ]);

  useEffect(() => {
    const previousPlatform = previousPlatformRef.current;
    if (previousPlatform === platform) return;

    previousPlatformRef.current = platform;
    recordInteractionEntry(
      `STATE platform: ${previousPlatform} -> ${platform}\n${formatT02pNavigationSnapshot(
        readCurrentNavigationSnapshot(),
      )}`,
      `STATE platform: ${previousPlatform} -> ${platform}`,
    );
  }, [platform, readCurrentNavigationSnapshot, recordInteractionEntry]);

  const handleClearLog = () => {
    const environment = readT02pClientEnvironment(window);
    const sessionHeader = formatT02pSessionHeader(
      environment,
      activeDestinationRef.current,
      platformRef.current,
    );

    if (visibleStatusTimerRef.current !== null) {
      window.clearTimeout(visibleStatusTimerRef.current);
      visibleStatusTimerRef.current = null;
    }
    cancelVisualTrace();
    interactionEntriesRef.current.length = 0;
    visualLifecycleEntriesRef.current.length = 0;
    visualTraceReportsRef.current.length = 0;
    pendingVisualLifecycleStartRef.current = null;
    settledVisualSnapshotRef.current = null;
    sequenceRef.current = 0;
    environmentRef.current = environment;
    sessionHeaderRef.current = sessionHeader;
    lastSignificantEventRef.current = "SESSION HYDRATED";
    appendBoundedT02pInteractionEntry(
      interactionEntriesRef.current,
      stampInteractionEntry(
        `${sessionHeader}\n${formatT02pNavigationSnapshot(
          readCurrentNavigationSnapshot(),
        )}`,
      ),
    );
    setCopyStatus("");
    setManualCopyReport(null);
    refreshVisibleStatus();
    scheduleSettledVisualBaseline();
  };

  const handleCopyLog = async () => {
    const environment = readT02pClientEnvironment(window);
    const currentState = formatT02pCurrentState(
      environment,
      platformRef.current,
      readCurrentNavigationSnapshot(),
    );
    const sessionHeader =
      sessionHeaderRef.current ||
      formatT02pSessionHeader(
        environment,
        activeDestinationRef.current,
        platformRef.current,
      );
    const report = buildT02pInteractionReport(
      sessionHeader,
      interactionEntriesRef.current,
      currentState,
      visualTraceReportsRef.current,
    );

    try {
      if (navigator.clipboard === undefined) throw new Error("No clipboard");
      await navigator.clipboard.writeText(report);
      setManualCopyReport(null);
      setCopyStatus("Copied");
    } catch {
      setManualCopyReport(report);
      setCopyStatus("Copy failed — manual copy below");
    }
  };

  const handleSelectManualCopyReport = () => {
    const textarea = manualCopyTextareaRef.current;
    if (textarea === null) return;

    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
  };

  const { environment } = visibleStatus;
  const compactLog = [
    visibleStatus.hydrated ? "Hydrated" : "Awaiting hydration",
    `event count: ${visibleStatus.eventCount}`,
    `visual trace count: ${visibleStatus.visualTraceCount}`,
    `activeDestination: ${activeDestination}`,
    `last significant event: ${visibleStatus.lastSignificantEvent}`,
  ].join("\n");

  return (
    <section
      ref={panelRef}
      aria-labelledby="t02p-interaction-log-heading"
      data-t02p-interaction-log=""
      style={interactionPanelStyle}
    >
      <h2 id="t02p-interaction-log-heading">Real-device interaction log</h2>
      <dl>
        <dt>hydration</dt>
        <dd data-interaction-status="hydration">
          {visibleStatus.hydrated ? "Hydrated" : "Awaiting hydration"}
        </dd>
        <dt>event count</dt>
        <dd data-interaction-status="eventCount">{visibleStatus.eventCount}</dd>
        <dt>visual trace count</dt>
        <dd data-interaction-status="visualTraceCount">
          {visibleStatus.visualTraceCount}
        </dd>
        <dt>last significant event</dt>
        <dd data-interaction-status="lastSignificantEvent">
          {visibleStatus.lastSignificantEvent}
        </dd>
        <dt>activeDestination</dt>
        <dd data-interaction-status="activeDestination">{activeDestination}</dd>
        <dt>presentation platform</dt>
        <dd data-interaction-status="platform">{platform}</dd>
        <dt>viewport</dt>
        <dd data-interaction-status="viewport">
          {environment.viewportWidth}x{environment.viewportHeight}
        </dd>
        <dt>devicePixelRatio</dt>
        <dd>{environment.devicePixelRatio}</dd>
        <dt>userAgent</dt>
        <dd style={{ overflowWrap: "anywhere" }}>{environment.userAgent}</dd>
        <dt>pointer / touch support</dt>
        <dd>
          PointerEvent={String(environment.hasPointerEvent)}; ontouchstart=
          {String(environment.hasTouchStart)}; maxTouchPoints=
          {environment.maxTouchPoints}
        </dd>
      </dl>

      <div style={logControlStyle}>
        <button type="button" onClick={handleClearLog}>
          Clear log
        </button>
        <button type="button" onClick={handleCopyLog}>
          Copy log
        </button>
        <output aria-live="polite" data-copy-log-status="">
          {copyStatus}
        </output>
      </div>

      {manualCopyReport !== null ? (
        <div data-manual-copy-fallback="">
          <label htmlFor="t02p-manual-copy-report">Manual copy report</label>
          <button type="button" onClick={handleSelectManualCopyReport}>
            Select all
          </button>
          <textarea
            ref={manualCopyTextareaRef}
            id="t02p-manual-copy-report"
            aria-label="Manual-copy interaction report"
            readOnly
            rows={24}
            value={manualCopyReport}
            style={{
              boxSizing: "border-box",
              display: "block",
              fontFamily: "monospace",
              fontSize: "0.75rem",
              marginBlockStart: "0.5rem",
              minHeight: "50vh",
              width: "100%",
            }}
          />
        </div>
      ) : null}

      <pre
        aria-label="Real-device interaction log status"
        data-t02p-interaction-log-entries=""
        style={interactionLogStyle}
      >
        {compactLog}
      </pre>
    </section>
  );
};

export const T02pDevelopmentAcceptanceSurface = () => {
  const [activeDestination, setActiveDestination] =
    useState<PrimaryDestination>("home");
  const [platform, setPlatform] = useState<PresentationPlatform>("pc");
  const surfaceRef = useRef<HTMLElement | null>(null);
  const renderCountRef = useRef(0);

  useEffect(() => {
    renderCountRef.current += 1;
    surfaceRef.current?.setAttribute(
      "data-t02p-surface-render-count",
      String(renderCountRef.current),
    );
  });

  return (
    <main
      ref={surfaceRef}
      data-t02p-development-acceptance=""
      data-active-destination={activeDestination}
      data-platform={platform}
    >
      <h1>T02P Development acceptance</h1>
      <p>QA-only structural shell acceptance surface.</p>

      <label htmlFor="t02p-qa-platform">QA presentation platform</label>
      <select
        id="t02p-qa-platform"
        data-qa-platform-selector=""
        value={platform}
        onChange={(event) => {
          const nextPlatform = presentationPlatforms.find(
            (candidate) => candidate === event.currentTarget.value,
          );

          if (nextPlatform !== undefined) {
            setPlatform(nextPlatform);
          }
        }}
      >
        {presentationPlatforms.map((candidate) => (
          <option key={candidate} value={candidate}>
            {candidate}
          </option>
        ))}
      </select>

      <PrimaryNavigationPager
        activeDestination={activeDestination}
        platform={platform}
        onDestinationChange={setActiveDestination}
        home={<section data-qa-panel="home">Home acceptance panel</section>}
        inscriptions={
          <section data-qa-panel="inscriptions">
            Inscription acceptance panel
          </section>
        }
        calligraphy={
          <section data-qa-panel="calligraphy">
            Calligraphy acceptance panel
          </section>
        }
      />

      <T02pInteractionLogger
        activeDestination={activeDestination}
        platform={platform}
        surfaceRef={surfaceRef}
      />
    </main>
  );
};
