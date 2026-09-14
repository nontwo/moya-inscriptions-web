"use client";

import { Icon } from "@moya/ui";
import { useCallback, useEffect, useRef, useState } from "react";

import { AuthorDialog } from "../../../authors/author-dialog";
import { publishingClient } from "../../publishing-data";
import {
  absoluteTime,
  displayTitle,
  mediaCountText,
  relativeTime,
  textExcerpt,
  trashRowNotes,
  trashRowState,
} from "./drafts-format";
import { createIntentIds, failureText, isAbort } from "./drafts-intent";
import {
  ConfirmPanel,
  CoverThumb,
  useFocusAfterRemoval,
} from "./drafts-shared";
import styles from "./drafts.module.css";

import type { TrashedWork } from "@moya/contracts";

const PAGE_SIZE = 20;

interface TrashList {
  readonly items: readonly TrashedWork[];
  readonly page: number;
  readonly total: number;
}

/**
 * The owner's recycle bin (T01–T03): submitted works kept for the retention
 * period with the days left, "恢复（仅自己可见）" after confirmation, and
 * Admin-removed works shown as not restorable (see `trashRowState`).
 */
export const TrashPanel = ({
  onClose,
  onRestored,
}: {
  readonly onClose: () => void;
  /** A work came back as self-only; the profile rereads its lists. */
  readonly onRestored?: (workId: string) => void;
}) => {
  const [list, setList] = useState<TrashList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{
    readonly id: string;
    readonly text: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef<HTMLUListElement>(null);
  const emptyRef = useRef<HTMLParagraphElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const failed = useRef<{ from: number; through: number }>({
    from: 1,
    through: 1,
  });
  const state = useRef<TrashList | null>(null);
  const restored = useRef(0);
  const intents = useRef(createIntentIds());
  const controller = useRef<AbortController | null>(null);
  const latest = useRef(onRestored);
  latest.current = onRestored;

  const load = useCallback(async (from: number, through = from) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setLoadError("");
    try {
      let merged: readonly TrashedWork[] =
        from === 1 ? [] : (state.current?.items ?? []);
      let total = 0;
      let lastPage = from;
      for (let page = from; page <= through; page++) {
        const result = await publishingClient.listTrash(
          { page, pageSize: PAGE_SIZE },
          current.signal,
        );
        if (current.signal.aborted) return;
        merged = [
          ...merged,
          ...result.items.filter(
            (item) => !merged.some((known) => known.workId === item.workId),
          ),
        ];
        total = result.total;
        lastPage = page;
      }
      restored.current = 0;
      const next = { items: merged, page: lastPage, total };
      state.current = next;
      setList(next);
    } catch (error) {
      if (current.signal.aborted || isAbort(error)) return;
      failed.current = { from, through };
      setLoadError(failureText(error, "回收站读取失败"));
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(1);
    return () => controller.current?.abort();
  }, [load]);

  const loadMore = () => {
    const current = state.current;
    if (current === null) return void load(1);
    // Restored works left the list, so later pages moved up.
    const shiftedStart = current.page * PAGE_SIZE - restored.current;
    void load(
      Math.max(1, Math.floor(shiftedStart / PAGE_SIZE) + 1),
      current.page + 1,
    );
  };

  const focusAfterRemoval = useFocusAfterRemoval(list?.items.length ?? 0, {
    list: listRef,
    empty: emptyRef,
    panel: panelRef,
  });

  const restore = async (work: TrashedWork) => {
    if (restoring !== null) return;
    const intent = `restore:${work.workId}`;
    setRestoring(work.workId);
    setRowError(null);
    try {
      await publishingClient.restoreWork(work.workId, {
        requestId: intents.current.take(intent),
      });
      intents.current.settle(intent);
      setConfirming(null);
      const before = state.current;
      const next =
        before === null
          ? null
          : {
              ...before,
              items: before.items.filter((item) => item.workId !== work.workId),
              total: Math.max(0, before.total - 1),
            };
      state.current = next;
      restored.current += 1;
      setList(next);
      setAnnouncement(
        `已恢复「${displayTitle(work.title)}」，目前仅自己可见，可在作品中重新设置可见范围`,
      );
      focusAfterRemoval();
      latest.current?.(work.workId);
      if (next !== null && next.items.length === 0 && next.total > 0)
        void load(1);
    } catch (error) {
      intents.current.settle(intent, error);
      setRowError({
        id: work.workId,
        text: failureText(error, "恢复未完成"),
      });
    } finally {
      setRestoring(null);
    }
  };

  const now = new Date();
  const items = list?.items ?? [];

  return (
    <AuthorDialog
      dismissible={restoring === null}
      onClose={onClose}
      title="回收站"
    >
      <div
        ref={panelRef}
        className={styles.panel}
        data-trash-panel=""
        tabIndex={-1}
      >
        <p className={styles.lead}>
          移到回收站的作品仅自己可见，保留期满后永久删除。恢复后的作品仅自己可见。
        </p>
        <p aria-live="polite" className={styles.status} role="status">
          {loading && list === null ? "正在读取回收站…" : announcement}
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
                void load(failed.current.from, failed.current.through);
              }}
              type="button"
            >
              重试
            </button>
          </p>
        ) : null}
        {list !== null && list.total === 0 && loadError === "" ? (
          <p ref={emptyRef} className={styles.empty} tabIndex={-1}>
            <Icon name="empty" />
            <span>回收站是空的</span>
          </p>
        ) : null}
        <ul
          ref={listRef}
          aria-label="回收站作品"
          className={styles.list}
          hidden={items.length === 0}
          tabIndex={-1}
        >
          {items.map((work) => {
            const headingId = `trash-heading-${work.workId}`;
            const noteId = `trash-note-${work.workId}`;
            const row = trashRowState(work, now);
            const excerpt = textExcerpt(work.excerpt, 80);
            const trashed = relativeTime(work.trashedAt, now);
            return (
              <li
                key={work.workId}
                className={styles.row}
                data-trash-state={row.kind}
                data-work-id={work.workId}
              >
                <CoverThumb src={work.coverSrc} text="" />
                <div className={styles.rowBody}>
                  <h3
                    className={styles.rowTitle}
                    data-unnamed={work.title.trim() === "" ? "" : undefined}
                    id={headingId}
                  >
                    {displayTitle(work.title)}
                  </h3>
                  {excerpt !== "" ? (
                    <p className={styles.excerpt}>{excerpt}</p>
                  ) : null}
                  <p className={styles.meta}>
                    <span>{mediaCountText(work.itemCount)}</span>
                    <time
                      dateTime={work.trashedAt}
                      title={absoluteTime(work.trashedAt)}
                    >
                      {trashed === "" ? "" : `${trashed}移到回收站`}
                    </time>
                  </p>
                  <p
                    className={
                      row.kind === "restorable"
                        ? styles.notice
                        : `${styles.notice} ${styles.warning}`
                    }
                    data-trash-note=""
                    id={noteId}
                  >
                    {row.kind === "restorable"
                      ? `剩余 ${row.days} 天，到期后永久删除`
                      : trashRowNotes[row.kind]}
                  </p>
                  <div className={styles.actions}>
                    <button
                      aria-describedby={`${headingId} ${noteId}`}
                      aria-expanded={
                        row.kind === "restorable"
                          ? confirming === work.workId
                          : undefined
                      }
                      className={styles.button}
                      disabled={row.kind !== "restorable" || restoring !== null}
                      onClick={() => {
                        setRowError(null);
                        setConfirming(work.workId);
                      }}
                      type="button"
                    >
                      恢复（仅自己可见）
                    </button>
                  </div>
                </div>
                {confirming === work.workId && row.kind === "restorable" ? (
                  <ConfirmPanel
                    busy={restoring === work.workId}
                    busyLabel="正在恢复…"
                    confirmLabel="恢复"
                    description="恢复后作品回到你的作品列表，仅自己可见；需要公开时，可以在作品中重新设置可见范围。"
                    onCancel={() => {
                      setRowError(null);
                      setConfirming(null);
                    }}
                    onConfirm={() => void restore(work)}
                    title={`恢复「${displayTitle(work.title)}」？`}
                  />
                ) : null}
                {rowError?.id === work.workId ? (
                  <p className={styles.alert} role="alert">
                    {rowError.text}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
        {list !== null && items.length < list.total && loadError === "" ? (
          <button
            aria-disabled={loading || undefined}
            className={`${styles.button} ${styles.loadMore}`}
            onClick={() => {
              if (!loading) loadMore();
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
