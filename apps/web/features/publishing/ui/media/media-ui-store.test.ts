import { describe, expect, it, vi } from "vitest";

import { createMediaUiStore, mediaUiFor } from "./media-ui-store";

import type { CoverDraft, EditDraft } from "./media-ui-store";
import type { EditorSessionStore } from "../editor/editor-session-state";

const editDraft: EditDraft = {
  basis: { rotation: 0, crop: null },
  rotation: 90,
  stored: null,
};

describe("media UI store", () => {
  it("belongs to one editor session", () => {
    const first = {} as EditorSessionStore;
    const second = {} as EditorSessionStore;
    expect(mediaUiFor(first)).toBe(mediaUiFor(first));
    expect(mediaUiFor(first)).not.toBe(mediaUiFor(second));
  });

  it("keeps dialog work for the open dialog only, without notifying", () => {
    const ui = createMediaUiStore();
    const listener = vi.fn();
    ui.subscribe(listener);
    const dialog = { type: "edit", key: "a" } as const;
    // No dialog open: nothing is kept.
    ui.saveDraft(dialog, editDraft);
    expect(ui.draftFor(dialog)).toBe(null);

    ui.openDialog(dialog);
    expect(listener).toHaveBeenCalledTimes(1);
    ui.saveDraft(dialog, editDraft);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(ui.draftFor(dialog)).toBe(editDraft);
    expect(ui.draftFor({ type: "edit", key: "b" })).toBe(null);
    expect(ui.draftFor({ type: "cover", key: "a" })).toBe(null);

    // Reopening the same dialog keeps the work; another dialog or closing drops it.
    ui.openDialog({ type: "edit", key: "a" });
    expect(ui.draftFor(dialog)).toBe(editDraft);
    const cover = { type: "cover", key: "a" } as const;
    ui.openDialog(cover);
    expect(ui.draftFor(dialog)).toBe(null);
    const coverDraft: CoverDraft = {
      basisEdit: { rotation: 0, crop: null },
      basisCrop: null,
      session: null,
    };
    ui.saveDraft(cover, coverDraft);
    ui.closeDialog();
    expect(ui.get().dialog).toBe(null);
    expect(ui.draftFor(cover)).toBe(null);
  });

  it("tracks a re-selection until it is staged and keeps the notice", () => {
    const ui = createMediaUiStore();
    const files = new Set([new File(["x"], "a.jpg")]);
    ui.setReplacement({
      target: "gone",
      files,
      staged: false,
      previous: {
        kind: "static",
        qualityMode: "original",
        edit: { rotation: 0, crop: null },
      },
    });
    ui.markReplacementStaged();
    expect(ui.get().replacement).toMatchObject({
      target: "gone",
      staged: true,
    });
    ui.setNotice("封面已移除，现在以第 1 项作为封面");
    ui.setReplacement(null);
    expect(ui.get()).toEqual({
      dialog: null,
      selecting: false,
      selectedKeys: [],
      replacement: null,
      notice: "封面已移除，现在以第 1 项作为封面",
    });
  });
});
