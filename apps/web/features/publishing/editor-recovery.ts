import { parseEditorTarget } from "../product-shell/product-history";
import {
  RECOVERY_MAX_TOTAL_BYTES,
  RECOVERY_QUOTA_FRACTION,
} from "./local-recovery";

import type { PublishingCheckpoint } from "./publishing-runtime";
import type { EditorSessionState } from "./ui/editor/editor-session-state";

/** Local interruption recovery is never an account draft or an API cache. */
export interface EditorRecoveryRecord {
  readonly accountId: string;
  readonly id: string;
  readonly updatedAt: number;
  readonly state: EditorSessionState;
  readonly runtime: PublishingCheckpoint;
  readonly stagingKeys: readonly string[];
}

export interface EditorRecoveryBackend {
  put(record: EditorRecoveryRecord): Promise<void>;
  get(id: string): Promise<unknown>;
  remove(id: string): Promise<void>;
  bytes(): Promise<number>;
}

const ACCOUNT = /^user-[0-9a-f]{32}$/u;
const PREFIX = "artvenn.editor.interruption.";

/** Count distinct blobs, including a selection interrupted before identification. */
export const recoveryBlobs = (
  value: unknown,
  found = new Set<Blob>(),
): Set<Blob> => {
  if (value instanceof Blob) found.add(value);
  else if (Array.isArray(value))
    for (const entry of value) recoveryBlobs(entry, found);
  else if (value && typeof value === "object")
    for (const entry of Object.values(value)) recoveryBlobs(entry, found);
  return found;
};

export const recoveryBytes = (value: unknown) =>
  [...recoveryBlobs(value)].reduce((sum, blob) => sum + blob.size, 0);

export const parseEditorRecovery = (
  value: unknown,
  accountId: string,
): EditorRecoveryRecord | null => {
  if (!ACCOUNT.test(accountId) || !value || typeof value !== "object")
    return null;
  const r = value as EditorRecoveryRecord;
  if (
    r.accountId !== accountId ||
    typeof r.id !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/u.test(r.id) ||
    !Number.isFinite(r.updatedAt) ||
    r.state?.accountId !== accountId ||
    parseEditorTarget(r.state.target) === null ||
    parseEditorTarget(r.state.openedAs) === null ||
    typeof r.state.title !== "string" ||
    typeof r.state.body !== "string" ||
    r.state.title.length + r.state.body.length > 1_000_000 ||
    !Array.isArray(r.state.items) ||
    r.state.items.length > 50 ||
    !r.runtime?.view ||
    !Array.isArray(r.runtime.uploads) ||
    r.runtime.uploads.length > 50 ||
    !Array.isArray(r.runtime.pendingFiles) ||
    r.runtime.pendingFiles.length > 50 ||
    recoveryBytes(r.runtime) > RECOVERY_MAX_TOTAL_BYTES
  )
    return null;
  for (const item of r.runtime.uploads) {
    if (
      !item?.view ||
      !/^[A-Za-z0-9_-]{1,64}$/u.test(item.view.key) ||
      !["static", "live"].includes(item.view.kind) ||
      !["standard", "original", "legacy"].includes(item.view.qualityMode) ||
      !Array.isArray(item.view.components) ||
      item.view.components.length > 2 ||
      (item.prepared !== null &&
        (!Array.isArray(item.prepared) ||
          item.prepared.length > 2 ||
          item.prepared.some(
            (c: { blob: unknown }) => !(c.blob instanceof Blob),
          ))) ||
      (item.source !== null && !(item.source.still?.file instanceof Blob))
    )
      return null;
  }
  return r;
};

/** One serialized writer per tab. A discard fences even an already queued put. */
export class EditorInterruptionRecovery {
  private tail: Promise<unknown> = Promise.resolve();
  private epochs = new Map<string, number>();
  private sequences = new Map<string, number>();
  private identities = new Map<string, string>();
  constructor(
    private readonly backend: EditorRecoveryBackend,
    private readonly text: Storage,
    private readonly estimate: () => Promise<{
      quota?: number;
      usage?: number;
    }>,
    private readonly identity: () => string,
    private readonly durableText?: Storage,
  ) {}

  private key(account: string) {
    return PREFIX + account;
  }

  save(
    state: EditorSessionState,
    runtime: PublishingCheckpoint,
  ): Promise<boolean> {
    if (!ACCOUNT.test(state.accountId)) return Promise.resolve(false);
    const account = state.accountId;
    const epoch = this.epochs.get(account) ?? 0;
    const sequence = (this.sequences.get(account) ?? 0) + 1;
    this.sequences.set(account, sequence);
    let previous: EditorRecoveryRecord | null = null;
    try {
      previous = parseEditorRecovery(
        JSON.parse(this.text.getItem(this.key(account)) ?? "null"),
        account,
      );
    } catch {
      /* unavailable storage */
    }
    const record: EditorRecoveryRecord = {
      accountId: account,
      id: previous?.id ?? this.identity(),
      updatedAt: Date.now(),
      state,
      runtime,
      stagingKeys: runtime.staging?.entries.map((e) => e.key) ?? [],
    };
    this.identities.set(account, record.id);
    // Text is recorded synchronously, without waiting for large blob writes.
    // Blob state stays in IndexedDB. The small manifest keeps current identities,
    // so an older blob write cannot resurrect a removed item or duplicate an upload.
    try {
      const manifest = JSON.stringify({
        ...record,
        runtime: {
          ...runtime,
          uploads: runtime.uploads.map((item) => ({
            ...item,
            source: null,
            prepared: null,
          })),
          staging: null,
          pendingFiles: runtime.pendingFiles.map((p) => ({
            ...p,
            files: [],
          })),
        },
      });
      this.text.setItem(this.key(account), manifest);
      this.durableText?.setItem(this.key(account), manifest);
    } catch {
      return Promise.resolve(false);
    }
    const run = this.tail.then(async () => {
      if (
        (this.epochs.get(account) ?? 0) !== epoch ||
        this.sequences.get(account) !== sequence
      )
        return false;
      try {
        const bytes = recoveryBytes(runtime);
        const existing = await this.backend.get(record.id);
        // Once Standard preprocessing succeeded, its full source must no longer
        // remain hidden in an older recovery record, even if the next put fails.
        const old = parseEditorRecovery(existing, account);
        if (
          old?.runtime.uploads.some(
            (item) =>
              item.source &&
              runtime.uploads.some(
                (next) =>
                  next.view.key === item.view.key &&
                  next.view.qualityMode === "standard" &&
                  next.prepared,
              ),
          )
        )
          await this.backend.remove(record.id);
        const size = await this.backend.bytes();
        const { quota, usage } = await this.estimate();
        if (
          bytes > 0 &&
          ((quota !== undefined &&
            usage !== undefined &&
            bytes > Math.max(0, quota - usage) * RECOVERY_QUOTA_FRACTION) ||
            size - recoveryBytes(existing) + bytes > RECOVERY_MAX_TOTAL_BYTES)
        )
          return false;
        if ((this.epochs.get(account) ?? 0) !== epoch) return false;
        await this.backend.put(record);
        if ((this.epochs.get(account) ?? 0) !== epoch) {
          await this.backend.remove(record.id);
          return false;
        }
        const read = parseEditorRecovery(
          await this.backend.get(record.id),
          account,
        );
        if (
          !read ||
          read.updatedAt !== record.updatedAt ||
          recoveryBytes(read) !== bytes
        )
          return false;
        for (const blob of recoveryBlobs(read))
          if (
            blob.size &&
            (await blob.slice(-1).arrayBuffer()).byteLength !== 1
          )
            return false;
        return true;
      } catch {
        return false;
      }
    });
    this.tail = run;
    return run;
  }

  async load(account: string): Promise<EditorRecoveryRecord | null> {
    await this.tail;
    try {
      const text = parseEditorRecovery(
        JSON.parse(
          this.text.getItem(this.key(account)) ??
            this.durableText?.getItem(this.key(account)) ??
            "null",
        ),
        account,
      );
      if (!text) return null;
      const bytes = parseEditorRecovery(
        await this.backend.get(text.id).catch(() => null),
        account,
      );
      if (!bytes) return text;
      // Keystrokes may be newer than the last completed blob write.
      const staging = bytes.runtime.staging;
      return {
        ...bytes,
        ...text,
        runtime: {
          ...bytes.runtime,
          ...text.runtime,
          uploads: text.runtime.uploads.map((item) => {
            const stored = bytes.runtime.uploads.find(
              (candidate) =>
                candidate.view.key === item.view.key &&
                candidate.view.qualityMode === item.view.qualityMode,
            );
            return {
              ...item,
              prepared: stored?.prepared ?? null,
              source: stored?.prepared ? null : (stored?.source ?? null),
            };
          }),
          staging:
            staging && text.stagingKeys?.length
              ? {
                  ...staging,
                  entries: staging.entries.filter((e) =>
                    text.stagingKeys.includes(e.key),
                  ),
                }
              : null,
          pendingFiles: bytes.runtime.pendingFiles.filter((p) =>
            text.runtime.pendingFiles.some((latest) => latest.id === p.id),
          ),
        },
      };
    } catch {
      return null;
    }
  }

  discard(account: string): void {
    this.epochs.set(account, (this.epochs.get(account) ?? 0) + 1);
    let id = this.identities.get(account);
    try {
      id ??= JSON.parse(this.text.getItem(this.key(account)) ?? "null")?.id;
      this.text.removeItem(this.key(account));
      const fallback = JSON.parse(
        this.durableText?.getItem(this.key(account)) ?? "null",
      );
      if (fallback?.id === id) this.durableText?.removeItem(this.key(account));
    } catch {
      /* unavailable storage */
    }
    this.identities.delete(account);
    if (id)
      this.tail = this.tail
        .then(() => this.backend.remove(id!))
        .catch(() => undefined);
  }
}

export const createBrowserEditorRecovery =
  (): EditorInterruptionRecovery | null => {
    if (typeof window === "undefined" || typeof indexedDB === "undefined")
      return null;
    let text: Storage;
    let durableText: Storage;
    try {
      text = window.sessionStorage;
      durableText = window.localStorage;
    } catch {
      return null;
    }
    const db = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("artvenn.publishing.editor.v1", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("sessions");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error("editor_recovery_unavailable"));
    });
    // An unavailable database is reported by save, not as an unhandled rejection.
    void db.catch(() => undefined);
    const request = <T>(operation: IDBRequest<T>) =>
      new Promise<T>((resolve, reject) => {
        operation.onsuccess = () => resolve(operation.result);
        operation.onerror = () => reject(new Error("editor_recovery_failed"));
      });
    const write = async (id: string, record?: EditorRecoveryRecord) => {
      const transaction = (await db).transaction("sessions", "readwrite");
      const store = transaction.objectStore("sessions");
      if (record) store.put(record, id);
      else store.delete(id);
      await new Promise<void>((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = transaction.onabort = () =>
          reject(new Error("editor_recovery_failed"));
      });
    };
    return new EditorInterruptionRecovery(
      {
        put: (record) => write(record.id, record),
        remove: (id) => write(id),
        get: async (id) =>
          request(
            (await db).transaction("sessions").objectStore("sessions").get(id),
          ),
        bytes: async () =>
          recoveryBytes(
            await request(
              (await db)
                .transaction("sessions")
                .objectStore("sessions")
                .getAll(),
            ),
          ),
      },
      text,
      () => navigator.storage?.estimate?.() ?? Promise.resolve({}),
      () =>
        `edit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      durableText,
    );
  };
