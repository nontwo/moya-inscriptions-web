import type { ContentIdentity } from "@moya/contracts";
import type { PrimaryDestination } from "../shell/primary-shell";

export const PRODUCT_SHELL_HISTORY_VERSION = 2;

export interface PrimaryProductHistoryState {
  readonly kind: "primary";
  readonly version: typeof PRODUCT_SHELL_HISTORY_VERSION;
  readonly destination: PrimaryDestination;
  readonly focusCatalogId?: string;
  readonly focusTopicId?: string;
  readonly scrollTop?: number;
}

export interface DetailProductHistoryState {
  readonly target: ContentIdentity;
  readonly detailScrollTop: number;
  readonly kind: "detail";
  readonly sourceDestination: PrimaryDestination;
  readonly sourceScrollTop: number;
  readonly version: typeof PRODUCT_SHELL_HISTORY_VERSION;
}

export interface ViewerProductHistoryState {
  readonly target: ContentIdentity;
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
  | TopicProductHistoryState
  | ProfileProductHistoryState;

export type ProfileTab =
  "works" | "favorites" | "likes" | "history" | "comments";
export interface ProfileProductHistoryState {
  readonly kind: "profile";
  readonly version: typeof PRODUCT_SHELL_HISTORY_VERSION;
  readonly authorId: string | null;
  readonly entryId: string;
  readonly tab: ProfileTab;
  readonly profileScrollTop: number;
  readonly sourceDestination: PrimaryDestination;
  readonly sourceScrollTop: number;
}
const productHistoryKeys = new Set([
  "target",
  "authorId",
  "entryId",
  "tab",
  "profileScrollTop",

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
  target: string | ContentIdentity,
  sourceDestination: PrimaryDestination,
  sourceScrollTop: number,
  detailScrollTop = 0,
): DetailProductHistoryState => ({
  target: typeof target === "string" ? { type: "catalog", id: target } : target,
  detailScrollTop: boundedScrollTop(detailScrollTop),
  kind: "detail",
  sourceDestination,
  sourceScrollTop: boundedScrollTop(sourceScrollTop),
  version: PRODUCT_SHELL_HISTORY_VERSION,
});

export const viewerHistoryState = (
  target: string | ContentIdentity,
  mediaId: string,
  sourceDestination: PrimaryDestination,
  sourceScrollTop: number,
  detailScrollTop = 0,
): ViewerProductHistoryState => ({
  target: typeof target === "string" ? { type: "catalog", id: target } : target,
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
  if (
    candidate.version !== PRODUCT_SHELL_HISTORY_VERSION &&
    candidate.version !== 1
  )
    return null;
  const target =
    parseTarget(candidate.target) ??
    (typeof candidate.catalogId === "string"
      ? parseTarget({ type: "catalog", id: candidate.catalogId })
      : null);
  if (
    candidate.kind === "profile" &&
    (candidate.authorId === null ||
      (typeof candidate.authorId === "string" &&
        /^user-[0-9a-f]{32}$/.test(candidate.authorId))) &&
    typeof candidate.entryId === "string" &&
    candidate.entryId.length > 0 &&
    candidate.entryId.length <= 128 &&
    ["works", "favorites", "likes", "history", "comments"].includes(
      String(candidate.tab),
    ) &&
    typeof candidate.profileScrollTop === "number" &&
    Number.isFinite(candidate.profileScrollTop) &&
    candidate.profileScrollTop >= 0 &&
    isPrimaryDestination(candidate.sourceDestination) &&
    typeof candidate.sourceScrollTop === "number" &&
    Number.isFinite(candidate.sourceScrollTop) &&
    candidate.sourceScrollTop >= 0
  )
    return profileHistoryState(
      candidate.authorId,
      candidate.entryId,
      candidate.tab as ProfileTab,
      candidate.profileScrollTop,
      candidate.sourceDestination,
      candidate.sourceScrollTop,
    );

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
    target !== null &&
    isPrimaryDestination(candidate.sourceDestination) &&
    typeof candidate.sourceScrollTop === "number" &&
    Number.isFinite(candidate.sourceScrollTop) &&
    candidate.sourceScrollTop >= 0 &&
    typeof candidate.detailScrollTop === "number" &&
    Number.isFinite(candidate.detailScrollTop) &&
    candidate.detailScrollTop >= 0
  ) {
    return detailHistoryState(
      target,
      candidate.sourceDestination,
      candidate.sourceScrollTop,
      candidate.detailScrollTop,
    );
  }

  if (
    candidate.kind === "viewer" &&
    target !== null &&
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
      target,
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
  parameters.delete("workId");
  parameters.delete("authorId");
  parameters.delete("image");
  const search = parameters.toString();
  return `${location.pathname}${search.length === 0 ? "" : `?${search}`}`;
};

export const settingsLocation = (location: Location) =>
  `${primaryLocation(location)}#settings`;

export const topicLocation = (location: Location, topicId: string) =>
  `${primaryLocation(location)}#topic-${encodeURIComponent(topicId)}`;

const contentParameters = (
  location: Pick<Location, "search">,
  target: string | ContentIdentity,
) => {
  const t =
    typeof target === "string"
      ? { type: "catalog" as const, id: target }
      : target;
  const parameters = new URLSearchParams(location.search);
  for (const key of ["catalogId", "workId", "authorId", "image"])
    parameters.delete(key);
  parameters.set(t.type === "catalog" ? "catalogId" : "workId", t.id);
  return parameters;
};
export const detailLocation = (
  location: Location,
  target: string | ContentIdentity,
) => `${location.pathname}?${contentParameters(location, target)}#detail`;
export const viewerLocation = (
  location: Location,
  target: string | ContentIdentity,
  mediaId: string,
) => {
  const p = contentParameters(location, target);
  p.set("image", mediaId);
  return `${location.pathname}?${p}#viewer`;
};
export const profileHistoryState = (
  authorId: string | null,
  entryId: string,
  tab: ProfileTab,
  scroll: number,
  sourceDestination: PrimaryDestination,
  sourceScrollTop: number,
): ProfileProductHistoryState => ({
  kind: "profile",
  version: PRODUCT_SHELL_HISTORY_VERSION,
  authorId,
  entryId,
  tab,
  profileScrollTop: boundedScrollTop(scroll),
  sourceDestination,
  sourceScrollTop: boundedScrollTop(sourceScrollTop),
});
export const profileLocation = (
  location: Location,
  authorId: string | null,
) => {
  const url = new URL(primaryLocation(location), location.origin);
  if (authorId) url.searchParams.set("authorId", authorId);
  return `${url.pathname}${url.search}#profile`;
};
const parseTarget = (value: unknown): ContentIdentity | null => {
  if (!value || typeof value !== "object") return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    r.id.length === 0 ||
    r.id.length > 128 ||
    /\s/u.test(r.id)
  )
    return null;
  return r.type === "catalog"
    ? { type: "catalog", id: r.id }
    : r.type === "work" && /^work-[0-9a-f]{32}$/.test(r.id)
      ? { type: "work", id: r.id }
      : null;
};
export const directContentFromLocation = (
  location: Pick<Location, "search">,
): ContentIdentity | null => {
  const p = new URLSearchParams(location.search);
  if (
    p.has("authorId") ||
    p.getAll("catalogId").length + p.getAll("workId").length !== 1
  )
    return null;
  return p.has("workId")
    ? parseTarget({ type: "work", id: p.get("workId") })
    : parseTarget({ type: "catalog", id: p.get("catalogId") });
};
export const directAuthorFromLocation = (
  location: Pick<Location, "search" | "hash">,
): string | null | undefined => {
  const p = new URLSearchParams(location.search);
  if (p.has("catalogId") || p.has("workId") || p.getAll("authorId").length > 1)
    return undefined;
  const id = p.get("authorId");
  if (id && /^user-[0-9a-f]{32}$/.test(id)) return id;
  return !id && location.hash === "#profile" ? null : undefined;
};

const directIdentifierFromLocation = (
  location: Pick<Location, "search">,
  name: string,
): string | null => {
  const parameters = new URLSearchParams(location.search);
  if (parameters.getAll(name).length !== 1) return null;
  const identifier = parameters.get(name);
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
