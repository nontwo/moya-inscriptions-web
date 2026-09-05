import type { CatalogSummary } from "@moya/contracts";

export const quickActionNames = ["like", "favorite", "share"] as const;

export type QuickActionName = (typeof quickActionNames)[number];

export type QuickActionPhase =
  "idle" | "pressing" | "holding" | "menu-open" | "selecting";

export type QuickActionEvent = {
  readonly action?: QuickActionName;
  readonly contentId: string;
  readonly type: "cancelled" | "candidate" | "committed" | "opened";
};

export interface ContentActionAdapter {
  readonly favorite: (item: CatalogSummary) => Promise<void> | void;
  readonly like: (item: CatalogSummary) => Promise<void> | void;
  readonly share: (item: CatalogSummary) => Promise<void> | void;
  readonly unfavorite: (item: CatalogSummary) => Promise<void> | void;
  readonly unlike: (item: CatalogSummary) => Promise<void> | void;
}

export interface ContentQuickActionEnvironment {
  readonly adapter: ContentActionAdapter;
  readonly favoriteIds: readonly string[];
  readonly likedIds: readonly string[];
  readonly onEvent?: (event: QuickActionEvent) => void;
}
