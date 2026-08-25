import type { PrimaryDestination } from "../shell/primary-shell";

export const PRODUCT_SHELL_HISTORY_VERSION = 1;

export interface PrimaryProductHistoryState {
  readonly kind: "primary";
  readonly version: typeof PRODUCT_SHELL_HISTORY_VERSION;
  readonly destination: PrimaryDestination;
}

export interface SettingsProductHistoryState {
  readonly kind: "settings";
  readonly version: typeof PRODUCT_SHELL_HISTORY_VERSION;
  readonly sourceDestination: PrimaryDestination;
}

export interface TopicProductHistoryState {
  readonly kind: "topic";
  readonly sourceDestination: "home";
  readonly sourceHomeFeed: "topics";
  readonly sourceScrollTop: number;
  readonly topicId: string;
  readonly version: typeof PRODUCT_SHELL_HISTORY_VERSION;
}

export type ProductHistoryState =
  | PrimaryProductHistoryState
  | SettingsProductHistoryState
  | TopicProductHistoryState;

const primaryDestinations = new Set<PrimaryDestination>([
  "home",
  "inscriptions",
  "calligraphy",
]);

export const isPrimaryDestination = (
  value: unknown,
): value is PrimaryDestination =>
  typeof value === "string" &&
  primaryDestinations.has(value as PrimaryDestination);

export const primaryHistoryState = (
  destination: PrimaryDestination,
): PrimaryProductHistoryState => ({
  destination,
  kind: "primary",
  version: PRODUCT_SHELL_HISTORY_VERSION,
});

export const settingsHistoryState = (
  sourceDestination: PrimaryDestination,
): SettingsProductHistoryState => ({
  kind: "settings",
  sourceDestination,
  version: PRODUCT_SHELL_HISTORY_VERSION,
});

export const topicHistoryState = (
  topicId: string,
  sourceScrollTop: number,
): TopicProductHistoryState => ({
  kind: "topic",
  sourceDestination: "home",
  sourceHomeFeed: "topics",
  sourceScrollTop: Number.isFinite(sourceScrollTop)
    ? Math.max(0, sourceScrollTop)
    : 0,
  topicId,
  version: PRODUCT_SHELL_HISTORY_VERSION,
});

export const parseProductHistoryState = (
  value: unknown,
): ProductHistoryState | null => {
  if (typeof value !== "object" || value === null) return null;

  const candidate = value as Record<string, unknown>;
  if (candidate.version !== PRODUCT_SHELL_HISTORY_VERSION) return null;

  if (
    candidate.kind === "primary" &&
    isPrimaryDestination(candidate.destination)
  ) {
    return primaryHistoryState(candidate.destination);
  }

  if (
    candidate.kind === "settings" &&
    isPrimaryDestination(candidate.sourceDestination)
  ) {
    return settingsHistoryState(candidate.sourceDestination);
  }

  if (
    candidate.kind === "topic" &&
    candidate.sourceDestination === "home" &&
    candidate.sourceHomeFeed === "topics" &&
    typeof candidate.topicId === "string" &&
    candidate.topicId.length > 0 &&
    typeof candidate.sourceScrollTop === "number" &&
    Number.isFinite(candidate.sourceScrollTop) &&
    candidate.sourceScrollTop >= 0
  ) {
    return topicHistoryState(candidate.topicId, candidate.sourceScrollTop);
  }

  return null;
};

export const primaryLocation = (location: Location) =>
  `${location.pathname}${location.search}`;

export const settingsLocation = (location: Location) =>
  `${primaryLocation(location)}#settings`;

export const topicLocation = (location: Location, topicId: string) =>
  `${primaryLocation(location)}#topic-${encodeURIComponent(topicId)}`;
