"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PrimaryNavigationPager } from "./primary-navigation-pager";
import {
  appendBoundedT02pInteractionEntry,
  buildT02pInteractionReport,
  createAnimationFrameThrottle,
  formatT02pCurrentState,
  formatT02pMouseEvent,
  formatT02pNavigationSnapshot,
  formatT02pPageEvent,
  formatT02pPointerEvent,
  formatT02pSessionHeader,
  formatT02pUnhandledRejection,
  formatT02pWindowError,
  readT02pClientEnvironment,
  readT02pNavigationSnapshot,
  t02pMouseEventTypes,
  t02pPointerEventTypes,
} from "./t02p-interaction-log";

import type { CSSProperties, RefObject } from "react";
import type { PresentationPlatform } from "./device-platform";
import type { PrimaryDestination } from "./primary-shell";
import type { T02pClientEnvironment } from "./t02p-interaction-log";

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
}

const visibleStatusDelayMs = 300;

const T02pInteractionLogger = ({
  activeDestination,
  platform,
  surfaceRef,
}: T02pInteractionLoggerProps) => {
  const [copyStatus, setCopyStatus] = useState<"" | "Copied" | "Copy failed">(
    "",
  );
  const [visibleStatus, setVisibleStatus] = useState<T02pVisibleLogStatus>({
    environment: pendingEnvironment,
    eventCount: 0,
    hydrated: false,
    lastSignificantEvent: "Awaiting hydration",
  });
  const panelRef = useRef<HTMLElement | null>(null);
  const renderCountRef = useRef(0);
  const interactionEntriesRef = useRef<string[]>([]);
  const sequenceRef = useRef(0);
  const sessionHeaderRef = useRef("");
  const hydrationLoggedRef = useRef(false);
  const environmentRef = useRef<T02pClientEnvironment | null>(null);
  const lastSignificantEventRef = useRef("Awaiting hydration");
  const visibleStatusTimerRef = useRef<number | null>(null);
  const activeDestinationRef = useRef(activeDestination);
  const platformRef = useRef(platform);
  const previousDestinationRef = useRef(activeDestination);
  const previousPlatformRef = useRef(platform);

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

  useEffect(() => {
    let disposed = false;
    const environment = readT02pClientEnvironment(window);
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
      const observation = () =>
        enqueueAfterDispatch(
          () => formatT02pPointerEvent(event, document),
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
      enqueueAfterDispatch(
        () => formatT02pMouseEvent(event, document),
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

    return () => {
      disposed = true;
      pointerMoveThrottle.dispose();
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
    };
  }, [
    readCurrentNavigationSnapshot,
    recordInteractionEntry,
    refreshVisibleStatus,
  ]);

  useEffect(() => {
    const previousDestination = previousDestinationRef.current;
    if (previousDestination === activeDestination) return;

    previousDestinationRef.current = activeDestination;
    recordInteractionEntry(
      `STATE activeDestination: ${previousDestination} -> ${activeDestination}\n${formatT02pNavigationSnapshot(
        readCurrentNavigationSnapshot(),
      )}`,
      `STATE activeDestination: ${previousDestination} -> ${activeDestination}`,
    );
  }, [
    activeDestination,
    readCurrentNavigationSnapshot,
    recordInteractionEntry,
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
    interactionEntriesRef.current.length = 0;
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
    refreshVisibleStatus();
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

    try {
      if (navigator.clipboard === undefined) throw new Error("No clipboard");
      await navigator.clipboard.writeText(
        buildT02pInteractionReport(
          sessionHeader,
          interactionEntriesRef.current,
          currentState,
        ),
      );
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
  };

  const { environment } = visibleStatus;
  const compactLog = [
    visibleStatus.hydrated ? "Hydrated" : "Awaiting hydration",
    `event count: ${visibleStatus.eventCount}`,
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
