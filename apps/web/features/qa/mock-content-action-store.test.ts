import { describe, expect, it } from "vitest";

import {
  emptyMockUserLibraryState,
  formatQuickActionEvent,
  reduceMockUserLibrary,
} from "./mock-content-action-store";

import type { CatalogId, CatalogSummary } from "@moya/contracts";

const item = {
  aliases: [],
  id: "catalog-one" as CatalogId,
  kind: "inscription",
  title: "山门题刻",
} as CatalogSummary;

describe("QA mock content action store", () => {
  it("uses one reversible library state for likes and favorites", () => {
    const liked = reduceMockUserLibrary(emptyMockUserLibraryState, {
      item,
      type: "like",
    });
    const saved = reduceMockUserLibrary(liked, {
      item,
      type: "favorite",
    });
    expect(saved.likedItems).toEqual([item]);
    expect(saved.favoriteItems).toEqual([item]);

    const unliked = reduceMockUserLibrary(saved, { item, type: "unlike" });
    const unsaved = reduceMockUserLibrary(unliked, {
      item,
      type: "unfavorite",
    });
    expect(unsaved.likedItems).toEqual([]);
    expect(unsaved.favoriteItems).toEqual([]);
  });

  it("formats bounded QA-only gesture logs", () => {
    expect(formatQuickActionEvent({ contentId: item.id, type: "opened" })).toBe(
      "[quick-action] longpress open catalog-one",
    );
    expect(
      formatQuickActionEvent({
        action: "share",
        contentId: item.id,
        type: "committed",
      }),
    ).toBe("[quick-action] committed share catalog-one");
  });
});
