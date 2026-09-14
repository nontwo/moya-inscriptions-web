import type {
  EditorSessionStore,
  OpenedEditDraft,
} from "./editor-session-state";
import type { EditorTarget } from "../../../product-shell/product-history";
import type { useUploadSession } from "../../publishing-provider";
import type {
  EditableWork,
  PublishingDeviceClass,
  PublishingDraft,
  PublishingDraftDeletionResult,
  PublishingOpenedEditDraft,
  PublishingDraftSaveResult,
  SavePublishingDraftCommand,
  WorkDraftContent,
} from "@moya/contracts";

/**
 * Opens the runtime session behind an editor store, once per store:
 * - a new work starts in saved mode without any server record (D02);
 * - a draft is read and reopened with its media on this browser;
 * - an existing work is read as its editable revision and its private edit
 *   draft is opened (saved mode); a new edit draft inherits the work's
 *   visibility (P03). When no draft can be opened because the draft limit is
 *   reached, the edit continues without saving and says so.
 *
 * An edit draft this session created and never changed is removed again
 * when the author leaves (D02). Only the account's own answer says whether
 * this request inserted the draft (`created`); a draft that already existed
 * belongs to another device or an earlier visit and is always kept. The
 * removal is conditional on the revision it was opened with, so a draft
 * another device has saved to meanwhile is refused as `draft_changed` by the
 * account and kept. Reopening the same work waits for that removal first.
 */

export type UploadSessionApi = ReturnType<typeof useUploadSession>;

export interface EditorLoaderClient {
  draft(draftId: string): Promise<PublishingDraft>;
  editableWork(workId: string): Promise<EditableWork>;
  openWorkEditDraft(
    workId: string,
    cmd: {
      readonly requestId: string;
      readonly deviceClass: PublishingDeviceClass | null;
    },
  ): Promise<PublishingOpenedEditDraft>;
  deleteDraft(
    draftId: string,
    cmd: { readonly requestId: string; readonly expectedRevision?: number },
  ): Promise<PublishingDraftDeletionResult>;
  saveDraft(
    draftId: string,
    cmd: SavePublishingDraftCommand,
  ): Promise<PublishingDraftSaveResult>;
}

export interface EditorLoaderDeps {
  readonly client: EditorLoaderClient;
  readonly upload: () => UploadSessionApi;
  /** Whether the store is still the account's editor session. */
  readonly alive: (store: EditorSessionStore) => boolean;
  readonly requestId: () => string;
  readonly deviceClass: () => PublishingDeviceClass | null;
  /** The confirmed account right now (changes before React re-renders). */
  readonly currentAccount: () => string | null;
}

const loads = new WeakMap<EditorSessionStore, Promise<void>>();
const sent = new WeakMap<EditorSessionStore, number>();
/** Removals of unchanged edit drafts in flight, by account and work. */
const removals = new Map<string, Promise<void>>();

const removalKey = (accountId: string, workId: string) =>
  `${accountId} ${workId}`;

/** Resolves once no removal of this work's edit draft is in flight. */
export const removalSettled = (
  accountId: string,
  workId: string,
): Promise<void> =>
  removals.get(removalKey(accountId, workId)) ?? Promise.resolve();

/**
 * Removes an edit draft this session opened, only while the account still
 * holds it at the revision it was opened with: the deletion names that
 * revision, so a save from this or another device in between is refused
 * (`draft_changed`) and the draft is kept without telling anyone. A draft
 * already gone or a failed request keeps nothing else either; this browser's
 * local copies are cleared only after a confirmed deletion.
 *
 * The account compares the draft revision only. An edit draft is opened at
 * its first revision, so no save on an older base (a conflict copy) can
 * exist for it without a later revision.
 */
export const removeUnchangedEditDraft = (
  accountId: string,
  opened: OpenedEditDraft,
  deps: Pick<EditorLoaderDeps, "client" | "requestId" | "currentAccount"> & {
    readonly forgetLocalCopies?: (draftId: string) => Promise<void>;
  },
): Promise<void> => {
  const key = removalKey(accountId, opened.workId);
  const previous = removals.get(key) ?? Promise.resolve();
  const run: Promise<void> = previous
    .then(async () => {
      if (deps.currentAccount() !== accountId) return;
      await deps.client.deleteDraft(opened.id, {
        requestId: deps.requestId(),
        expectedRevision: opened.revision,
      });
      await deps.forgetLocalCopies?.(opened.id);
    })
    .catch(() => undefined)
    .finally(() => {
      if (removals.get(key) === run) removals.delete(key);
    });
  removals.set(key, run);
  return run;
};

const openedFrom = (draft: PublishingDraft): OpenedEditDraft => ({
  id: draft.id,
  workId: draft.workId ?? "",
  revision: draft.revision,
});

/** The edit version the runtime has already received for this store. */
export const sentEditVersion = (store: EditorSessionStore): number =>
  sent.get(store) ?? 0;

export const markEditVersionSent = (
  store: EditorSessionStore,
  version: number,
): void => {
  sent.set(store, version);
};

interface ErrorShape {
  readonly status?: unknown;
  readonly code?: unknown;
  readonly message?: unknown;
}

const shape = (error: unknown): ErrorShape =>
  typeof error === "object" && error !== null ? (error as ErrorShape) : {};

const unavailableText = (
  error: unknown,
  missing: string,
  fallback: string,
): string => {
  const e = shape(error);
  if (e.status === 404 || e.code === "work_unavailable") return missing;
  return typeof e.message === "string" && typeof e.status === "number"
    ? e.message
    : fallback;
};

export const openEditorSession = (
  store: EditorSessionStore,
  target: EditorTarget,
  deps: EditorLoaderDeps,
): Promise<void> => {
  const existing = loads.get(store);
  if (existing) return existing;
  const run = load(store, target, deps);
  loads.set(store, run);
  return run;
};

/** After an unavailable result: the author's explicit retry. */
export const retryEditorSession = (
  store: EditorSessionStore,
  target: EditorTarget,
  deps: EditorLoaderDeps,
): Promise<void> => {
  loads.delete(store);
  store.setLoading();
  return openEditorSession(store, target, deps);
};

const adoptLoaded = (
  store: EditorSessionStore,
  content: WorkDraftContent,
  items: EditableWork["mediaItems"],
) => {
  store.adoptContent(content, items);
  markEditVersionSent(store, store.get().editVersion);
};

const load = async (
  store: EditorSessionStore,
  target: EditorTarget,
  deps: EditorLoaderDeps,
): Promise<void> => {
  if (target.type === "new") {
    deps.upload().startSession({ target, saveMode: "saved" });
    markEditVersionSent(store, store.get().editVersion);
    store.setLoaded({ kind: "new", workId: null });
    return;
  }

  if (target.type === "draft") {
    let draft: PublishingDraft;
    try {
      draft = await deps.client.draft(target.id);
    } catch (error) {
      if (deps.alive(store))
        store.setUnavailable(
          unavailableText(
            error,
            "这份草稿已不可用",
            "暂时无法打开草稿，请重试",
          ),
        );
      return;
    }
    if (!deps.alive(store)) return;
    deps.upload().startSession({ target, saveMode: "saved", draft });
    adoptLoaded(store, draft.content, draft.mediaItems);
    store.setLoaded({ kind: draft.kind, workId: draft.workId });
    await deps.upload().restoreDraftMedia(draft);
    return;
  }

  // A removal of this work's unchanged edit draft finishes before reopening,
  // so the draft opened next is never the one being removed.
  await removalSettled(store.accountId, target.id);
  if (!deps.alive(store)) return;

  let editable: EditableWork;
  try {
    editable = await deps.client.editableWork(target.id);
  } catch (error) {
    if (deps.alive(store))
      store.setUnavailable(
        unavailableText(
          error,
          "这件作品已不可编辑",
          "暂时无法打开作品，请重试",
        ),
      );
    return;
  }
  if (!deps.alive(store)) return;

  let opened: PublishingOpenedEditDraft;
  try {
    opened = await deps.client.openWorkEditDraft(target.id, {
      requestId: deps.requestId(),
      deviceClass: deps.deviceClass(),
    });
  } catch (error) {
    if (!deps.alive(store)) return;
    if (shape(error).code !== "draft_limit") {
      store.setUnavailable(
        unavailableText(
          error,
          "这件作品已不可编辑",
          "暂时无法打开作品，请重试",
        ),
      );
      return;
    }
    // Editing stays possible; only saving a draft is not. The work's items
    // count against the item limit from the start.
    const content: WorkDraftContent = {
      ...editable.content,
      visibility: editable.visibility,
    };
    deps.upload().startSession({
      target,
      saveMode: "unsaved",
      workId: editable.workId,
      baseRevisionId: editable.revisionId,
      content,
    });
    adoptLoaded(store, content, editable.mediaItems);
    store.setLoaded({ kind: "edit", workId: editable.workId });
    store.setNotice("草稿数量已达上限，本次编辑不会保存草稿");
    return;
  }
  // Only the account itself can say whether this request inserted the draft:
  // another device (or an earlier request of this one) may have opened the
  // same draft between the editable read and this call. A draft this editor
  // did not create is never removed on leaving.
  const { draft, created } = opened;
  if (!deps.alive(store)) {
    // Left while the draft was being opened: nothing was changed in it.
    if (created)
      void removeUnchangedEditDraft(store.accountId, openedFrom(draft), deps);
    return;
  }

  deps.upload().startSession({
    target,
    saveMode: "saved",
    draft,
    workId: editable.workId,
    baseRevisionId: draft.baseRevisionId,
  });
  // A fresh edit draft inherits the work's current visibility (P03). It is
  // not an author change: it reaches the draft with the first real edit and
  // is part of what 保存更新 submits either way.
  adoptLoaded(
    store,
    created
      ? { ...draft.content, visibility: editable.visibility }
      : draft.content,
    [...editable.mediaItems, ...draft.mediaItems],
  );
  store.setLoaded({
    kind: "edit",
    workId: editable.workId,
    openedEditDraft: created ? openedFrom(draft) : null,
  });
  await deps.upload().restoreDraftMedia(draft);
};

export type EnableEditDraftsResult =
  | "enabled"
  /** Uploads already run under the temporary session. */
  | "uploads_started"
  /** The account's edit draft of this work holds two versions to choose from. */
  | "draft_in_conflict"
  | "ended";

/**
 * Starts saving an edit that ran without a draft: the private edit draft is
 * opened and continues from the content on screen. Only possible before the
 * temporary session holds any upload.
 *
 * The account may already hold an edit draft of this work with saved
 * changes (another device, an earlier visit). The content on screen never
 * overwrites it silently: it is saved on an earlier base, so the account
 * keeps both versions and the author chooses between them (V03).
 */
export const enableEditDrafts = async (
  store: EditorSessionStore,
  deps: EditorLoaderDeps,
): Promise<EnableEditDraftsResult> => {
  const startable = (api: UploadSessionApi) =>
    api.session?.saveMode === "unsaved" &&
    api.session.sessionId === null &&
    (api.uploads?.items.length ?? 0) === 0;
  const state = store.get();
  if (state.workId === null) return "ended";
  if (!startable(deps.upload())) return "uploads_started";
  await removalSettled(store.accountId, state.workId);
  const { draft } = await deps.client.openWorkEditDraft(state.workId, {
    requestId: deps.requestId(),
    deviceClass: deps.deviceClass(),
  });
  if (!deps.alive(store)) return "ended";
  if (!startable(deps.upload())) return "uploads_started";
  if (draft.conflict !== null) return "draft_in_conflict";
  let opened = draft;
  if (draft.revision > 1) {
    const result = await deps.client.saveDraft(draft.id, {
      baseRevision: draft.revision - 1,
      content: store.content(),
      deviceClass: deps.deviceClass(),
    });
    if (!deps.alive(store)) return "ended";
    opened = result.draft;
  }
  const current = deps.upload();
  if (!startable(current)) return "uploads_started";
  store.setRestarting(true);
  try {
    await current.closeSession({ discard: true });
    const next = deps.upload();
    next.startSession({
      target: state.target,
      saveMode: "saved",
      draft: opened,
      workId: state.workId,
      baseRevisionId: opened.baseRevisionId,
    });
    store.mergeServerItems(opened.mediaItems);
    // An unchanged edit draft takes the content on screen as its next saved
    // version; a draft now holding two versions waits for the author's
    // choice and keeps the screen content meanwhile.
    next.edit(store.content());
    markEditVersionSent(store, store.get().editVersion);
    await next.restoreDraftMedia(opened);
  } finally {
    store.setRestarting(false);
  }
  return "enabled";
};
