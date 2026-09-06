export const quickActionNames = ["like", "favorite", "share"] as const;
export type QuickActionName = (typeof quickActionNames)[number];

export interface QuickActionContent {
  readonly kind: "catalog" | "nearby" | "topic";
  readonly id: string;
  readonly title: string;
}

export const quickActionContentKey = (content: QuickActionContent): string =>
  JSON.stringify([content.kind, content.id]);

// Presentation-only capabilities. No business service or content library.
export interface ContentQuickActionEnvironment {
  readonly likedIds: readonly string[];
  readonly favoriteIds: readonly string[];
  readonly onAction: (
    action: QuickActionName,
    content: QuickActionContent,
  ) => void;
}
