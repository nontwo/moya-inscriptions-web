"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { PrimaryNavigationPager } from "./primary-navigation-pager";
import {
  buildT02pInteractionReport,
  createAnimationFrameThrottle,
  formatT02pCurrentState,
  formatT02pMouseEvent,
  formatT02pNavigationSnapshot,
  formatT02pPageEvent,
  formatT02pPointerEvent,
  formatT02pSessionHeader,
  formatT02pTouchEvent,
  formatT02pUnhandledRejection,
  formatT02pWindowError,
  MAX_T02P_INTERACTION_LOG_ENTRIES,
  readT02pClientEnvironment,
  readT02pNavigationSnapshot,
  t02pMouseEventTypes,
  t02pPointerEventTypes,
  t02pTouchEventTypes,
} from "./t02p-interaction-log";

import type { CSSProperties } from "react";
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
  maxHeight: "20rem",
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

export const T02pDevelopmentAcceptanceSurface = () => {
  const [activeDestination, setActiveDestination] =
    useState<PrimaryDestination>("home");
  const [platform, setPlatform] = useState<PresentationPlatform>("pc");
  const [clientEnvironment, setClientEnvironment] =
    useState<T02pClientEnvironment | null>(null);
  const [copyStatus, setCopyStatus] = useState<"" | "Copied" | "Copy failed">(
    "",
  );
  const [interactionEntries, setInteractionEntries] = useState<string[]>([]);
  const surfaceRef = useRef<HTMLElement | null>(null);
  const sequenceRef = useRef(0);
  const sessionHeaderRef = useRef("");
  const hydrationLoggedRef = useRef(false);
  const activeDestinationRef = useRef(activeDestination);
  const platformRef = useRef(platform);
  const previousDestinationRef = useRef(activeDestination);
  const previousPlatformRef = useRef(platform);

  activeDestinationRef.current = activeDestination;
  platformRef.current = platform;

  const stampInteractionEntry = useCallback((body: string) => {
    sequenceRef.current += 1;

    return `#${String(sequenceRef.current).padStart(4, "0")} ${new Date().toISOString()}\n${body}`;
  }, []);

  const appendInteractionEntry = useCallback(
    (body: string) => {
      const entry = stampInteractionEntry(body);
      setInteractionEntries((currentEntries) =>
        [...currentEntries, entry].slice(-MAX_T02P_INTERACTION_LOG_ENTRIES),
      );
    },
    [stampInteractionEntry],
  );

  const readCurrentNavigationSnapshot = useCallback(
    () =>
      readT02pNavigationSnapshot(
        surfaceRef.current,
        activeDestinationRef.current,
      ),
    [],
  );

  useEffect(() => {
    let disposed = false;
    const environment = readT02pClientEnvironment(window);
    setClientEnvironment(environment);

    if (!hydrationLoggedRef.current) {
      hydrationLoggedRef.current = true;
      const sessionHeader = formatT02pSessionHeader(
        environment,
        activeDestinationRef.current,
        platformRef.current,
      );
      sessionHeaderRef.current = sessionHeader;
      appendInteractionEntry(
        `${sessionHeader}\n${formatT02pNavigationSnapshot(
          readCurrentNavigationSnapshot(),
        )}`,
      );
    }

    const isLoggerControlEvent = (event: Event) =>
      event.target instanceof Element &&
      event.target.closest("[data-t02p-interaction-log]") !== null;

    const enqueueAfterDispatch = (
      formatEvent: () => string,
      includeNavigationSnapshot = false,
    ) => {
      queueMicrotask(() => {
        if (disposed) return;

        const eventEntry = formatEvent();
        appendInteractionEntry(
          includeNavigationSnapshot
            ? `${eventEntry}\n${formatT02pNavigationSnapshot(
                readCurrentNavigationSnapshot(),
              )}`
            : eventEntry,
        );
      });
    };

    const pointerMoveThrottle = createAnimationFrameThrottle(
      window,
      (observation: () => void) => observation(),
    );
    const touchMoveThrottle = createAnimationFrameThrottle(
      window,
      (observation: () => void) => observation(),
    );

    const handlePointerEvent = (nativeEvent: Event) => {
      if (isLoggerControlEvent(nativeEvent)) return;
      const event = nativeEvent as PointerEvent;
      const observation = () =>
        enqueueAfterDispatch(
          () => formatT02pPointerEvent(event, document),
          true,
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

    const handleTouchEvent = (nativeEvent: Event) => {
      if (isLoggerControlEvent(nativeEvent)) return;
      const event = nativeEvent as TouchEvent;
      const observation = () =>
        enqueueAfterDispatch(() => formatT02pTouchEvent(event, document), true);

      if (event.type === "touchmove") {
        touchMoveThrottle.push(observation);
        return;
      }
      if (event.type === "touchend" || event.type === "touchcancel") {
        touchMoveThrottle.flush();
      }

      observation();
    };

    const handleMouseEvent = (nativeEvent: Event) => {
      if (isLoggerControlEvent(nativeEvent)) return;
      const event = nativeEvent as MouseEvent;
      enqueueAfterDispatch(
        () => formatT02pMouseEvent(event, document),
        event.type === "click",
      );
    };

    const handlePageEvent = (event: Event) => {
      if (event.type === "resize" || event.type === "orientationchange") {
        setClientEnvironment(readT02pClientEnvironment(window));
      }
      enqueueAfterDispatch(() =>
        formatT02pPageEvent(event.type, window, document),
      );
    };

    const handleWindowError = (event: ErrorEvent) => {
      enqueueAfterDispatch(() => formatT02pWindowError(event));
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      enqueueAfterDispatch(() => formatT02pUnhandledRejection(event));
    };

    for (const eventType of t02pPointerEventTypes) {
      document.addEventListener(eventType, handlePointerEvent, {
        capture: true,
        passive: true,
      });
    }
    for (const eventType of t02pTouchEventTypes) {
      document.addEventListener(eventType, handleTouchEvent, {
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
      touchMoveThrottle.dispose();
      for (const eventType of t02pPointerEventTypes) {
        document.removeEventListener(eventType, handlePointerEvent, true);
      }
      for (const eventType of t02pTouchEventTypes) {
        document.removeEventListener(eventType, handleTouchEvent, true);
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
  }, [appendInteractionEntry, readCurrentNavigationSnapshot]);

  useEffect(() => {
    const previousDestination = previousDestinationRef.current;
    if (previousDestination === activeDestination) return;

    previousDestinationRef.current = activeDestination;
    appendInteractionEntry(
      `STATE activeDestination: ${previousDestination} -> ${activeDestination}\n${formatT02pNavigationSnapshot(
        readCurrentNavigationSnapshot(),
      )}`,
    );
  }, [
    activeDestination,
    appendInteractionEntry,
    readCurrentNavigationSnapshot,
  ]);

  useEffect(() => {
    const previousPlatform = previousPlatformRef.current;
    if (previousPlatform === platform) return;

    previousPlatformRef.current = platform;
    appendInteractionEntry(
      `STATE platform: ${previousPlatform} -> ${platform}\n${formatT02pNavigationSnapshot(
        readCurrentNavigationSnapshot(),
      )}`,
    );
  }, [appendInteractionEntry, platform, readCurrentNavigationSnapshot]);

  const currentEnvironment =
    clientEnvironment ??
    ({
      devicePixelRatio: 0,
      hasPointerEvent: false,
      hasTouchStart: false,
      maxTouchPoints: 0,
      url: "pending",
      userAgent: "pending",
      viewportHeight: 0,
      viewportWidth: 0,
    } satisfies T02pClientEnvironment);

  const handleClearLog = () => {
    const environment = readT02pClientEnvironment(window);
    const sessionHeader =
      sessionHeaderRef.current ||
      formatT02pSessionHeader(
        environment,
        activeDestinationRef.current,
        platformRef.current,
      );
    const currentState = formatT02pCurrentState(
      environment,
      platformRef.current,
      readCurrentNavigationSnapshot(),
    );

    sequenceRef.current = 0;
    setCopyStatus("");
    setClientEnvironment(environment);
    setInteractionEntries([
      stampInteractionEntry("LOG CLEARED"),
      stampInteractionEntry(`SESSION MARKER\n${sessionHeader}`),
      stampInteractionEntry(currentState),
    ]);
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
          interactionEntries,
          currentState,
        ),
      );
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy failed");
    }
  };

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

      <section
        aria-labelledby="t02p-interaction-log-heading"
        data-t02p-interaction-log=""
        style={interactionPanelStyle}
      >
        <h2 id="t02p-interaction-log-heading">Real-device interaction log</h2>
        <dl>
          <dt>activeDestination</dt>
          <dd data-interaction-status="activeDestination">
            {activeDestination}
          </dd>
          <dt>presentation platform</dt>
          <dd data-interaction-status="platform">{platform}</dd>
          <dt>viewport</dt>
          <dd data-interaction-status="viewport">
            {currentEnvironment.viewportWidth}x
            {currentEnvironment.viewportHeight}
          </dd>
          <dt>devicePixelRatio</dt>
          <dd>{currentEnvironment.devicePixelRatio}</dd>
          <dt>userAgent</dt>
          <dd style={{ overflowWrap: "anywhere" }}>
            {currentEnvironment.userAgent}
          </dd>
          <dt>pointer / touch support</dt>
          <dd>
            PointerEvent={String(currentEnvironment.hasPointerEvent)};{" "}
            ontouchstart={String(currentEnvironment.hasTouchStart)};
            maxTouchPoints={currentEnvironment.maxTouchPoints}
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
          aria-label="Real-device interaction log entries"
          data-t02p-interaction-log-entries=""
          style={interactionLogStyle}
        >
          {interactionEntries.join("\n\n")}
        </pre>
      </section>
    </main>
  );
};
