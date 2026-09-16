import { createExternalStore } from "./upload-manager-store";

import type { ExternalStore } from "./upload-manager-store";
import type {
  CreatePublishingDraftCommand,
  PublishingDeviceClass,
  PublishingDraft,
  PublishingDraftConflict,
  PublishingDraftSaveResult,
  SavePublishingDraftCommand,
  WorkDraftContent,
} from "@moya/contracts";

/**
 * Saved-draft autosave (D02, V03, V05, U06): the server draft is created on
 * the first real content only; edits are saved about 2 s after the last one;
 * saves never run in parallel (edits during a save coalesce into one
 * follow-up); every save is revision-conditional; a conflict stops autosave
 * and exposes both versions; completing a save only advances the saved
 * marker to the edit it carried and never replaces newer input. Failed saves
 * are not retried by themselves: a new edit, `retry()` or `saveNow()` is a
 * new explicit intent. A lost answer is reconciled by reading the draft.
 * Autosave belongs to one account: every write and read first checks that
 * this account is still the confirmed one, and an account change suspends
 * it (nothing is sent for any other account) until `resume()`.
 */

export interface DraftAutosavePort {
  createDraft(cmd: CreatePublishingDraftCommand): Promise<PublishingDraft>;
  saveDraft(
    draftId: string,
    cmd: SavePublishingDraftCommand,
  ): Promise<PublishingDraftSaveResult>;
  saveDraftNow(
    draftId: string,
    cmd: SavePublishingDraftCommand,
  ): Promise<PublishingDraftSaveResult>;
  draft(draftId: string): Promise<PublishingDraft>;
}

export type AutosaveStatus =
  /** Nothing to save: no content yet, or everything saved. */
  | "idle"
  /** Unsaved edits wait for the debounce. */
  | "pending"
  | "saving"
  | "saved"
  /** A concurrent edit exists: both versions are available; autosave waits for a choice. */
  | "conflict"
  /** The last save failed; newer input is kept; an explicit retry (or next edit) saves again. */
  | "error"
  /** A save's answer was lost; the draft is being read to learn the outcome. */
  | "reconciling";

export interface AutosaveError {
  readonly code: string | null;
  readonly message: string;
}

export interface AutosaveState {
  readonly status: AutosaveStatus;
  readonly draftId: string | null;
  /** The revision the next conditional save is based on. */
  readonly revision: number | null;
  /** Increases with every edit. */
  readonly editVersion: number;
  /** The edit version the account has confirmed. */
  readonly savedVersion: number;
  readonly conflict: PublishingDraftConflict | null;
  readonly error: AutosaveError | null;
  readonly lastSavedAt: number | null;
}

export interface AutosaveTimers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface DraftAutosaveOptions {
  readonly port: DraftAutosavePort;
  readonly requestId: () => string;
  readonly deviceClass: PublishingDeviceClass | null;
  /** An existing draft (reopened or edit draft). */
  readonly draft?: PublishingDraft | null;
  /** r6: production editors save only on an explicit action. */
  readonly manualOnly?: boolean;
  readonly onDraftSaved?: (draft: PublishingDraft) => void;
  readonly debounceMs?: number;
  readonly timers?: AutosaveTimers;
  readonly now?: () => number;
  readonly onDraftCreated?: (draft: PublishingDraft) => void;
  /** The account these drafts belong to (checked before every request). */
  readonly accountId?: string;
  /** The confirmed account right now. */
  readonly currentAccount?: () => string | null;
}

export interface DraftAutosave {
  readonly store: ExternalStore<AutosaveState>;
  /** Records the latest content; saves about `debounceMs` after the last edit. */
  edit(content: WorkDraftContent): void;
  /** Save now: an important snapshot of the latest content (creates the draft first if needed). */
  saveNow(): Promise<void>;
  /** Explicit retry after an error. */
  retry(): Promise<void>;
  /** The draft id, creating the draft from the current content when there is none. */
  ensureDraft(): Promise<string>;
  /**
   * Adopts a draft chosen outside autosave (conflict resolution, history
   * restore). `content` is what the editor now shows for it.
   */
  adoptDraft(draft: PublishingDraft, content: WorkDraftContent): void;
  /** Whether leaving now would lose input. */
  hasUnsavedChanges(): boolean;
  /** Stops sending (account change, leaving saved mode); edits are still recorded. */
  suspend(): void;
  /** Leaves a suspension when the account is confirmed again; pending edits wait for the debounce. */
  resume(): void;
  /** Resolves when no save is in flight (a suspended autosave starts no follow-up). */
  idle(): Promise<void>;
  /**
   * The draft id, replaying a create whose outcome is unknown (even while
   * suspended, for the same account only) so a draft that may exist on the
   * account can be found; null when no draft was ever requested.
   */
  resolveCreatedDraft(): Promise<string | null>;
  dispose(): void;
}

export const AUTOSAVE_DEBOUNCE_MS = 2000;

const unknownMessage = "保存结果尚未确认，请重试";
const failedMessage = "保存失败，请重试";

interface ErrorShape {
  readonly status?: unknown;
  readonly code?: unknown;
  readonly message?: unknown;
  readonly outcomeUnknown?: unknown;
}

const shape = (error: unknown): ErrorShape =>
  typeof error === "object" && error !== null ? (error as ErrorShape) : {};

const errorOf = (error: unknown, fallback: string): AutosaveError => {
  const e = shape(error);
  return {
    code: typeof e.code === "string" ? e.code : null,
    message: typeof e.message === "string" ? e.message : fallback,
  };
};

const outcomeUnknown = (error: unknown) => shape(error).outcomeUnknown === true;

const isAccountError = (error: unknown) => shape(error).status === 401;

const isEmptyText = (value: string) => value.trim() === "";

/** Whitespace-only text is empty; any item (pending or uploaded) is content. */
export const isEmptyDraftContent = (content: WorkDraftContent): boolean =>
  isEmptyText(content.title) &&
  isEmptyText(content.body) &&
  content.items.length === 0;

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object" && value !== null)
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [
          key,
          canonical((value as Record<string, unknown>)[key]),
        ]),
    );
  return value;
};

/** Structural equality independent of key order. */
export const sameDraftContent = (
  left: WorkDraftContent,
  right: WorkDraftContent,
) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));

type SaveKind = "autosave" | "snapshot";

const defaultTimers: AutosaveTimers = {
  setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
  clearTimeout: (handle) =>
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export const createDraftAutosave = (
  options: DraftAutosaveOptions,
): DraftAutosave => {
  const timers = options.timers ?? defaultTimers;
  const now = options.now ?? Date.now;
  const debounceMs = options.debounceMs ?? AUTOSAVE_DEBOUNCE_MS;
  const initial = options.draft ?? null;
  const store = createExternalStore<AutosaveState>({
    status: initial === null ? "idle" : initial.conflict ? "conflict" : "saved",
    draftId: initial?.id ?? null,
    revision: initial?.revision ?? null,
    editVersion: 0,
    savedVersion: 0,
    conflict: initial?.conflict ?? null,
    error: null,
    lastSavedAt: null,
  });
  let latest: WorkDraftContent | null = initial?.content ?? null;
  let timer: unknown = null;
  let inFlight: Promise<void> | null = null;
  let queued: SaveKind | null = null;
  /**
   * A create whose outcome is unknown: replayed exactly (same identity and
   * content, which the Backend's idempotency fingerprint requires).
   */
  let pendingCreate: {
    readonly command: CreatePublishingDraftCommand;
    readonly version: number;
  } | null = null;
  let lastCreateError: unknown = null;
  /** A lost save interrupted by an account change: reconciled before the next write. */
  let unreconciled: {
    draftId: string;
    content: WorkDraftContent;
    version: number;
    base: number;
  } | null = null;
  let suspended = false;
  let disposed = false;

  /** Whether requests may be sent for this autosave's account now. */
  const accountConfirmed = (): boolean => {
    if (suspended) return false;
    if (
      options.accountId !== undefined &&
      options.currentAccount !== undefined &&
      options.currentAccount() !== options.accountId
    ) {
      suspended = true;
      clearTimer();
      return false;
    }
    return true;
  };

  const state = () => store.get();
  const set = (change: Partial<AutosaveState>) =>
    store.set({ ...state(), ...change });

  const clearTimer = () => {
    if (timer !== null) {
      timers.clearTimeout(timer);
      timer = null;
    }
  };

  const settledStatus = (): AutosaveStatus =>
    state().editVersion > state().savedVersion ? "pending" : "saved";

  const schedule = () => {
    clearTimer();
    if (options.manualOnly) return;
    if (disposed || suspended || state().status === "conflict") return;
    timer = timers.setTimeout(() => {
      timer = null;
      void flush("autosave");
    }, debounceMs);
  };

  const markSaved = (draft: PublishingDraft, version: number) => {
    options.onDraftSaved?.(draft);
    const current = state();
    set({
      draftId: draft.id,
      revision: draft.revision,
      savedVersion: Math.max(current.savedVersion, version),
      error: null,
      conflict: null,
      lastSavedAt: now(),
    });
    set({ status: settledStatus() });
    // Newer edits keep their own debounce or queued follow-up; otherwise wait again.
    if (state().status === "pending" && timer === null && queued === null)
      schedule();
  };

  const create = async (
    content: WorkDraftContent,
    version: number,
  ): Promise<PublishingDraft | null> => {
    const frozen = (pendingCreate ??= {
      command: {
        requestId: options.requestId(),
        content,
        deviceClass: options.deviceClass,
      },
      version,
    });
    try {
      const draft = await options.port.createDraft(frozen.command);
      if (disposed) return null;
      pendingCreate = null;
      lastCreateError = null;
      options.onDraftCreated?.(draft);
      if (draft.conflict) {
        options.onDraftSaved?.(draft);
        set({
          draftId: draft.id,
          revision: draft.revision,
          status: "conflict",
          conflict: draft.conflict,
          error: null,
        });
        return draft;
      }
      // Newer edits than the frozen command stay pending and are saved next.
      markSaved(
        draft,
        sameDraftContent(draft.content, frozen.command.content)
          ? frozen.version
          : state().savedVersion,
      );
      return draft;
    } catch (error) {
      if (disposed) return null;
      lastCreateError = error;
      // An unknown outcome keeps the frozen command for the explicit retry.
      if (!outcomeUnknown(error)) pendingCreate = null;
      if (isAccountError(error) && !accountConfirmed()) {
        // The account changed: the create waits (same identity when unknown) for resume().
        set({ status: "pending", error: null });
        return null;
      }
      set({
        status: "error",
        error: errorOf(
          error,
          outcomeUnknown(error) ? unknownMessage : failedMessage,
        ),
      });
      return null;
    }
  };

  const reconcile = async (
    draftId: string,
    content: WorkDraftContent,
    version: number,
    base: number,
  ) => {
    if (!accountConfirmed()) {
      // Never read another account's draft: reconcile once this account is back.
      unreconciled = { draftId, content, version, base };
      set({ status: "error", error: { code: null, message: unknownMessage } });
      return;
    }
    unreconciled = null;
    set({ status: "reconciling" });
    try {
      const draft = await options.port.draft(draftId);
      if (disposed) return;
      if (draft.revision !== base && sameDraftContent(draft.content, content)) {
        markSaved(draft, version);
        return;
      }
      set({
        status: draft.conflict ? "conflict" : "error",
        conflict: draft.conflict,
        error: draft.conflict ? null : { code: null, message: failedMessage },
      });
    } catch (error) {
      if (disposed) return;
      set({ status: "error", error: errorOf(error, unknownMessage) });
    }
  };

  const save = async (kind: SaveKind): Promise<void> => {
    if (!accountConfirmed()) return;
    if (unreconciled !== null) {
      // Learn the outcome of the save the account change interrupted first.
      const lost = unreconciled;
      await reconcile(lost.draftId, lost.content, lost.version, lost.base);
      const status = state().status;
      if (disposed || (status !== "saved" && status !== "pending")) return;
    }
    const content = latest;
    const current = state();
    if (content === null || current.status === "conflict") return;
    const version = current.editVersion;
    if (current.draftId === null) {
      if (isEmptyDraftContent(content)) {
        // No empty drafts: nothing is created until there is real content.
        set({ status: "idle", savedVersion: version });
        return;
      }
      set({ status: "saving", error: null });
      const draft = await create(content, version);
      if (draft === null || kind !== "snapshot") return;
    } else if (kind === "autosave" && version <= current.savedVersion) {
      set({ status: "saved" });
      return;
    } else {
      set({ status: "saving", error: null });
    }
    const draftId = state().draftId!;
    const base = state().revision!;
    const command: SavePublishingDraftCommand = {
      baseRevision: base,
      content: latest!,
      deviceClass: options.deviceClass,
    };
    const sentVersion = state().editVersion;
    let result: PublishingDraftSaveResult;
    try {
      result =
        kind === "snapshot"
          ? await options.port.saveDraftNow(draftId, command)
          : await options.port.saveDraft(draftId, command);
    } catch (error) {
      if (disposed) return;
      if (outcomeUnknown(error)) {
        await reconcile(draftId, command.content, sentVersion, base);
        return;
      }
      if (isAccountError(error) && !accountConfirmed()) {
        // Refused for an account change before it applied: saved again after resume().
        set({ status: "pending", error: null });
        return;
      }
      set({ status: "error", error: errorOf(error, failedMessage) });
      return;
    }
    if (disposed) return;
    if (result.status === "conflict") {
      clearTimer();
      options.onDraftSaved?.(result.draft);
      set({
        status: "conflict",
        revision: result.draft.revision,
        conflict: result.conflict,
        error: null,
      });
      return;
    }
    markSaved(result.draft, sentVersion);
  };

  const flush = (kind: SaveKind): Promise<void> => {
    if (disposed) return Promise.resolve();
    clearTimer();
    if (inFlight !== null) {
      // Coalesce: one follow-up save with the latest content after this one.
      queued =
        queued === "snapshot" || kind === "snapshot" ? "snapshot" : "autosave";
      return inFlight.then(() => undefined);
    }
    const run = save(kind).finally(() => {
      inFlight = null;
      const next = queued;
      queued = null;
      if (next !== null && !disposed && !suspended) {
        const status = state().status;
        if (
          next === "snapshot" ||
          (status !== "error" &&
            status !== "conflict" &&
            status !== "reconciling")
        )
          void flush(next);
      }
    });
    inFlight = run;
    return run;
  };

  return {
    store,
    edit(content) {
      if (disposed) return;
      if (
        options.manualOnly &&
        latest !== null &&
        sameDraftContent(latest, content)
      )
        return;
      latest = content;
      const current = state();
      const editVersion = current.editVersion + 1;
      if (
        options.manualOnly &&
        current.draftId === null &&
        pendingCreate === null &&
        isEmptyDraftContent(content)
      ) {
        set({ editVersion, savedVersion: editVersion, status: "idle" });
        return;
      }
      if (current.status === "conflict") {
        // Newer input is kept while the author chooses; nothing saves meanwhile.
        set({ editVersion });
        return;
      }
      set({
        editVersion,
        status:
          current.status === "saving" || current.status === "reconciling"
            ? current.status
            : "pending",
      });
      // The debounce restarts with every edit; a save still in flight turns
      // the timer's save into its single coalesced follow-up.
      schedule();
    },
    saveNow: () => flush(options.manualOnly ? "autosave" : "snapshot"),
    retry: () => {
      const current = state();
      if (current.status !== "error") return Promise.resolve();
      return flush("autosave");
    },
    async ensureDraft() {
      const existing = state().draftId;
      if (existing !== null) return existing;
      if (latest === null || isEmptyDraftContent(latest))
        throw new Error("A draft is created only for real content");
      if (inFlight !== null) await inFlight;
      if (state().draftId === null) await flush("autosave");
      const draftId = state().draftId;
      if (draftId === null)
        // The client's own refusal (e.g. draft_limit) keeps its product text.
        throw lastCreateError ?? new Error("The draft could not be created");
      return draftId;
    },
    adoptDraft(draft, content) {
      options.onDraftSaved?.(draft);
      clearTimer();
      latest = content;
      const current = state();
      set({
        draftId: draft.id,
        revision: draft.revision,
        conflict: draft.conflict,
        error: null,
        status: draft.conflict ? "conflict" : "saved",
        savedVersion: sameDraftContent(draft.content, content)
          ? current.editVersion
          : current.savedVersion,
      });
      if (!draft.conflict && state().editVersion > state().savedVersion) {
        set({ status: "pending" });
        schedule();
      }
    },
    hasUnsavedChanges() {
      const current = state();
      return (
        current.editVersion > current.savedVersion ||
        current.status === "saving" ||
        current.status === "reconciling" ||
        current.status === "error" ||
        current.status === "conflict"
      );
    },
    suspend() {
      suspended = true;
      clearTimer();
    },
    resume() {
      if (disposed) return;
      suspended = false;
      if (!accountConfirmed()) return;
      if (unreconciled !== null) {
        if (options.manualOnly) return;
        void flush("autosave");
        return;
      }
      const current = state();
      if (
        current.status !== "conflict" &&
        current.status !== "error" &&
        current.editVersion > current.savedVersion
      ) {
        set({ status: "pending" });
        schedule();
      }
    },
    idle: async () => {
      while (inFlight !== null) await inFlight.catch(() => undefined);
    },
    async resolveCreatedDraft() {
      const existing = state().draftId;
      if (existing !== null || pendingCreate === null) return existing;
      if (
        options.accountId !== undefined &&
        options.currentAccount !== undefined &&
        options.currentAccount() !== options.accountId
      )
        throw new Error("The account changed");
      const draft = await options.port.createDraft(pendingCreate.command);
      const version = pendingCreate.version;
      const created = pendingCreate.command.content;
      pendingCreate = null;
      lastCreateError = null;
      if (!disposed) {
        options.onDraftCreated?.(draft);
        markSaved(
          draft,
          sameDraftContent(draft.content, created)
            ? version
            : state().savedVersion,
        );
      }
      return draft.id;
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
};
