"use client";

import { useSyncExternalStore } from "react";

import { createExternalStore } from "../../upload-manager-store";

import type { CropSession } from "./crop-workspace";
import type { ExternalStore } from "../../upload-manager-store";
import type { EditorSessionStore } from "../editor/editor-session-state";
import type {
  MediaCrop,
  MediaEdit,
  MediaRotation,
  WorkDraftItem,
} from "@moya/contracts";

/**
 * The media section's own session state (§11 item 1: step changes and resize
 * never lose input). The phone steps mount only the current step and the
 * editor swaps the phone and desktop layouts at 896 px, so the open dialog
 * with its unfinished crop, a pending re-selection and the last notice live
 * here, next to the editor session store they belong to (a WeakMap entry, so
 * they end with that session). Nothing here is an edit of the work.
 */

export interface EditDialog {
  readonly type: "edit";
  readonly key: string;
}

export interface CoverDialog {
  readonly type: "cover";
  readonly key: string;
}

export type MediaDialog = EditDialog | CoverDialog;

/** Unfinished work in the edit dialog, valid while the item keeps `basis`. */
export interface EditDraft {
  readonly basis: MediaEdit;
  readonly rotation: MediaRotation;
  readonly stored: {
    readonly previewable: boolean;
    readonly session: CropSession;
  } | null;
}

/** Unfinished work in the cover dialog, valid while edit and crop are unchanged. */
export interface CoverDraft {
  readonly basisEdit: MediaEdit;
  readonly basisCrop: MediaCrop | null;
  readonly session: CropSession | null;
}

export interface Replacement {
  /** The missing item the re-selected files replace. */
  readonly target: string;
  readonly files: ReadonlySet<File>;
  /** Staging has shown the files; staging ending afterwards ends the replacement. */
  readonly staged: boolean;
  /** What the missing item was (its edit travels when the kind matches). */
  readonly previous: Pick<WorkDraftItem, "kind" | "qualityMode" | "edit">;
}

export interface MediaUiState {
  readonly dialog: MediaDialog | null;
  readonly replacement: Replacement | null;
  readonly notice: string | null;
  readonly selecting: boolean;
  readonly selectedKeys: readonly string[];
}

export interface MediaUiStore {
  readonly store: ExternalStore<MediaUiState>;
  get(): MediaUiState;
  subscribe(listener: () => void): () => void;
  openDialog(dialog: MediaDialog): void;
  closeDialog(): void;
  /**
   * The unfinished dialog work. Written on every change without notifying
   * (a drag must not re-render the strip); read when a dialog mounts.
   */
  draftFor(dialog: EditDialog): EditDraft | null;
  draftFor(dialog: CoverDialog): CoverDraft | null;
  saveDraft(dialog: EditDialog, draft: EditDraft): void;
  saveDraft(dialog: CoverDialog, draft: CoverDraft): void;
  setReplacement(replacement: Replacement | null): void;
  markReplacementStaged(): void;
  setNotice(notice: string | null): void;
  select(key: string): void;
  toggleSelection(key: string): void;
  clearSelection(): void;
  retainSelection(keys: readonly string[]): void;
}

const initialState: MediaUiState = {
  dialog: null,
  replacement: null,
  notice: null,
  selecting: false,
  selectedKeys: [],
};

const sameDialog = (left: MediaDialog | null, right: MediaDialog | null) =>
  left === right ||
  (left !== null &&
    right !== null &&
    left.type === right.type &&
    left.key === right.key);

export const createMediaUiStore = (): MediaUiStore => {
  const store = createExternalStore(initialState, (flush) => flush());
  let draft: {
    readonly dialog: MediaDialog;
    readonly value: EditDraft | CoverDraft;
  } | null = null;
  const draftFor = (dialog: MediaDialog) =>
    draft !== null && sameDialog(draft.dialog, dialog) ? draft.value : null;
  const saveDraft = (dialog: MediaDialog, value: EditDraft | CoverDraft) => {
    if (sameDialog(store.get().dialog, dialog)) draft = { dialog, value };
  };
  return {
    store,
    get: () => store.get(),
    subscribe: (listener) => store.subscribe(listener),
    select: (key) =>
      store.update((state) => ({
        ...state,
        selecting: true,
        selectedKeys: state.selectedKeys.includes(key)
          ? state.selectedKeys
          : [...state.selectedKeys, key],
      })),
    toggleSelection: (key) =>
      store.update((state) => ({
        ...state,
        selecting: true,
        selectedKeys: state.selectedKeys.includes(key)
          ? state.selectedKeys.filter((item) => item !== key)
          : [...state.selectedKeys, key],
      })),
    clearSelection: () =>
      store.update((state) => ({
        ...state,
        selecting: false,
        selectedKeys: [],
      })),
    retainSelection: (keys) =>
      store.update((state) => {
        const selectedKeys = state.selectedKeys.filter((key) =>
          keys.includes(key),
        );
        return selectedKeys.length === state.selectedKeys.length
          ? state
          : { ...state, selectedKeys };
      }),
    openDialog: (dialog) => {
      if (sameDialog(store.get().dialog, dialog)) return;
      draft = null;
      store.update((state) => ({ ...state, dialog }));
    },
    closeDialog: () => {
      draft = null;
      if (store.get().dialog === null) return;
      store.update((state) => ({ ...state, dialog: null }));
    },
    // The dialog type fixes the draft type (both are written together).
    draftFor: draftFor as MediaUiStore["draftFor"],
    saveDraft: saveDraft as MediaUiStore["saveDraft"],
    setReplacement: (replacement) =>
      store.update((state) =>
        state.replacement === replacement ? state : { ...state, replacement },
      ),
    markReplacementStaged: () =>
      store.update((state) =>
        state.replacement === null || state.replacement.staged
          ? state
          : {
              ...state,
              replacement: { ...state.replacement, staged: true },
            },
      ),
    setNotice: (notice) =>
      store.update((state) =>
        state.notice === notice ? state : { ...state, notice },
      ),
  };
};

const stores = new WeakMap<EditorSessionStore, MediaUiStore>();

/** The media UI state of one editor session (created on first use). */
export const mediaUiFor = (session: EditorSessionStore): MediaUiStore => {
  let store = stores.get(session);
  if (store === undefined) {
    store = createMediaUiStore();
    stores.set(session, store);
  }
  return store;
};

export const useMediaUiState = (store: MediaUiStore): MediaUiState =>
  useSyncExternalStore(store.subscribe, store.get, store.get);
