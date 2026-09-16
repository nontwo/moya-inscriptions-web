import { createExternalStore } from "./upload-manager-store";

import type { UploadTimers } from "./upload-manager";
import type { ExternalStore } from "./upload-manager-store";
import type {
  MediaCrop,
  PublishingReadiness,
  WorkDraftContent,
  WorkDraftItem,
} from "@moya/contracts";

/**
 * Readiness of edit derivatives (QA D1). An item the account has made ready
 * has its `base` derivatives; a rotation, a crop or the cover crop of the
 * cover item need derivatives of their own, which the account makes only
 * after it learns the edit (a draft save, or the explicit readiness check
 * that starts them). Until the account confirms them the item is presented
 * as 处理中, never 已就绪, and a submission would be refused as `not_ready`.
 *
 * The tracker asks `readiness(holder, content)` once an edit settles
 * (debounced), polls with a bounded backoff while the account still names
 * pending items, and stops when everything is ready, only failures remain,
 * the session ends or no holder exists yet. Every answer is stored with the
 * derivation signatures of the content it was asked for: an edit made after
 * the request is not covered by that answer and stays pending.
 */

export const EDIT_READINESS_DEBOUNCE_MS = 1000;
/** Bounded poll backoff while items are pending (ms, ≤ 5 s). */
export const EDIT_READINESS_POLL_MS = [1000, 2000, 3000, 5000];
/** Consecutive failed checks before the tracker gives up until the next edit. */
export const EDIT_READINESS_MAX_FAILURES = 5;

interface ContentAlbum {
  readonly items: readonly Pick<WorkDraftItem, "key" | "edit">[];
  readonly coverKey: string | null;
  readonly coverCrop: MediaCrop | null;
}

const cropSignature = (crop: MediaCrop | null) =>
  crop === null ? null : [crop.x, crop.y, crop.width, crop.height];

/**
 * What the account must derive for this item beyond `base`: its rotation and
 * crop, and the cover crop when it is the chosen cover. `null` when the base
 * derivatives are all it needs.
 */
export const derivationSignature = (
  item: Pick<WorkDraftItem, "key" | "edit">,
  content: Pick<ContentAlbum, "coverKey" | "coverCrop">,
): string | null => {
  const coverCrop = content.coverKey === item.key ? content.coverCrop : null;
  if (item.edit.rotation === 0 && item.edit.crop === null && coverCrop === null)
    return null;
  return JSON.stringify([
    item.edit.rotation,
    cropSignature(item.edit.crop),
    cropSignature(coverCrop),
  ]);
};

/** The derivation signature of every item, by key. */
export const derivationSignatures = (
  content: ContentAlbum,
): Readonly<Record<string, string | null>> =>
  Object.fromEntries(
    content.items.map((item) => [item.key, derivationSignature(item, content)]),
  );

/** Whether any item needs derivatives beyond `base`. */
export const needsDerivation = (content: ContentAlbum): boolean =>
  content.items.some((item) => derivationSignature(item, content) !== null);

export interface EditReadinessAnswer {
  readonly ready: boolean;
  readonly pendingItemKeys: ReadonlySet<string>;
  readonly failedItemKeys: ReadonlySet<string>;
  /** Edit keys of ready edited items (thumb path `<media path>/thumb/<key>`). */
  readonly editKeys: Readonly<Record<string, string>>;
  /** The derivation signatures of the content this answer describes. */
  readonly signatures: Readonly<Record<string, string | null>>;
}

export interface EditReadinessState {
  /**
   * `idle`: nothing asked yet; `checking`: a request is in flight;
   * `ready` / `not_ready`: the last answer; `unavailable`: repeated failures,
   * until the next edit asks again.
   */
  readonly status: "idle" | "checking" | "ready" | "not_ready" | "unavailable";
  readonly answered: EditReadinessAnswer | null;
}

export const IDLE_EDIT_READINESS: EditReadinessState = {
  status: "idle",
  answered: null,
};

export type ItemDerivation = "none" | "pending" | "failed" | "ready";

/**
 * Whether this item's derivatives beyond `base` exist: `none` when it needs
 * none, `pending` until an answer that covers its current edit confirms
 * them (or while the account still names it), `failed` when the account
 * could not make them, `ready` once confirmed. An item the last answer names
 * as pending stays pending even without an edit (an upload still
 * processing): the account, not the browser, decides readiness.
 */
export const itemDerivation = (
  item: Pick<WorkDraftItem, "key" | "edit">,
  content: Pick<ContentAlbum, "coverKey" | "coverCrop">,
  state: EditReadinessState | null,
): ItemDerivation => {
  const signature = derivationSignature(item, content);
  const answer = state?.answered ?? null;
  const covered =
    answer !== null &&
    item.key in answer.signatures &&
    answer.signatures[item.key] === signature;
  if (!covered) return signature === null ? "none" : "pending";
  if (answer.pendingItemKeys.has(item.key)) return "pending";
  if (answer.failedItemKeys.has(item.key)) return "failed";
  return signature === null ? "none" : "ready";
};

/** The edit key of a confirmed edited item's derivatives, if the account named one. */
export const itemEditKey = (
  item: Pick<WorkDraftItem, "key" | "edit">,
  content: Pick<ContentAlbum, "coverKey" | "coverCrop">,
  state: EditReadinessState | null,
): string | null =>
  itemDerivation(item, content, state) === "ready"
    ? (state?.answered?.editKeys[item.key] ?? null)
    : null;

const derivativePathPattern =
  /^(\/api\/community\/publishing\/media\/media-item-[0-9a-f]{32}\/(?:thumb|display|full|motion|cover))\/(?:base|[0-9a-f]{32})$/u;

/** The same derivative path under `editKey`; any other path is returned as is. */
export const withEditKey = (src: string, editKey: string): string => {
  const match = derivativePathPattern.exec(src);
  return match === null ? src : `${match[1]}/${editKey}`;
};

// ---------------------------------------------------------------------------
// Tracker

export interface EditReadinessTrackerOptions {
  /** The content to ask about; null while the session has none. */
  readonly content: () => WorkDraftContent | null;
  /**
   * Asks the account. Resolves null when nothing can be asked now (no
   * holder exists yet, another account is active): the tracker waits for
   * the next `schedule` or `poke`.
   */
  readonly check: (
    content: WorkDraftContent,
  ) => Promise<PublishingReadiness | null>;
  readonly timers: UploadTimers;
}

export interface EditReadinessTracker {
  readonly store: ExternalStore<EditReadinessState>;
  /** An edit settled: ask once the debounce passes (a run in flight is superseded). */
  schedule(): void;
  /** Something the account did may have changed readiness: ask now if anything needs it. */
  poke(): void;
  /** A submission was refused as `not_ready` for these keys: show them pending and keep asking. */
  markPending(itemKeys: readonly string[]): void;
  dispose(): void;
}

const contentKey = (content: WorkDraftContent | null): string =>
  content === null ? "" : JSON.stringify(derivationSignatures(content));

export const createEditReadinessTracker = (
  options: EditReadinessTrackerOptions,
): EditReadinessTracker => {
  const store = createExternalStore<EditReadinessState>(IDLE_EDIT_READINESS);
  let disposed = false;
  let timer: unknown = null;
  let run = 0;
  let pollAttempt = 0;
  let failures = 0;
  /** A refused submission asks even when no edit needs derivatives. */
  let forced = false;
  let scheduledKey: string | null = null;

  const clearTimer = () => {
    if (timer !== null) options.timers.clearTimeout(timer);
    timer = null;
  };

  const set = (state: EditReadinessState) => {
    if (!disposed) store.set(state);
  };

  const wanted = (
    content: WorkDraftContent | null,
  ): content is WorkDraftContent =>
    content !== null && (forced || needsDerivation(content));

  const later = (ms: number) => {
    clearTimer();
    timer = options.timers.setTimeout(() => {
      timer = null;
      void ask();
    }, ms);
  };

  const ask = async () => {
    if (disposed) return;
    const content = options.content();
    if (!wanted(content)) return;
    const id = (run += 1);
    const signatures = derivationSignatures(content);
    set({ status: "checking", answered: store.get().answered });
    let answer: PublishingReadiness | null;
    try {
      answer = await options.check(content);
    } catch {
      if (disposed || id !== run) return;
      failures += 1;
      if (failures >= EDIT_READINESS_MAX_FAILURES) {
        set({ status: "unavailable", answered: store.get().answered });
        return;
      }
      later(EDIT_READINESS_POLL_MS[EDIT_READINESS_POLL_MS.length - 1]!);
      return;
    }
    if (disposed || id !== run) return;
    if (answer === null) {
      // Nothing to ask yet: the runtime pokes once a holder exists.
      set({
        status: store.get().answered === null ? "idle" : store.get().status,
        answered: store.get().answered,
      });
      return;
    }
    failures = 0;
    if (answer.ready) forced = false;
    set({
      status: answer.ready ? "ready" : "not_ready",
      answered: {
        ready: answer.ready,
        pendingItemKeys: new Set(answer.pendingItemKeys),
        failedItemKeys: new Set(answer.failedItemKeys),
        editKeys: answer.editKeys,
        signatures,
      },
    });
    if (answer.pendingItemKeys.length > 0) {
      const delay =
        EDIT_READINESS_POLL_MS[
          Math.min(pollAttempt, EDIT_READINESS_POLL_MS.length - 1)
        ]!;
      pollAttempt += 1;
      later(delay);
    }
  };

  return {
    store,
    schedule() {
      if (disposed) return;
      const content = options.content();
      const key = contentKey(content);
      const answered = store.get().answered;
      // Text edits change nothing the account derives: an answer that
      // already covers these signatures (or a run on its way) stands.
      if (
        key === scheduledKey &&
        (timer !== null ||
          store.get().status === "checking" ||
          (answered !== null && JSON.stringify(answered.signatures) === key))
      )
        return;
      scheduledKey = key;
      pollAttempt = 0;
      failures = 0;
      // A run in flight answers for older content: its answer is dropped.
      run += 1;
      if (!wanted(content)) {
        clearTimer();
        if (store.get().status === "checking")
          set({ status: "idle", answered });
        return;
      }
      later(EDIT_READINESS_DEBOUNCE_MS);
    },
    poke() {
      if (disposed || timer !== null || store.get().status === "checking")
        return;
      const content = options.content();
      if (!wanted(content)) return;
      pollAttempt = 0;
      void ask();
    },
    markPending(itemKeys) {
      if (disposed) return;
      const content = options.content();
      if (content === null) return;
      forced = true;
      const answered = store.get().answered;
      set({
        status: "not_ready",
        answered: {
          ready: false,
          pendingItemKeys: new Set(itemKeys),
          failedItemKeys: new Set(),
          editKeys: answered?.editKeys ?? {},
          signatures: derivationSignatures(content),
        },
      });
      scheduledKey = contentKey(content);
      // The first poll at once (1 s), the backoff continuing from there.
      pollAttempt = 1;
      failures = 0;
      run += 1;
      later(EDIT_READINESS_POLL_MS[0]!);
    },
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
};
