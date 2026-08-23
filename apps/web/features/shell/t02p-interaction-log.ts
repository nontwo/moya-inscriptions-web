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

export interface T02pNodeIdentityTracker {
  readonly read: (element: Element | null) => string;
}

export interface T02pNavigationVisualSnapshot {
  readonly activeDestination: PrimaryDestination;
  readonly groups: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface T02pNavigationVisualFrame {
  readonly label: string;
  readonly snapshot: T02pNavigationVisualSnapshot;
}

export interface T02pVisualLifecycleEntry {
  readonly kind: "attribute" | "childList" | "motion";
  readonly summary: string;
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

const primaryDestinations = [
  "home",
  "inscriptions",
  "calligraphy",
] as const satisfies readonly PrimaryDestination[];

const rounded = (value: number) => String(Number(value.toFixed(2)));

const readCompactRect = (element: Element | null) => {
  if (element === null) return "-";
  const rect = element.getBoundingClientRect();

  return `x:${rounded(rect.x)} y:${rounded(rect.y)} width:${rounded(
    rect.width,
  )} height:${rounded(rect.height)}`;
};

const readComputedStyleValue = (
  style: CSSStyleDeclaration | null,
  property: string,
) => {
  if (style === null) return "-";
  const value = style.getPropertyValue(property).trim();
  return value === "" ? "-" : compactText(value, 180);
};

const readComputedStyle = (element: Element | null) => {
  const view = element?.ownerDocument.defaultView;
  return element === null || view === null || view === undefined
    ? null
    : view.getComputedStyle(element);
};

const matchesSafely = (element: Element | null, selector: string) => {
  if (element === null) return "false";
  try {
    return String(element.matches(selector));
  } catch {
    return "unsupported";
  }
};

const elementVisualStyles = (element: Element | null) => {
  const style = readComputedStyle(element);

  return {
    backgroundColor: readComputedStyleValue(style, "background-color"),
    color: readComputedStyleValue(style, "color"),
    display: readComputedStyleValue(style, "display"),
    filter: readComputedStyleValue(style, "filter"),
    maskImage: readComputedStyleValue(style, "mask-image"),
    maskSize: readComputedStyleValue(style, "mask-size"),
    mixBlendMode: readComputedStyleValue(style, "mix-blend-mode"),
    opacity: readComputedStyleValue(style, "opacity"),
    transform: readComputedStyleValue(style, "transform"),
    visibility: readComputedStyleValue(style, "visibility"),
    WebkitMaskImage: readComputedStyleValue(style, "-webkit-mask-image"),
    WebkitMaskSize: readComputedStyleValue(style, "-webkit-mask-size"),
  };
};

const buttonVisualStyles = (element: Element | null) => {
  const style = readComputedStyle(element);

  return {
    active: matchesSafely(element, ":active"),
    backgroundColor: readComputedStyleValue(style, "background-color"),
    boxShadow: readComputedStyleValue(style, "box-shadow"),
    color: readComputedStyleValue(style, "color"),
    focus: matchesSafely(element, ":focus"),
    focusVisible: matchesSafely(element, ":focus-visible"),
    opacity: readComputedStyleValue(style, "opacity"),
    outline: readComputedStyleValue(style, "outline"),
    transform: readComputedStyleValue(style, "transform"),
  };
};

export const createT02pNodeIdentityTracker = (): T02pNodeIdentityTracker => {
  const identities = new WeakMap<Element, number>();
  let nextIdentity = 1;

  return {
    read: (element) => {
      if (element === null) return "-";
      const currentIdentity = identities.get(element);
      if (currentIdentity !== undefined) return String(currentIdentity);

      const identity = nextIdentity;
      nextIdentity += 1;
      identities.set(element, identity);
      return String(identity);
    },
  };
};

export const readT02pNavigationVisualSnapshot = (
  root: ParentNode | null,
  activeDestination: PrimaryDestination,
  identities: T02pNodeIdentityTracker,
): T02pNavigationVisualSnapshot => {
  const navigation = root?.querySelector<HTMLElement>(
    "[data-primary-navigation]",
  );
  const bubble = navigation?.querySelector<HTMLElement>(
    "[data-primary-navigation-bubble]",
  );
  const document = navigation?.ownerDocument;
  const navigationStyle = readComputedStyle(navigation ?? null);
  const bubbleStyle = readComputedStyle(bubble ?? null);
  const navigationSnapshot = readT02pNavigationSnapshot(
    root,
    activeDestination,
  );
  const groups: Record<string, Record<string, string>> = {
    navigation: {
      activeDestination,
      activeIndex: navigationSnapshot.activeIndex,
      backdropFilter: readComputedStyleValue(
        navigationStyle,
        "backdrop-filter",
      ),
      backgroundColor: readComputedStyleValue(
        navigationStyle,
        "background-color",
      ),
      bubblePreviewIndex: navigationSnapshot.bubblePreviewIndex,
      dragging: navigationSnapshot.dragging,
      node: identities.read(navigation ?? null),
      opacity: readComputedStyleValue(navigationStyle, "opacity"),
      rect: readCompactRect(navigation ?? null),
      selectedDestination: navigationSnapshot.selectedDestination,
      transform: readComputedStyleValue(navigationStyle, "transform"),
      WebkitBackdropFilter: readComputedStyleValue(
        navigationStyle,
        "-webkit-backdrop-filter",
      ),
    },
    bubble: {
      backgroundColor: readComputedStyleValue(bubbleStyle, "background-color"),
      node: identities.read(bubble ?? null),
      opacity: readComputedStyleValue(bubbleStyle, "opacity"),
      rect: readCompactRect(bubble ?? null),
      transform: readComputedStyleValue(bubbleStyle, "transform"),
      transition: readComputedStyleValue(bubbleStyle, "transition"),
    },
    focus: {
      activeElementDestination: closestDestination(
        document?.activeElement ?? null,
      ),
      activeElementNode: identities.read(document?.activeElement ?? null),
      activeElementTag: document?.activeElement?.tagName.toLowerCase() ?? "-",
    },
    renders: {
      acceptanceSurface:
        root instanceof Element
          ? (root.getAttribute("data-t02p-surface-render-count") ?? "-")
          : "-",
      logger:
        root
          ?.querySelector<HTMLElement>("[data-t02p-interaction-log]")
          ?.getAttribute("data-t02p-log-render-count") ?? "-",
    },
  };

  for (const destination of primaryDestinations) {
    const button = navigation?.querySelector<HTMLElement>(
      `[data-primary-navigation-destination="${destination}"]`,
    );
    const iconWrap = button?.querySelector<HTMLElement>(":scope > span");
    const icon = button?.querySelector<HTMLElement>(".yoyi-icon");
    const label = button?.querySelector<HTMLElement>(".yoyi-fixed-label");

    groups[`${destination}.nodes`] = {
      buttonNode: identities.read(button ?? null),
      iconNode: identities.read(icon ?? null),
      iconWrapNode: identities.read(iconWrap ?? null),
      labelNode: identities.read(label ?? null),
    };
    groups[`${destination}.button`] = {
      ...buttonVisualStyles(button ?? null),
      rect: readCompactRect(button ?? null),
    };
    groups[`${destination}.iconWrap`] = {
      rect: readCompactRect(iconWrap ?? null),
    };
    groups[`${destination}.icon`] = {
      ...elementVisualStyles(icon ?? null),
      rect: readCompactRect(icon ?? null),
    };
    groups[`${destination}.label`] = {
      ...elementVisualStyles(label ?? null),
      rect: readCompactRect(label ?? null),
    };
  }

  return { activeDestination, groups };
};

const formatVisualGroup = (
  name: string,
  fields: Readonly<Record<string, string>>,
) =>
  `${name} ${Object.entries(fields)
    .map(([field, value]) => `${field}=${quoted(value)}`)
    .join(" ")}`;

const visualGroupNames = (
  before: T02pNavigationVisualSnapshot,
  after: T02pNavigationVisualSnapshot,
) =>
  Array.from(
    new Set([...Object.keys(before.groups), ...Object.keys(after.groups)]),
  );

const readVisualChanges = (
  before: T02pNavigationVisualSnapshot,
  after: T02pNavigationVisualSnapshot,
) => {
  const changes: Array<{
    readonly after: string;
    readonly before: string;
    readonly field: string;
    readonly group: string;
  }> = [];

  for (const group of visualGroupNames(before, after)) {
    const beforeFields = before.groups[group] ?? {};
    const afterFields = after.groups[group] ?? {};
    const fields = new Set([
      ...Object.keys(beforeFields),
      ...Object.keys(afterFields),
    ]);

    for (const field of fields) {
      const beforeValue = beforeFields[field] ?? "-";
      const afterValue = afterFields[field] ?? "-";
      if (beforeValue === afterValue) continue;
      changes.push({
        after: afterValue,
        before: beforeValue,
        field,
        group,
      });
    }
  }

  return changes;
};

export const formatT02pNavigationVisualFrame = (
  frame: T02pNavigationVisualFrame,
  previous?: T02pNavigationVisualSnapshot,
) => {
  if (previous === undefined) {
    return [
      `VISUAL ${frame.label}`,
      ...Object.entries(frame.snapshot.groups).map(([name, fields]) =>
        formatVisualGroup(name, fields),
      ),
    ].join("\n");
  }

  const changes = readVisualChanges(previous, frame.snapshot);
  if (changes.length === 0) {
    return `VISUAL ${frame.label}\nNO VISUAL DOM/STYLE DELTA`;
  }

  const changesByGroup = new Map<string, string[]>();
  for (const change of changes) {
    const isTrackedNodeIdentity =
      (change.group === "navigation" && change.field === "node") ||
      (change.group === "bubble" && change.field === "node") ||
      (change.group.endsWith(".nodes") &&
        change.field.toLowerCase().endsWith("node"));
    const formatted = `${change.field} ${quoted(change.before)} -> ${quoted(
      change.after,
    )}${isTrackedNodeIdentity ? " NODE REPLACED" : ""}`;
    const current = changesByGroup.get(change.group) ?? [];
    current.push(formatted);
    changesByGroup.set(change.group, current);
  }

  return [
    `VISUAL ${frame.label}`,
    ...Array.from(
      changesByGroup,
      ([group, groupChanges]) => `${group}: ${groupChanges.join("; ")}`,
    ),
  ].join("\n");
};

export const formatT02pNavigationVisualTrace = (
  from: PrimaryDestination,
  to: PrimaryDestination,
  frames: readonly T02pNavigationVisualFrame[],
  lifecycle: readonly T02pVisualLifecycleEntry[],
) => {
  const replacements = frames.flatMap((frame, index) => {
    const previous = frames[index - 1]?.snapshot;
    if (previous === undefined) return [];

    return readVisualChanges(previous, frame.snapshot)
      .filter(
        (change) =>
          (change.group === "navigation" && change.field === "node") ||
          (change.group === "bubble" && change.field === "node") ||
          (change.group.endsWith(".nodes") &&
            change.field.toLowerCase().endsWith("node")),
      )
      .map(
        (change) =>
          `${change.group}.${change.field} ${change.before} -> ${change.after}`,
      );
  });
  const deltaCount = frames.reduce((count, frame, index) => {
    const previous = frames[index - 1]?.snapshot;
    return (
      count +
      (previous === undefined
        ? 0
        : readVisualChanges(previous, frame.snapshot).length)
    );
  }, 0);
  const childList = lifecycle.filter((entry) => entry.kind === "childList");
  const motion = lifecycle.filter((entry) => entry.kind === "motion");
  const mutations = lifecycle.filter((entry) => entry.kind !== "motion");

  return [
    `interaction: ${from} -> ${to}`,
    ...frames.map((frame, index) =>
      formatT02pNavigationVisualFrame(frame, frames[index - 1]?.snapshot),
    ),
    `DOM replacements: ${
      replacements.length === 0 ? "none" : replacements.join("; ")
    }`,
    `childList mutations: ${
      childList.length === 0
        ? "none"
        : childList.map((entry) => entry.summary).join("; ")
    }`,
    `style/geometry deltas: ${deltaCount}`,
    `transition/animation events: ${
      motion.length === 0
        ? "none"
        : motion.map((entry) => entry.summary).join("; ")
    }`,
    `mutations: ${
      mutations.length === 0
        ? "none"
        : mutations.map((entry) => entry.summary).join("; ")
    }`,
  ].join("\n");
};

export const formatT02pNavigationMotionEvent = (
  event: TransitionEvent | AnimationEvent,
  identities: T02pNodeIdentityTracker,
) => {
  const target = eventTargetElement(event.target);
  const transition = event as TransitionEvent;
  const animation = event as AnimationEvent;

  return [
    `MOTION type=${event.type}`,
    `targetNode=${identities.read(target)}`,
    `destination=${closestDestination(target)}`,
    `propertyName=${quoted(transition.propertyName)}`,
    `elapsedTime=${rounded(event.elapsedTime)}`,
    `animationName=${quoted(animation.animationName)}`,
  ].join(" ");
};

export const formatT02pNavigationMutation = (
  mutation: MutationRecord,
  identities: T02pNodeIdentityTracker,
): T02pVisualLifecycleEntry => {
  const target = eventTargetElement(mutation.target);

  if (mutation.type === "childList") {
    return {
      kind: "childList",
      summary: `NAV DOM CHILD MUTATION targetNode=${identities.read(
        target,
      )} destination=${closestDestination(target)} added=${
        mutation.addedNodes.length
      } removed=${mutation.removedNodes.length}`,
    };
  }

  const attribute = mutation.attributeName ?? "-";
  return {
    kind: "attribute",
    summary: `MUTATION attribute targetNode=${identities.read(
      target,
    )} destination=${closestDestination(target)} name=${attribute} old=${quoted(
      mutation.oldValue,
    )} new=${quoted(target?.getAttribute(attribute))}`,
  };
};

export const formatT02pFocusActiveEvidence = (
  root: ParentNode | null,
  identities: T02pNodeIdentityTracker,
) => {
  const navigation = root?.querySelector<HTMLElement>(
    "[data-primary-navigation]",
  );
  const document = navigation?.ownerDocument;
  const fields = [
    `activeElementNode=${identities.read(document?.activeElement ?? null)}`,
    `focusedDestination=${closestDestination(document?.activeElement ?? null)}`,
  ];

  for (const destination of primaryDestinations) {
    const button = navigation?.querySelector<HTMLElement>(
      `[data-primary-navigation-destination="${destination}"]`,
    );
    fields.push(
      `${destination}.focus=${matchesSafely(button ?? null, ":focus")}`,
      `${destination}.focusVisible=${matchesSafely(
        button ?? null,
        ":focus-visible",
      )}`,
      `${destination}.active=${matchesSafely(button ?? null, ":active")}`,
    );
  }

  return `FOCUS ACTIVE ${fields.join(" ")}`;
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
  visualTraces: readonly string[] = [],
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
    "",
    "NAV VISUAL TRACE",
    visualTraces.length === 0 ? "(none)" : visualTraces.join("\n\n"),
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
