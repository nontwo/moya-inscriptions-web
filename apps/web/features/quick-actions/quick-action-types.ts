export const quickActionNames = ["like", "favorite", "share"] as const;
export type QuickActionName = (typeof quickActionNames)[number];

// Presentation-only capabilities. No business service or content library.
export interface ContentQuickActionEnvironment {
  readonly likedIds: readonly string[];
  readonly favoriteIds: readonly string[];
  readonly onAction: (action: QuickActionName, catalogId: string) => void;
}
