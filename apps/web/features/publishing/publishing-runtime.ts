import { createDraftAutosave, sameDraftContent } from "./draft-autosave";
import {
  addToStagingBatch,
  attachStagedCounterpart,
  confirmStaging,
  countStaging,
  removeStagedEntry,
  resolveStagedAmbiguity,
  setBatchOriginal,
  keepStagedStillAsPhoto,
} from "./import-grouping";
import { createSubmissionController } from "./submission-reconcile";
import { UploadManager, summarizeUploads } from "./upload-manager";
import { createExternalStore } from "./upload-manager-store";

import type { DraftAutosave, DraftAutosavePort } from "./draft-autosave";
import type { BlobHasher } from "./hashing";
import type {
  ConfirmStagingResult,
  FileOrigin,
  IdentifiedFile,
  StagingBatch,
  StagingChoiceError,
  StagingCount,
} from "./import-grouping";
import type { LocalRecoveryStore, RestorePlanEntry } from "./local-recovery";
import type { PreprocessPort } from "./preprocess/worker-client";
import type {
  SubmissionController,
  SubmissionPort,
  SubmissionState,
} from "./submission-reconcile";
import type {
  UploadClientPort,
  UploadManagerOptions,
  UploadTimers,
} from "./upload-manager";
import type { ExternalStore } from "./upload-manager-store";
import type { TransferPort } from "./uppy-transfer";
import type { EditorTarget } from "../product-shell/product-history";
import type {
  CreatePublishingSessionCommand,
  PublishingDeviceClass,
  PublishingDraft,
  PublishingDraftDeletionResult,
  PublishingHolder,
  PublishingLimits,
  PublishingSession,
  WorkDraftContent,
  WorkDraftItem,
  WorkSubmissionContent,
} from "@moya/contracts";

/**
 * Framework-free publishing runtime behind the provider: one upload manager
 * per account (an account change pauses every other account's manager and
 * suspends its autosave and heartbeat, and nothing of one account is ever
 * sent under another), one active editor session per account, the selection
 * staging batch, draft autosave (saved mode) or a minimal temporary session
 * (no-save mode), and the explicit submission controller. Item identities
 * assigned by registration flow into the saved content by themselves.
 */

export interface PublishingClientPort
  extends UploadClientPort, DraftAutosavePort, SubmissionPort {
  limits(): Promise<PublishingLimits>;
  createSession(
    cmd: CreatePublishingSessionCommand,
  ): Promise<PublishingSession>;
  heartbeatSession(sessionId: string): Promise<PublishingSession>;
  discardSession(
    sessionId: string,
    cmd: { requestId: string },
  ): Promise<{ discarded: true }>;
  deleteDraft(
    draftId: string,
    cmd: { requestId: string },
  ): Promise<PublishingDraftDeletionResult>;
}

export interface PublishingServices {
  readonly client: PublishingClientPort;
  readonly currentAccount: () => string | null;
  readonly requestId: () => string;
  readonly createTransfer: (concurrency: number) => TransferPort;
  readonly createPreprocess: () => PreprocessPort;
  readonly createHasher: () => BlobHasher | null;
  readonly createRecovery: () => LocalRecoveryStore | null;
  readonly identifyFiles: (files: readonly File[]) => Promise<IdentifiedFile[]>;
  readonly preprocessConcurrency: () => number;
  readonly transferConcurrency: number;
  readonly deviceClass: () => PublishingDeviceClass;
  readonly timers?: UploadTimers;
  /** Private metadata extraction (exifr in browsers). */
  readonly metadata?: UploadManagerOptions["metadata"];
}

export type SaveMode = "saved" | "unsaved";

export interface EditorSessionView {
  readonly target: EditorTarget;
  readonly saveMode: SaveMode;
  readonly draftId: string | null;
  readonly sessionId: string | null;
  readonly workId: string | null;
  readonly baseRevisionId: string | null;
  /** The editor content is not empty (text or items): leaving a no-save session would lose it. */
  readonly hasContent: boolean;
}

export interface StagingView {
  readonly batch: StagingBatch;
  readonly count: StagingCount;
  /** Files still being identified. */
  readonly identifying: number;
}

export interface RuntimeSnapshot {
  readonly accountId: string | null;
  readonly session: EditorSessionView | null;
  readonly staging: StagingView | null;
  readonly limits: PublishingLimits | null;
}

/** Heartbeat for a temporary no-save session while its editor is open. */
export const SESSION_HEARTBEAT_MS = 10 * 60 * 1000;

const DEFAULT_MAX_ITEMS = 50;

interface AccountRuntime {
  readonly manager: UploadManager;
  session: SessionRecord | null;
  /** The confirmed submission of the session that just ended (its receipt stays readable). */
  completed: SubmissionController | null;
  staging: StagingBatch | null;
  identifying: number;
  limits: PublishingLimits | null;
}

interface SessionRecord {
  view: EditorSessionView;
  autosave: DraftAutosave | null;
  submission: SubmissionController;
  latest: WorkDraftContent | null;
  sessionRequestId: string | null;
  sessionTask: Promise<string> | null;
  heartbeat: unknown;
  closed: boolean;
  /** Stops following the submission store. */
  unsubscribe: () => void;
}

const liveItemCount = (manager: UploadManager) =>
  manager
    .getSnapshot()
    .items.filter(
      (item) => item.phase !== "cancelled" && item.phase !== "cleanup",
    ).length;

const hasContent = (content: WorkDraftContent | null): boolean =>
  content !== null &&
  (content.title.trim() !== "" ||
    content.body.trim() !== "" ||
    content.items.length > 0);

type ManagedItem = ReturnType<UploadManager["draftItems"]>[number];

/**
 * Brings item identities (and quality after an explicit Original choice) from
 * the manager into content items with the same key; with `append`, items the
 * content does not list yet are added as pending entries.
 */
const withManagedItems = <
  C extends { readonly items: readonly WorkDraftItem[] },
>(
  content: C,
  managed: readonly ManagedItem[],
  append: boolean,
): C => {
  const byKey = new Map(managed.map((item) => [item.key, item]));
  let changed = false;
  const items = content.items.map((item): WorkDraftItem => {
    const current = byKey.get(item.key);
    if (
      !current ||
      (current.itemId === item.itemId &&
        current.qualityMode === item.qualityMode)
    )
      return item;
    changed = true;
    const base = {
      key: item.key,
      kind: item.kind,
      qualityMode: current.qualityMode,
      edit: item.edit,
    };
    return current.itemId === null
      ? {
          ...base,
          itemId: null,
          pendingLabel: item.kind === "live" ? "live" : "photo",
        }
      : { ...base, itemId: current.itemId };
  });
  const known = new Set(content.items.map((item) => item.key));
  const missing = append
    ? managed
        .filter((item) => !known.has(item.key))
        .map((item): WorkDraftItem => ({
          ...item,
          edit: { rotation: 0, crop: null },
        }))
    : [];
  return !changed && missing.length === 0
    ? content
    : { ...content, items: [...items, ...missing] };
};

const emptyContent = (): WorkDraftContent => ({
  title: "",
  body: "",
  authorship: { kind: "original" },
  visibility: "public",
  items: [],
  coverKey: null,
  coverCrop: null,
});

export class PublishingRuntime {
  readonly store: ExternalStore<RuntimeSnapshot>;
  private readonly services: PublishingServices;
  private readonly accounts = new Map<string, AccountRuntime>();
  private accountId: string | null = null;
  private readonly timers: UploadTimers;

  constructor(services: PublishingServices) {
    this.services = services;
    this.timers = services.timers ?? {
      setTimeout: (callback, ms) => globalThis.setTimeout(callback, ms),
      clearTimeout: (handle) =>
        globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>),
    };
    this.store = createExternalStore<RuntimeSnapshot>(this.snapshot());
  }

  // -- accounts ------------------------------------------------------------

  /**
   * The confirmed viewer. Every other account's manager and session pauses;
   * nothing of theirs is visible or resumed while another account is active.
   */
  setAccount(accountId: string | null): void {
    if (accountId === this.accountId) return;
    for (const [id, account] of this.accounts)
      if (id !== accountId) {
        account.manager.pause("account");
        // A pending draft save of this account must never be sent under another one.
        account.session?.autosave?.suspend();
        this.stopHeartbeat(account.session);
      }
    this.accountId = accountId;
    const returning = this.accounts.get(accountId ?? "");
    if (returning) {
      returning.manager.resumeIfIdle();
      const session = returning.session;
      if (session && !session.closed) {
        session.autosave?.resume();
        if (session.view.sessionId !== null)
          this.startHeartbeat(returning, session);
      }
    }
    if (accountId !== null && !this.accounts.has(accountId)) {
      const manager = new UploadManager({
        accountId,
        client: this.services.client,
        transfer: this.services.createTransfer(
          this.services.transferConcurrency,
        ),
        preprocess: this.services.createPreprocess(),
        currentAccount: this.services.currentAccount,
        requestId: this.services.requestId,
        attemptId: this.services.requestId,
        preprocessConcurrency: this.services.preprocessConcurrency(),
        transferConcurrency: this.services.transferConcurrency,
        hasher: this.services.createHasher(),
        recovery: this.services.createRecovery(),
        ...(this.services.timers ? { timers: this.services.timers } : {}),
        ...(this.services.metadata ? { metadata: this.services.metadata } : {}),
      });
      const account: AccountRuntime = {
        manager,
        session: null,
        completed: null,
        staging: null,
        identifying: 0,
        limits: null,
      };
      this.accounts.set(accountId, account);
      // Staging counts depend on the manager's item count; progress alone does not republish.
      let itemCount = 0;
      let identities = "";
      manager.store.subscribe(() => {
        const count = liveItemCount(manager);
        if (count !== itemCount && this.accountId === accountId) {
          itemCount = count;
          this.publish();
        }
        // Registration assigns item ids: the saved content follows without the editor.
        const next = manager
          .draftItems()
          .map((item) => `${item.key}:${item.itemId}:${item.qualityMode}`)
          .join("|");
        if (next !== identities) {
          identities = next;
          this.syncManagedItems(account);
        }
      });
      void this.loadLimits(accountId);
    }
    this.publish();
  }

  /** The current account's manager, or null for a guest. */
  manager(): UploadManager | null {
    return this.current()?.manager ?? null;
  }

  /** The session's submission, or the confirmed one of the session that just completed. */
  submission(): SubmissionController | null {
    const account = this.current();
    return account?.session?.submission ?? account?.completed ?? null;
  }

  autosave(): DraftAutosave | null {
    return this.current()?.session?.autosave ?? null;
  }

  // -- editor session ------------------------------------------------------

  /**
   * Opens the one editor session of this account. A saved draft (reopened or
   * an edit draft) is passed in; a new work starts without any server record.
   */
  startSession(options: {
    readonly target: EditorTarget;
    readonly saveMode: SaveMode;
    readonly draft?: PublishingDraft | null;
    readonly workId?: string | null;
    readonly baseRevisionId?: string | null;
  }): EditorSessionView | null {
    const account = this.current();
    if (!account) return null;
    if (account.session && !account.session.closed) return account.session.view;
    const draft = options.draft ?? null;
    const saveMode = draft ? "saved" : options.saveMode;
    const view: EditorSessionView = {
      target: options.target,
      saveMode,
      draftId: draft?.id ?? null,
      sessionId: null,
      workId: draft?.workId ?? options.workId ?? null,
      baseRevisionId: draft?.baseRevisionId ?? options.baseRevisionId ?? null,
      hasContent: hasContent(draft?.content ?? null),
    };
    const submission = createSubmissionController({
      port: this.services.client,
      requestId: this.services.requestId,
    });
    const record: SessionRecord = {
      view,
      autosave: null,
      submission,
      latest: draft?.content ?? null,
      sessionRequestId: null,
      sessionTask: null,
      heartbeat: null,
      closed: false,
      unsubscribe: () => undefined,
    };
    // However the confirmation arrives (answer, receipt, explicit retry), the session completes.
    record.unsubscribe = submission.store.subscribe(() => {
      if (submission.store.get().status === "confirmed")
        this.completeSession(account, record);
    });
    if (saveMode === "saved")
      record.autosave = this.createAutosave(account, record, draft);
    account.completed?.dispose();
    account.completed = null;
    account.session = record;
    account.manager.setDraftId(view.draftId);
    account.manager.bindSession({
      saveMode,
      resolveHolder: () => this.resolveHolder(account, record),
    });
    this.publish();
    return view;
  }

  /** Reopens a saved draft's media on this browser (after `startSession`). */
  async restoreDraftMedia(draft: PublishingDraft): Promise<RestorePlanEntry[]> {
    const account = this.current();
    if (!account?.session || account.session.view.saveMode !== "saved")
      return [];
    return account.manager.restoreDraft(draft);
  }

  /** Latest editor content; saved mode forwards it to autosave. */
  edit(content: WorkDraftContent): void {
    const account = this.current();
    const session = account?.session;
    if (!account || !session || session.closed) return;
    const merged = withManagedItems(
      content,
      account.manager.draftItems(),
      true,
    );
    session.latest = merged;
    session.autosave?.edit(merged);
    this.updateHasContent(session, merged);
  }

  /**
   * Switches an unsaved session to saved mode. Only possible before any
   * media was registered under the temporary session.
   */
  enableSaving(): boolean {
    const account = this.current();
    const session = account?.session;
    if (!account || !session || session.closed) return false;
    if (session.view.saveMode === "saved") return true;
    if (session.view.sessionId !== null) return false;
    session.view = { ...session.view, saveMode: "saved" };
    session.autosave = this.createAutosave(account, session, null);
    if (session.latest) session.autosave.edit(session.latest);
    account.manager.bindSession({
      saveMode: "saved",
      resolveHolder: () => this.resolveHolder(account, session),
    });
    this.publish();
    return true;
  }

  /**
   * Switches a saved draft to no-save after the author confirmed the
   * targeted deletion scope (D06): autosave stops and any draft save or
   * creation still in flight finishes first (so the draft it produces is the
   * one deleted), uploads stop, then that draft (its history, conflict copies
   * and media only it references) is deleted and its local copies cleared.
   * The editor content stays in memory under a new temporary session; media
   * of the published work an edit draft started from keeps its identity.
   * When the deletion fails nothing changes except that uploads wait for the
   * explicit Continue.
   */
  async disableSaving(): Promise<PublishingDraftDeletionResult | null> {
    const account = this.current();
    const session = account?.session;
    if (
      !account ||
      !session ||
      session.closed ||
      session.view.saveMode !== "saved"
    )
      return null;
    const autosave = session.autosave;
    const manager = account.manager;
    autosave?.suspend();
    manager.suspendForHolderChange();
    let draftId: string | null;
    try {
      await autosave?.idle();
      draftId =
        (await autosave?.resolveCreatedDraft()) ??
        autosave?.store.get().draftId ??
        session.view.draftId;
    } catch (error) {
      this.abortHolderChange(account, session);
      throw error;
    }
    let result: PublishingDraftDeletionResult | null = null;
    if (draftId !== null) {
      try {
        result = await this.services.client.deleteDraft(draftId, {
          requestId: this.services.requestId(),
        });
      } catch (error) {
        this.abortHolderChange(account, session);
        throw error;
      }
      await this.services
        .createRecovery()
        ?.clearDraft(manager.accountId, draftId)
        .catch(() => undefined);
    }
    autosave?.dispose();
    if (session.closed) return result;
    session.autosave = null;
    session.view = { ...session.view, saveMode: "unsaved", draftId: null };
    manager.setDraftId(null);
    manager.bindSession({
      saveMode: "unsaved",
      resolveHolder: () => this.resolveHolder(account, session),
    });
    await manager.detachFromHolder();
    this.publish();
    return result;
  }

  private abortHolderChange(
    account: AccountRuntime,
    session: SessionRecord,
  ): void {
    account.manager.cancelHolderChange();
    if (!session.closed && this.current() === account)
      session.autosave?.resume();
  }

  /**
   * Leaves the editor session.
   *
   * - `discard: false` (leave): the session stays alive — for the global
   *   progress entry, `"kept"` — while any item is not yet ready (preparing,
   *   transferring, processing, paused, failed or waiting for a choice; in a
   *   saved draft an item already missing on this browser loses nothing), a
   *   saved draft has unsaved input, or a no-save session holds any content
   *   (it exists nowhere else). Otherwise it ends.
   * - `discard: true` (explicit): a no-save session cancels its items and
   *   discards the temporary session on the account, including one still
   *   being created (D08). A saved draft is left as last saved; its media
   *   stays with the draft.
   */
  async closeSession(options: {
    readonly discard: boolean;
  }): Promise<"ended" | "kept" | "none"> {
    const account = this.current();
    const session = account?.session;
    if (!account || !session || session.closed) return "none";
    if (!options.discard) {
      if (this.leaveWouldLoseWork(account, session)) return "kept";
    } else if (session.view.saveMode === "unsaved") {
      const manager = account.manager;
      manager.bindSession(null);
      for (const item of manager.getSnapshot().items)
        await manager.cancelItem(item.key);
      for (const item of manager.getSnapshot().items) manager.forget(item.key);
      await session.sessionTask?.catch(() => undefined);
      if (session.view.sessionId !== null)
        // A refused or lost discard leaves only a lease that expires on the account.
        await this.services.client
          .discardSession(session.view.sessionId, {
            requestId: this.services.requestId(),
          })
          .catch(() => undefined);
    }
    if (!session.closed) this.endSession(account, session);
    return "ended";
  }

  /** Whether leaving the current session now would lose work (see `closeSession`). */
  hasUnfinishedWork(): boolean {
    const account = this.current();
    const session = account?.session;
    return !!account && !!session && !session.closed
      ? this.leaveWouldLoseWork(account, session)
      : false;
  }

  /** Clears this browser's local copies of a draft deleted elsewhere (e.g. the drafts picker). */
  async forgetDraftLocalCopies(draftId: string): Promise<void> {
    const account = this.current();
    if (!account) return;
    await this.services
      .createRecovery()
      ?.clearDraft(account.manager.accountId, draftId)
      .catch(() => undefined);
  }

  private leaveWouldLoseWork(
    account: AccountRuntime,
    session: SessionRecord,
  ): boolean {
    const snapshot = account.manager.getSnapshot();
    const uploads = summarizeUploads(snapshot);
    // A saved draft's item missing on this browser loses nothing by leaving; any other
    // unfinished item would drop local bytes or a pending choice.
    const unfinished =
      session.view.saveMode === "saved"
        ? snapshot.items.some(
            (item) =>
              item.phase !== "ready" &&
              item.phase !== "cancelled" &&
              item.phase !== "cleanup" &&
              item.phase !== "missing_local",
          )
        : uploads.unfinished;
    return (
      unfinished ||
      (session.autosave?.hasUnsavedChanges() ?? false) ||
      (session.view.saveMode === "unsaved" &&
        (hasContent(session.latest) || uploads.total > 0))
    );
  }

  private endSession(
    account: AccountRuntime,
    session: SessionRecord,
    keepSubmission = false,
  ): void {
    session.closed = true;
    session.unsubscribe();
    this.stopHeartbeat(session);
    session.autosave?.dispose();
    if (keepSubmission) {
      account.completed?.dispose();
      account.completed = session.submission;
    } else session.submission.dispose();
    account.session = null;
    account.staging = null;
    account.manager.bindSession(null);
    account.manager.setDraftId(null);
    // The next session starts empty; items of this one never leak into it.
    account.manager.release();
    this.publish();
  }

  /**
   * A confirmed submission completes the session: no pending autosave may
   * write to the submitted draft, the heartbeat stops, local copies of the
   * draft are cleared, and the receipt stays readable through `submission()`.
   */
  private completeSession(account: AccountRuntime, session: SessionRecord) {
    if (session.closed) return;
    session.autosave?.dispose();
    const draftId =
      session.autosave?.store.get().draftId ?? session.view.draftId;
    if (draftId !== null)
      void this.services
        .createRecovery()
        ?.clearDraft(account.manager.accountId, draftId)
        .catch(() => undefined);
    this.endSession(account, session, true);
  }

  // -- staging -------------------------------------------------------------

  /** Identifies and groups newly selected files into the staging batch. */
  async stageFiles(files: readonly File[], origin: FileOrigin): Promise<void> {
    const account = this.current();
    if (!account || files.length === 0) return;
    account.identifying += files.length;
    this.publish();
    let identified: IdentifiedFile[];
    try {
      identified = await this.services.identifyFiles(files);
    } finally {
      account.identifying = Math.max(0, account.identifying - files.length);
    }
    if (this.current() !== account) return;
    account.staging = addToStagingBatch(account.staging, identified, origin);
    this.publish();
  }

  setStagingOriginal(original: boolean): void {
    const account = this.current();
    if (!account?.staging) return;
    account.staging = setBatchOriginal(account.staging, original);
    this.publish();
  }

  removeStaged(key: string): StagingChoiceError | null {
    return this.applyChoice((batch) => removeStagedEntry(batch, key));
  }

  keepStagedStill(key: string): StagingChoiceError | null {
    return this.applyChoice((batch) => keepStagedStillAsPhoto(batch, key));
  }

  async attachCounterpart(
    key: string,
    file: File,
  ): Promise<StagingChoiceError | null> {
    const account = this.current();
    if (!account?.staging) return "entry_missing";
    const [identified] = await this.services.identifyFiles([file]);
    if (!identified || this.current() !== account) return "choice_invalid";
    return this.applyChoice((batch) =>
      attachStagedCounterpart(batch, key, identified),
    );
  }

  resolveAmbiguous(
    key: string,
    stillIndex: number,
    motionIndex: number,
  ): StagingChoiceError | null {
    return this.applyChoice((batch) =>
      resolveStagedAmbiguity(batch, key, stillIndex, motionIndex),
    );
  }

  /** Confirms the ready staging entries under the batch mode and starts their preparation. */
  confirmStaging(): ConfirmStagingResult {
    const account = this.current();
    if (!account?.staging || !account.session || account.session.closed)
      return { ok: false, error: "nothing_ready" };
    const existing = liveItemCount(account.manager);
    const result = confirmStaging(
      account.staging,
      existing,
      account.limits?.maxItems ?? DEFAULT_MAX_ITEMS,
    );
    if (!result.ok) return result;
    account.staging = result.remaining;
    account.manager.addConfirmed(result.confirmed);
    this.publish();
    return result;
  }

  cancelStaging(): void {
    const account = this.current();
    if (!account) return;
    account.staging = null;
    this.publish();
  }

  // -- submission ----------------------------------------------------------

  /** One explicit submit of the current content (idempotent by its request identity). */
  async submit(
    content: WorkSubmissionContent,
  ): Promise<SubmissionState | null> {
    const account = this.current();
    const session = account?.session;
    if (!account || !session || session.closed) return null;
    const controller = session.submission;
    const status = controller.store.get().status;
    if (status !== "idle" && status !== "failed" && status !== "not_ready")
      return controller.store.get();
    controller.reset();
    // Registration may have assigned ids the editor content does not carry yet.
    const current = withManagedItems(
      content,
      account.manager.draftItems(),
      false,
    );
    let holder: PublishingHolder;
    try {
      holder = await this.resolveHolder(account, session, current);
    } catch (error) {
      const shape = (error ?? {}) as {
        message?: unknown;
        status?: unknown;
        code?: unknown;
      };
      return controller.reportFailure({
        code: typeof shape.code === "string" ? shape.code : null,
        message:
          typeof shape.message === "string" && typeof shape.status === "number"
            ? shape.message
            : "暂时无法发布，请重试",
      });
    }
    if (session.closed) return controller.store.get();
    return controller.submit({
      holder,
      content: current,
      baseRevisionId: session.view.baseRevisionId,
    });
  }

  dispose(): void {
    for (const account of this.accounts.values()) {
      if (account.session) {
        account.session.closed = true;
        account.session.unsubscribe();
        this.stopHeartbeat(account.session);
        account.session.autosave?.dispose();
        account.session.submission.dispose();
      }
      account.completed?.dispose();
      account.manager.dispose();
    }
    this.accounts.clear();
    this.accountId = null;
    this.publish();
  }

  // -- internals -----------------------------------------------------------

  private current(): AccountRuntime | null {
    return this.accountId === null
      ? null
      : (this.accounts.get(this.accountId) ?? null);
  }

  private async loadLimits(accountId: string): Promise<void> {
    try {
      const limits = await this.services.client.limits();
      const account = this.accounts.get(accountId);
      if (account) {
        account.limits = limits;
        this.publish();
      }
    } catch {
      // Counters fall back to the documented default; the Backend still enforces.
    }
  }

  private createAutosave(
    account: AccountRuntime,
    session: SessionRecord,
    draft: PublishingDraft | null,
  ): DraftAutosave {
    const autosave = createDraftAutosave({
      port: this.services.client,
      requestId: this.services.requestId,
      deviceClass: this.services.deviceClass(),
      draft,
      accountId: account.manager.accountId,
      currentAccount: this.services.currentAccount,
      ...(this.services.timers ? { timers: this.services.timers } : {}),
      onDraftCreated: (created) => {
        if (session.closed) return;
        session.view = { ...session.view, draftId: created.id };
        account.manager.setDraftId(created.id);
        this.publish();
      },
    });
    return autosave;
  }

  /** The content with the manager's items (pending entries for ones it does not list yet). */
  private contentWithItems(
    account: AccountRuntime,
    content: WorkDraftContent | null,
  ): WorkDraftContent {
    return withManagedItems(
      content ?? emptyContent(),
      account.manager.draftItems(),
      true,
    );
  }

  /** Pushes identity changes from the manager into the session content and autosave. */
  private syncManagedItems(account: AccountRuntime): void {
    const session = account.session;
    if (!session || session.closed || session.latest === null) return;
    const merged = this.contentWithItems(account, session.latest);
    if (sameDraftContent(merged, session.latest)) return;
    session.latest = merged;
    // Suspended for another account, autosave records it and sends nothing.
    session.autosave?.edit(merged);
    this.updateHasContent(session, merged);
  }

  private updateHasContent(
    session: SessionRecord,
    content: WorkDraftContent,
  ): void {
    const next = hasContent(content);
    if (next === session.view.hasContent) return;
    session.view = { ...session.view, hasContent: next };
    if (this.current()?.session === session) this.publish();
  }

  private async resolveHolder(
    account: AccountRuntime,
    session: SessionRecord,
    content?: WorkDraftContent,
  ): Promise<PublishingHolder> {
    if (session.closed) throw new Error("The editor session has ended");
    if (this.services.currentAccount() !== account.manager.accountId)
      throw new Error("The account changed");
    if (session.view.saveMode === "saved" && session.autosave) {
      const existing = session.autosave.store.get().draftId;
      if (existing !== null) return { draftId: existing };
      const next = this.contentWithItems(account, content ?? session.latest);
      session.latest = next;
      session.autosave.edit(next);
      return { draftId: await session.autosave.ensureDraft() };
    }
    if (session.view.sessionId !== null)
      return { sessionId: session.view.sessionId };
    session.sessionTask ??= (async () => {
      const requestId = (session.sessionRequestId ??=
        this.services.requestId());
      const created = await this.services.client.createSession({
        requestId,
        workId: session.view.workId,
      });
      // Recorded even when the editor is closing, so its discard can find it.
      session.view = { ...session.view, sessionId: created.id };
      if (session.closed) throw new Error("The editor session has ended");
      this.startHeartbeat(account, session);
      this.publish();
      return created.id;
    })().catch((error: unknown) => {
      session.sessionTask = null;
      // A refused create gets a new identity next time; an unknown outcome keeps it.
      if ((error as { outcomeUnknown?: unknown })?.outcomeUnknown !== true)
        session.sessionRequestId = null;
      throw error;
    });
    return { sessionId: await session.sessionTask };
  }

  private startHeartbeat(
    account: AccountRuntime,
    session: SessionRecord,
  ): void {
    this.stopHeartbeat(session);
    const beat = () => {
      session.heartbeat = this.timers.setTimeout(() => {
        const sessionId = session.view.sessionId;
        if (
          session.closed ||
          sessionId === null ||
          this.accountId !== account.manager.accountId ||
          this.services.currentAccount() !== account.manager.accountId
        )
          return;
        // One lease renewal per interval; a failed beat is not retried.
        void Promise.resolve()
          .then(() => this.services.client.heartbeatSession(sessionId))
          .catch(() => undefined);
        beat();
      }, SESSION_HEARTBEAT_MS);
    };
    beat();
  }

  private stopHeartbeat(session: SessionRecord | null): void {
    if (session?.heartbeat != null) {
      this.timers.clearTimeout(session.heartbeat);
      session.heartbeat = null;
    }
  }

  private applyChoice(
    change: (
      batch: StagingBatch,
    ) =>
      | { ok: true; batch: StagingBatch }
      | { ok: false; error: StagingChoiceError },
  ): StagingChoiceError | null {
    const account = this.current();
    if (!account?.staging) return "entry_missing";
    const result = change(account.staging);
    if (!result.ok) return result.error;
    account.staging = result.batch.entries.length === 0 ? null : result.batch;
    this.publish();
    return null;
  }

  private snapshot(): RuntimeSnapshot {
    const account = this.current();
    const staging = account?.staging ?? null;
    const existing = account ? liveItemCount(account.manager) : 0;
    return {
      accountId: this.accountId,
      session: account?.session?.view ?? null,
      staging:
        account && staging
          ? {
              batch: staging,
              count: countStaging(
                staging,
                existing,
                account.limits?.maxItems ?? DEFAULT_MAX_ITEMS,
              ),
              identifying: account.identifying,
            }
          : account && account.identifying > 0
            ? {
                batch: { origin: "picker", original: false, entries: [] },
                count: countStaging(
                  { origin: "picker", original: false, entries: [] },
                  existing,
                  account.limits?.maxItems ?? DEFAULT_MAX_ITEMS,
                ),
                identifying: account.identifying,
              }
            : null,
      limits: account?.limits ?? null,
    };
  }

  private publish(): void {
    this.store.set(this.snapshot());
  }
}
