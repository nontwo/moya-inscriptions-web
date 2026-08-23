import type { PresentationPlatform } from "./device-platform";
import type { PrimaryDestination } from "./primary-shell";

export const MAX_T02P_INTERACTION_LOG_ENTRIES = 400;

export const t02pPointerEventTypes = [
  "pointerdown",
  "pointermove",
  "pointerup",
  "pointercancel",
  "gotpointercapture",
  "lostpointercapture",
] as const;

export const t02pMouseEventTypes = ["click"] as const;

export interface T02pClientEnvironment {
  readonly devicePixelRatio: number;
  readonly hasPointerEvent: boolean;
  readonly hasTouchStart: boolean;
  readonly maxTouchPoints: number;
  readonly url: string;
  readonly userAgent: string;
  readonly viewportHeight: number;
  readonly viewportWidth: number;
}

export interface T02pNavigationSnapshot {
  readonly activeDestination: PrimaryDestination;
  readonly activeIndex: string;
  readonly bubblePreviewIndex: string;
  readonly dragging: string;
  readonly selectedDestination: string;
}

const compactText = (value: unknown, maximumLength = 500) => {
  const text =
    value instanceof Error
      ? `${value.name}: ${value.message}`
      : typeof value === "string"
        ? value
        : String(value);
  const singleLine = text.replace(/\s+/g, " ").trim();

  return singleLine.length > maximumLength
    ? `${singleLine.slice(0, maximumLength)}…`
    : singleLine;
};

const quoted = (value: string | null | undefined) =>
  JSON.stringify(
    value === null || value === undefined || value === "" ? "-" : value,
  );

const closestDestination = (element: Element | null) =>
  element
    ?.closest<HTMLElement>("[data-primary-navigation-destination]")
    ?.getAttribute("data-primary-navigation-destination") ?? "-";

const describeElement = (element: Element | null) => {
  if (element === null) return "element=null";

  return [
    `tag=${element.tagName.toLowerCase()}`,
    `ariaLabel=${quoted(element.getAttribute("aria-label"))}`,
    `destination=${quoted(
      element.getAttribute("data-primary-navigation-destination"),
    )}`,
    `closestDestination=${quoted(closestDestination(element))}`,
    `insideNavigation=${element.closest("[data-primary-navigation]") !== null}`,
  ].join(" ");
};

const eventTargetElement = (target: EventTarget | null) =>
  target instanceof Element ? target : null;

const elementAtPoint = (
  document: Document,
  clientX: number,
  clientY: number,
) => {
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

  return document.elementFromPoint(clientX, clientY);
};

const hasPointerCapture = (element: Element | null, pointerId: number) => {
  if (element === null || !("hasPointerCapture" in element))
    return "unsupported";

  try {
    return String(element.hasPointerCapture(pointerId));
  } catch {
    return "error";
  }
};

export const readT02pClientEnvironment = (
  browserWindow: Window,
): T02pClientEnvironment => ({
  devicePixelRatio: browserWindow.devicePixelRatio,
  hasPointerEvent: "PointerEvent" in browserWindow,
  hasTouchStart: "ontouchstart" in browserWindow,
  maxTouchPoints: browserWindow.navigator.maxTouchPoints,
  url: browserWindow.location.href,
  userAgent: browserWindow.navigator.userAgent,
  viewportHeight: browserWindow.innerHeight,
  viewportWidth: browserWindow.innerWidth,
});

export const readT02pNavigationSnapshot = (
  root: ParentNode | null,
  activeDestination: PrimaryDestination,
): T02pNavigationSnapshot => {
  const navigation = root?.querySelector<HTMLElement>(
    "[data-primary-navigation]",
  );
  const selected = navigation?.querySelector<HTMLElement>(
    '[data-primary-navigation-destination][aria-current="page"]',
  );

  return {
    activeDestination,
    activeIndex: navigation?.getAttribute("data-active-index") ?? "-",
    bubblePreviewIndex:
      navigation?.getAttribute("data-bubble-preview-index") ?? "-",
    dragging: navigation?.getAttribute("data-dragging") ?? "false",
    selectedDestination:
      selected?.getAttribute("data-primary-navigation-destination") ?? "-",
  };
};

export const formatT02pNavigationSnapshot = (
  snapshot: T02pNavigationSnapshot,
) =>
  `NAV activeDestination=${snapshot.activeDestination} activeIndex=${snapshot.activeIndex} bubblePreviewIndex=${snapshot.bubblePreviewIndex} dragging=${snapshot.dragging} selected=${snapshot.selectedDestination}`;

export const formatT02pSessionHeader = (
  environment: T02pClientEnvironment,
  activeDestination: PrimaryDestination,
  platform: PresentationPlatform,
) => {
  const iphone = new URL(environment.url).searchParams.get("iphone");
  const fields = [
    "SESSION HYDRATED",
    `activeDestination=${activeDestination}`,
    `platform=${platform}`,
    `viewport=${environment.viewportWidth}x${environment.viewportHeight}`,
    `devicePixelRatio=${environment.devicePixelRatio}`,
    `userAgent=${quoted(environment.userAgent)}`,
    `maxTouchPoints=${environment.maxTouchPoints}`,
    `PointerEvent=${environment.hasPointerEvent}`,
    `ontouchstart=${environment.hasTouchStart}`,
    `url=${quoted(environment.url)}`,
  ];

  if (iphone !== null) fields.push(`iphone=${quoted(iphone)}`);

  return fields.join("\n");
};

export const formatT02pCurrentState = (
  environment: T02pClientEnvironment,
  platform: PresentationPlatform,
  navigation: T02pNavigationSnapshot,
) =>
  [
    `CURRENT STATE platform=${platform} viewport=${environment.viewportWidth}x${environment.viewportHeight} devicePixelRatio=${environment.devicePixelRatio}`,
    formatT02pNavigationSnapshot(navigation),
  ].join("\n");

export const formatT02pPointerEvent = (
  event: PointerEvent,
  document: Document,
) => {
  const target = eventTargetElement(event.target);
  const navigationButton = target?.closest<HTMLElement>(
    "[data-primary-navigation-destination]",
  );
  const hit = elementAtPoint(document, event.clientX, event.clientY);

  return [
    `POINTER type=${event.type}`,
    `trusted=${event.isTrusted}`,
    `pointerType=${quoted(event.pointerType)}`,
    `pointerId=${event.pointerId}`,
    `primary=${event.isPrimary}`,
    `button=${event.button}`,
    `buttons=${event.buttons}`,
    `client=${event.clientX},${event.clientY}`,
    `defaultPrevented=${event.defaultPrevented}`,
    `targetCapture=${hasPointerCapture(target, event.pointerId)}`,
    `navigationButtonCapture=${hasPointerCapture(
      navigationButton ?? null,
      event.pointerId,
    )}`,
    `target={${describeElement(target)}}`,
    `hit={${describeElement(hit)}}`,
  ].join(" ");
};

export const formatT02pMouseEvent = (event: MouseEvent, document: Document) => {
  const target = eventTargetElement(event.target);
  const hit = elementAtPoint(document, event.clientX, event.clientY);

  return [
    `MOUSE type=${event.type}`,
    `trusted=${event.isTrusted}`,
    `button=${event.button}`,
    `buttons=${event.buttons}`,
    `client=${event.clientX},${event.clientY}`,
    `defaultPrevented=${event.defaultPrevented}`,
    `target={${describeElement(target)}}`,
    `hit={${describeElement(hit)}}`,
  ].join(" ");
};

export const formatT02pPageEvent = (
  type: string,
  browserWindow: Window,
  document: Document,
) =>
  `PAGE type=${type} viewport=${browserWindow.innerWidth}x${browserWindow.innerHeight} devicePixelRatio=${browserWindow.devicePixelRatio} visibility=${document.visibilityState}`;

export const formatT02pWindowError = (event: ErrorEvent) =>
  `ERROR type=error message=${quoted(compactText(event.message))} source=${quoted(
    event.filename,
  )}:${event.lineno}:${event.colno}`;

export const formatT02pUnhandledRejection = (event: PromiseRejectionEvent) =>
  `ERROR type=unhandledrejection reason=${quoted(compactText(event.reason))}`;

export const buildT02pInteractionReport = (
  session: string,
  entries: readonly string[],
  currentState: string,
) =>
  [
    "SESSION",
    session,
    "",
    "EVENTS",
    entries.length === 0 ? "(none)" : entries.join("\n\n"),
    "",
    "CURRENT STATE",
    currentState,
  ].join("\n");

export const appendBoundedT02pInteractionEntry = (
  entries: string[],
  entry: string,
) => {
  entries.push(entry);
  const overflow = entries.length - MAX_T02P_INTERACTION_LOG_ENTRIES;
  if (overflow > 0) entries.splice(0, overflow);
};

export interface AnimationFrameThrottle<T> {
  readonly dispose: () => void;
  readonly flush: () => void;
  readonly push: (value: T) => void;
}

export const createAnimationFrameThrottle = <T>(
  browserWindow: Window,
  emit: (value: T) => void,
): AnimationFrameThrottle<T> => {
  let frameId: number | null = null;
  let gateOpen = true;
  let pending: T | null = null;

  const scheduleNextFrame = () => {
    frameId = browserWindow.requestAnimationFrame(() => {
      frameId = null;
      gateOpen = true;

      if (pending !== null) {
        const value = pending;
        pending = null;
        gateOpen = false;
        emit(value);
        scheduleNextFrame();
      }
    });
  };

  const flush = () => {
    if (pending !== null) {
      emit(pending);
      pending = null;
    }
    if (frameId !== null) {
      browserWindow.cancelAnimationFrame(frameId);
      frameId = null;
    }
    gateOpen = true;
  };

  return {
    dispose: flush,
    flush,
    push: (value) => {
      if (gateOpen) {
        gateOpen = false;
        emit(value);
        scheduleNextFrame();
        return;
      }

      pending = value;
    },
  };
};
