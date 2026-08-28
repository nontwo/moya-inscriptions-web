import type { PrimaryDestination } from "../shell/primary-shell";

export const PRODUCT_SHELL_HISTORY_VERSION = 1;

export interface PrimaryProductHistoryState {
  readonly kind: "primary";
  readonly version: typeof PRODUCT_SHELL_HISTORY_VERSION;
  readonly destination: PrimaryDestination;
  readonly focusCatalogId?: string;
  readonly focusTopicId?: string;
  readonly scrollTop?: number;
}

export interface DetailProductHistoryState {
  readonly catalogId: string;
  readonly detailScrollTop: number;
  readonly kind: "detail";
  readonly sourceDestination: PrimaryDestination;
  readonly sourceScrollTop: number;
  readonly version: typeof PRODUCT_SHELL_HISTORY_VERSION;
}

export interface ViewerProductHistoryState {
  readonly catalogId: string;
  readonly detailScrollTop: number;
  readonly kind: "viewer";
  readonly mediaId: string;
  readonly sourceDestination: PrimaryDestination;
  readonly sourceScrollTop: number;
  readonly version: typeof PRODUCT_SHELL_HISTORY_VERSION;
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
  | DetailProductHistoryState
  | ViewerProductHistoryState
  | SettingsProductHistoryState
  | TopicProductHistoryState;

const productHistoryKeys = new Set([
  "destination",
  "catalogId",
  "detailScrollTop",
  "focusCatalogId",
  "focusTopicId",
  "kind",
  "mediaId",
  "scrollTop",
  "sourceDestination",
  "sourceHomeFeed",
  "sourceScrollTop",
  "topicId",
  "version",
]);

export const mergeProductHistoryState = (
  runtimeState: unknown,
  productState: ProductHistoryState,
): ProductHistoryState & Record<string, unknown> => {
  const preserved =
    typeof runtimeState === "object" &&
    runtimeState !== null &&
    !Array.isArray(runtimeState)
      ? Object.fromEntries(
          Object.entries(runtimeState).filter(
            ([key]) => !productHistoryKeys.has(key),
          ),
        )
      : {};
  return { ...preserved, ...productState };
};

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
  scrollTop?: number,
  focusTopicId?: string,
  focusCatalogId?: string,
): PrimaryProductHistoryState => ({
  destination,
  ...(focusCatalogId !== undefined && focusCatalogId.length > 0
    ? { focusCatalogId }
    : {}),
  ...(destination === "home" &&
  focusTopicId !== undefined &&
  focusTopicId.length > 0
    ? { focusTopicId }
    : {}),
  kind: "primary",
  ...(scrollTop === undefined
    ? {}
    : {
        scrollTop: Number.isFinite(scrollTop) ? Math.max(0, scrollTop) : 0,
      }),
  version: PRODUCT_SHELL_HISTORY_VERSION,
});

const boundedScrollTop = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

export const detailHistoryState = (
  catalogId: string,
  sourceDestination: PrimaryDestination,
  sourceScrollTop: number,
  detailScrollTop = 0,
): DetailProductHistoryState => ({
  catalogId,
  detailScrollTop: boundedScrollTop(detailScrollTop),
  kind: "detail",
  sourceDestination,
  sourceScrollTop: boundedScrollTop(sourceScrollTop),
  version: PRODUCT_SHELL_HISTORY_VERSION,
});

export const viewerHistoryState = (
  catalogId: string,
  mediaId: string,
  sourceDestination: PrimaryDestination,
  sourceScrollTop: number,
  detailScrollTop = 0,
): ViewerProductHistoryState => ({
  catalogId,
  detailScrollTop: boundedScrollTop(detailScrollTop),
  kind: "viewer",
  mediaId,
  sourceDestination,
  sourceScrollTop: boundedScrollTop(sourceScrollTop),
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
  sourceScrollTop: boundedScrollTop(sourceScrollTop),
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
    if (
      candidate.scrollTop !== undefined &&
      (typeof candidate.scrollTop !== "number" ||
        !Number.isFinite(candidate.scrollTop) ||
        candidate.scrollTop < 0)
    ) {
      return null;
    }
    if (
      candidate.focusTopicId !== undefined &&
      (candidate.destination !== "home" ||
        typeof candidate.focusTopicId !== "string" ||
        candidate.focusTopicId.length === 0)
    ) {
      return null;
    }
    if (
      candidate.focusCatalogId !== undefined &&
      (typeof candidate.focusCatalogId !== "string" ||
        candidate.focusCatalogId.length === 0)
    ) {
      return null;
    }
    return primaryHistoryState(
      candidate.destination,
      candidate.scrollTop as number | undefined,
      candidate.focusTopicId as string | undefined,
      candidate.focusCatalogId as string | undefined,
    );
  }

  if (
    candidate.kind === "detail" &&
    typeof candidate.catalogId === "string" &&
    candidate.catalogId.length > 0 &&
    isPrimaryDestination(candidate.sourceDestination) &&
    typeof candidate.sourceScrollTop === "number" &&
    Number.isFinite(candidate.sourceScrollTop) &&
    candidate.sourceScrollTop >= 0 &&
    typeof candidate.detailScrollTop === "number" &&
    Number.isFinite(candidate.detailScrollTop) &&
    candidate.detailScrollTop >= 0
  ) {
    return detailHistoryState(
      candidate.catalogId,
      candidate.sourceDestination,
      candidate.sourceScrollTop,
      candidate.detailScrollTop,
    );
  }

  if (
    candidate.kind === "viewer" &&
    typeof candidate.catalogId === "string" &&
    candidate.catalogId.length > 0 &&
    typeof candidate.mediaId === "string" &&
    candidate.mediaId.length > 0 &&
    isPrimaryDestination(candidate.sourceDestination) &&
    typeof candidate.sourceScrollTop === "number" &&
    Number.isFinite(candidate.sourceScrollTop) &&
    candidate.sourceScrollTop >= 0 &&
    typeof candidate.detailScrollTop === "number" &&
    Number.isFinite(candidate.detailScrollTop) &&
    candidate.detailScrollTop >= 0
  ) {
    return viewerHistoryState(
      candidate.catalogId,
      candidate.mediaId,
      candidate.sourceDestination,
      candidate.sourceScrollTop,
      candidate.detailScrollTop,
    );
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

export const primaryLocation = (location: Location) => {
  const parameters = new URLSearchParams(location.search);
  parameters.delete("catalogId");
  parameters.delete("image");
  const search = parameters.toString();
  return `${location.pathname}${search.length === 0 ? "" : `?${search}`}`;
};

export const settingsLocation = (location: Location) =>
  `${primaryLocation(location)}#settings`;

export const topicLocation = (location: Location, topicId: string) =>
  `${primaryLocation(location)}#topic-${encodeURIComponent(topicId)}`;

export const detailLocation = (location: Location, catalogId: string) => {
  const parameters = new URLSearchParams(location.search);
  parameters.delete("image");
  parameters.set("catalogId", catalogId);
  return `${location.pathname}?${parameters.toString()}#detail`;
};

export const viewerLocation = (
  location: Location,
  catalogId: string,
  mediaId: string,
) => {
  const parameters = new URLSearchParams(location.search);
  parameters.set("catalogId", catalogId);
  parameters.set("image", mediaId);
  return `${location.pathname}?${parameters.toString()}#viewer`;
};

const directIdentifierFromLocation = (
  location: Pick<Location, "search">,
  name: string,
): string | null => {
  const identifier = new URLSearchParams(location.search).get(name);
  return identifier !== null &&
    identifier.length > 0 &&
    identifier.length <= 128 &&
    /^\S+$/u.test(identifier)
    ? identifier
    : null;
};

export const directCatalogIdFromLocation = (
  location: Pick<Location, "search">,
): string | null => directIdentifierFromLocation(location, "catalogId");

export const directMediaIdFromLocation = (
  location: Pick<Location, "search">,
): string | null => directIdentifierFromLocation(location, "image");
