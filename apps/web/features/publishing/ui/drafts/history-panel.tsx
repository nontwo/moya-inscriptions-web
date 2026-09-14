"use client";

import { Icon } from "@moya/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthorDialog } from "../../../authors/author-dialog";
import { publishingClient } from "../../publishing-data";
import { useUploadSession } from "../../publishing-provider";
import {
  absoluteTime,
  displayTitle,
  mediaCountText,
  relativeTime,
  snapshotKindLabels,
  textExcerpt,
} from "./drafts-format";
import { createIntentIds, failureText, isAbort } from "./drafts-intent";
import styles from "./drafts.module.css";

import type { PublishingDraft, PublishingSnapshot } from "@moya/contracts";

const PAGE_SIZE = 20;

/** A save in flight coalesces later input into one follow-up; a few rounds settle both. */
const SAVE_ROUNDS = 3;

const RESTORE_UNSAVED_TEXT = "当前编辑还有未保存的更改，保存完成后才能恢复";
const RESTORE_CONFLICT_TEXT =
  "这份草稿有两个版本待选择，请先选择要继续编辑的版本";

const newestFirst = (a: PublishingSnapshot, b: PublishingSnapshot): number => {
  const order = Date.parse(b.createdAt) - Date.parse(a.createdAt);
  return order !== 0 ? order : b.id < a.id ? -1 : b.id > a.id ? 1 : 0;
};

/** Lets a store change that a save caused reach this component's render. */
const nextTask = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

interface HistoryList {
  readonly items: readonly PublishingSnapshot[];
  readonly page: number;
  readonly total: number;
}

/**
 * The saved draft's history, newest first (V02, V04): each snapshot shows
 * its kind and a preview, and "恢复为当前编辑" makes it the current private
 * edit. Restoring never publishes. The Backend keeps only what the account
 * has saved, so the open editor's input is saved first and a restore waits
 * while any of it is not on the account: newer input is never cleared (V05).
 */
export const HistoryPanel = ({
  draftId,
  onRestored,
  onClose,
  prepareRestore,
}: {
  readonly draftId: string;
  /** The draft as it is after the restore; the editor continues from it. */
  readonly onRestored: (draft: PublishingDraft) => void;
  readonly onClose: () => void;
  /**
   * Puts the editor's input on the account before a restore and resolves
   * false when some of it is still not saved. Without it, the panel saves
   * the upload session's input itself when that session edits this draft.
   */
  readonly prepareRestore?: () => Promise<boolean>;
}) => {
  const upload = useUploadSession();
  const [list, setList] = useState<HistoryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [restoring, setRestoring] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    readonly id: string;
    readonly text: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const intents = useRef(createIntentIds());
  const controller = useRef<AbortController | null>(null);
  const state = useRef<HistoryList | null>(null);
  const failedPage = useRef(1);
  const panelRef = useRef<HTMLDivElement>(null);
  const latest = useRef({ onRestored, onClose, prepareRestore, upload });
  latest.current = { onRestored, onClose, prepareRestore, upload };

  const editsThisDraft =
    upload.session !== null &&
    upload.session.saveMode === "saved" &&
    (upload.autosave?.draftId ?? upload.session.draftId) === draftId;
  const inConflict = editsThisDraft && upload.autosave?.status === "conflict";

  // A conflict that arrives while the panel is open closes it: the conflict
  // chooser takes over, and two author dialogs never share one history entry.
  const conflictAtOpen = useRef(inConflict);
  const conflictArrived = useRef(false);
  useEffect(() => {
    if (!inConflict) conflictAtOpen.current = false;
    else if (!conflictAtOpen.current) conflictArrived.current = true;
  }, [inConflict]);
  useEffect(() => {
    if (!conflictArrived.current || restoring !== null) return;
    conflictArrived.current = false;
    latest.current.onClose();
  }, [inConflict, restoring]);

  const load = useCallback(
    async (page: number) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setLoading(true);
      setLoadError("");
      try {
        const result = await publishingClient.draftHistory(
          draftId,
          { page, pageSize: PAGE_SIZE },
          current.signal,
        );
        if (current.signal.aborted) return;
        const known = page === 1 ? [] : (state.current?.items ?? []);
        const next = {
          items: [
            ...known,
            ...result.items.filter(
              (item) => !known.some((existing) => existing.id === item.id),
            ),
          ].sort(newestFirst),
          page: result.page,
          total: result.total,
        };
        state.current = next;
        setList(next);
      } catch (error) {
        if (current.signal.aborted || isAbort(error)) return;
        failedPage.current = page;
        setLoadError(failureText(error, "历史版本读取失败"));
      } finally {
        if (!current.signal.aborted) setLoading(false);
      }
    },
    [draftId],
  );

  useEffect(() => {
    void load(1);
    return () => controller.current?.abort();
  }, [load]);

  /** Null when the restore may go ahead; otherwise why it waits. */
  const prepare = async (): Promise<string | null> => {
    const provided = latest.current.prepareRestore;
    if (provided !== undefined)
      return (await provided().catch(() => false))
        ? null
        : RESTORE_UNSAVED_TEXT;
    const owns = () => {
      const { session, autosave } = latest.current.upload;
      return (
        session !== null &&
        session.saveMode === "saved" &&
        (autosave?.draftId ?? session.draftId) === draftId
      );
    };
    for (let round = 0; ; round++) {
      if (!owns()) return null;
      const current = latest.current.upload;
      if (current.autosave?.status === "conflict") return RESTORE_CONFLICT_TEXT;
      if (!current.hasUnsavedChanges()) return null;
      // A save that already failed once in this attempt is not repeated here.
      if (
        round >= SAVE_ROUNDS ||
        (round > 0 && current.autosave?.status === "error")
      )
        return RESTORE_UNSAVED_TEXT;
      await current.saveNow().catch(() => undefined);
      await nextTask();
    }
  };

  const restore = async (snapshot: PublishingSnapshot) => {
    if (restoring !== null) return;
    const intent = `restore:${snapshot.id}`;
    setRestoring(snapshot.id);
    setRowError(null);
    setAnnouncement("正在恢复…");
    const waiting = await prepare();
    if (waiting !== null) {
      setAnnouncement("");
      setRowError({ id: snapshot.id, text: waiting });
      setRestoring(null);
      return;
    }
    try {
      const draft = await publishingClient.restoreSnapshot(draftId, {
        requestId: intents.current.take(intent),
        snapshotId: snapshot.id,
      });
      intents.current.settle(intent);
      setAnnouncement("已恢复为当前编辑，之前保存的内容保留在历史版本中");
      setRestoring(null);
      latest.current.onRestored(draft);
      // The restore added history entries; a panel that stays open shows them.
      void load(1);
    } catch (error) {
      intents.current.settle(intent, error);
      setAnnouncement("");
      setRowError({
        id: snapshot.id,
        text: failureText(error, "恢复未完成"),
      });
      setRestoring(null);
    }
  };

  const now = new Date();
  const items = list?.items ?? [];

  return (
    <AuthorDialog
      dismissible={restoring === null}
      onClose={onClose}
      title="历史版本"
    >
      <div
        ref={panelRef}
        className={styles.panel}
        data-history-panel=""
        tabIndex={-1}
      >
        <p className={styles.lead}>
          恢复后成为当前编辑的内容，不会直接发布；账号中已保存的内容会保留在历史版本中。
        </p>
        <p aria-live="polite" className={styles.status} role="status">
          {loading && list === null ? "正在读取历史版本…" : announcement}
        </p>
        {loadError !== "" ? (
          <p className={styles.alert} role="alert">
            {loadError}
            <button
              aria-disabled={loading || undefined}
              className={styles.button}
              onClick={() => {
                if (loading) return;
                // The alert holding this button goes away while reading.
                panelRef.current?.focus({ preventScroll: true });
                void load(failedPage.current);
              }}
              type="button"
            >
              重试
            </button>
          </p>
        ) : null}
        {list !== null && list.total === 0 && loadError === "" ? (
          <p className={styles.empty}>
            <Icon name="empty" />
            <span>暂无历史版本</span>
          </p>
        ) : null}
        <ol
          aria-label="历史版本列表"
          className={styles.list}
          hidden={items.length === 0}
        >
          {items.map((snapshot) => {
            const headingId = `snapshot-heading-${snapshot.id}`;
            const excerpt = textExcerpt(snapshot.content.body, 80);
            const time = relativeTime(snapshot.createdAt, now);
            return (
              <li
                key={snapshot.id}
                className={styles.row}
                data-row-kind="history"
                data-snapshot-id={snapshot.id}
              >
                <div className={styles.rowBody}>
                  <p className={styles.meta}>
                    <span
                      className={styles.label}
                      data-snapshot-kind={snapshot.kind}
                    >
                      {snapshotKindLabels[snapshot.kind]}
                    </span>
                    <time
                      dateTime={snapshot.createdAt}
                      title={absoluteTime(snapshot.createdAt)}
                    >
                      {time}
                    </time>
                  </p>
                  <h3
                    className={styles.rowTitle}
                    data-unnamed={
                      snapshot.content.title.trim() === "" ? "" : undefined
                    }
                    id={headingId}
                  >
                    {displayTitle(snapshot.content.title)}
                  </h3>
                  {excerpt !== "" ? (
                    <p className={styles.excerpt}>{excerpt}</p>
                  ) : null}
                  <p className={styles.meta}>
                    <span>{mediaCountText(snapshot.content.items.length)}</span>
                  </p>
                  <div className={styles.actions}>
                    {/* Focusable while busy, so focus is never dropped to the page. */}
                    <button
                      aria-describedby={headingId}
                      aria-disabled={restoring !== null || undefined}
                      className={styles.button}
                      onClick={() => void restore(snapshot)}
                      type="button"
                    >
                      {restoring === snapshot.id
                        ? "正在恢复…"
                        : "恢复为当前编辑"}
                    </button>
                  </div>
                  {rowError?.id === snapshot.id ? (
                    <p className={styles.alert} role="alert">
                      {rowError.text}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
        {list !== null && items.length < list.total && loadError === "" ? (
          <button
            aria-disabled={loading || undefined}
            className={`${styles.button} ${styles.loadMore}`}
            onClick={() => {
              if (!loading) void load(list.page + 1);
            }}
            type="button"
          >
            加载更多
          </button>
        ) : null}
      </div>
    </AuthorDialog>
  );
};
