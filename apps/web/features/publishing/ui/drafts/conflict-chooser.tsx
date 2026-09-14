"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useAuthors } from "../../../authors/author-context";
import { AuthorDialog } from "../../../authors/author-dialog";
import {
  PublishingRequestError,
  publishingClient,
} from "../../publishing-data";
import {
  absoluteTime,
  authorshipDetails,
  authorshipLabels,
  compareContent,
  deviceClassLabels,
  displayTitle,
  itemEditText,
  mediaEditNotes,
  relativeTime,
  visibilityLabels,
} from "./drafts-format";
import { createIntentIds, failureText, isAbort } from "./drafts-intent";
import styles from "./drafts.module.css";

import type {
  PublishingDeviceClass,
  PublishingDraft,
  PublishingDraftConflict,
  PublishingMediaItem,
  WorkDraftContent,
} from "@moya/contracts";
import type { ContentComparison } from "./drafts-format";

type Choice = "device" | "account";

const choiceLabels = {
  device: "本设备版本",
  account: "账号中的新版本",
} as const satisfies Record<Choice, string>;

const unavailableStates = new Set(["failed", "cancelled", "purged"]);

type MediaRead = "loading" | "ready" | "failed";

const MediaTile = ({
  item,
  index,
  cover,
  media,
  mediaRead,
}: {
  readonly item: WorkDraftContent["items"][number];
  readonly index: number;
  readonly cover: boolean;
  readonly media: PublishingMediaItem | undefined;
  readonly mediaRead: MediaRead;
}) => {
  const [failed, setFailed] = useState(false);
  const thumb = media?.media?.thumbSrc;
  // An item the draft read could not describe is not called unavailable:
  // only its thumbnail is missing (the panel says so once).
  const state =
    item.itemId === null
      ? "待上传"
      : media === undefined
        ? mediaRead === "ready"
          ? "不可用"
          : ""
        : unavailableStates.has(media.state)
          ? "不可用"
          : thumb === undefined || failed
            ? media.state === "ready"
              ? "无法显示"
              : "处理中"
            : "";
  const label = [
    `第 ${index + 1} 项`,
    item.kind === "live" ? "实况照片" : null,
    cover ? "封面" : null,
    itemEditText(item.edit),
    state === "" ? null : state,
  ]
    .filter((part) => part !== null)
    .join("，");
  return (
    <li
      className={styles.tile}
      data-cover={cover ? "" : undefined}
      data-item-key={item.key}
    >
      <span className="yoyi-visually-hidden">{label}</span>
      {thumb !== undefined && !failed ? (
        <img
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          src={thumb}
        />
      ) : (
        <span aria-hidden="true" className={styles.tileState}>
          {state}
        </span>
      )}
      <span aria-hidden="true" className={styles.tileNumber}>
        {index + 1}
      </span>
      {cover ? (
        <span aria-hidden="true" className={styles.tileCover}>
          封面
        </span>
      ) : null}
    </li>
  );
};

const Differs = ({ when }: { readonly when: boolean }) =>
  when ? <span className={styles.differs}>与另一版本不同</span> : null;

const VersionColumn = ({
  choice,
  content,
  deviceClass,
  at,
  differences,
  mediaItems,
  mediaRead,
  unavailable,
  unavailableNoteId,
  resolving,
  onChoose,
}: {
  readonly choice: Choice;
  readonly content: WorkDraftContent;
  readonly deviceClass: PublishingDeviceClass | null;
  readonly at: string;
  readonly differences: ContentComparison;
  readonly mediaItems: readonly PublishingMediaItem[];
  readonly mediaRead: MediaRead;
  /** Another command is running, or only the other choice may be retried. */
  readonly unavailable: boolean;
  readonly unavailableNoteId: string | undefined;
  readonly resolving: boolean;
  readonly onChoose: () => void;
}) => {
  const headingId = useId();
  const now = new Date();
  const when = relativeTime(at, now);
  const source = [
    deviceClass === null ? null : deviceClassLabels[deviceClass],
    when === "" ? null : `${when}${choice === "device" ? "保存" : "更新"}`,
  ]
    .filter((part) => part !== null)
    .join(" · ");
  const body = content.body.replace(/\r\n?/gu, "\n").trim();
  const details = authorshipDetails(content.authorship);
  const editNotes = mediaEditNotes(content);
  return (
    <section
      aria-labelledby={headingId}
      className={styles.version}
      data-conflict-version={choice}
    >
      <div className={styles.versionHeading}>
        <h3 id={headingId}>{choiceLabels[choice]}</h3>
        {source !== "" ? (
          <p className={styles.meta}>
            <time dateTime={at} title={absoluteTime(at)}>
              {source}
            </time>
          </p>
        ) : null}
      </div>
      <dl
        className={styles.field}
        data-differs={differences.title || undefined}
      >
        <dt>
          标题
          <Differs when={differences.title} />
        </dt>
        <dd data-unnamed={content.title.trim() === "" ? "" : undefined}>
          {displayTitle(content.title)}
        </dd>
      </dl>
      <dl className={styles.field} data-differs={differences.body || undefined}>
        <dt>
          正文
          <Differs when={differences.body} />
        </dt>
        <dd className={body === "" ? undefined : styles.body}>
          {body === "" ? "无正文" : body}
        </dd>
      </dl>
      <dl
        className={styles.field}
        data-differs={differences.media || differences.cover || undefined}
      >
        <dt>
          {`图片顺序（${content.items.length} 项）`}
          <Differs when={differences.media || differences.cover} />
        </dt>
        <dd>
          {content.items.length === 0 ? (
            "无图片"
          ) : (
            <ol
              aria-label={`${choiceLabels[choice]}的图片顺序`}
              className={styles.strip}
            >
              {content.items.map((item, index) => (
                <MediaTile
                  key={item.key}
                  cover={content.coverKey === item.key}
                  index={index}
                  item={item}
                  media={
                    item.itemId === null
                      ? undefined
                      : mediaItems.find(
                          (candidate) => candidate.id === item.itemId,
                        )
                  }
                  mediaRead={mediaRead}
                />
              ))}
            </ol>
          )}
          {editNotes.length > 0 ? (
            // Thumbnails are the unedited images; edits are named in text.
            <p className={styles.meta} data-edit-notes="">
              {editNotes.join("；")}
            </p>
          ) : null}
        </dd>
      </dl>
      <dl
        className={styles.field}
        data-differs={differences.settings || undefined}
      >
        <dt>
          设置
          <Differs when={differences.settings} />
        </dt>
        <dd>
          {`作品性质：${authorshipLabels[content.authorship.kind]}`}
          {details.map((detail) => (
            <span key={detail.label}>
              <br />
              {`${detail.label}：${detail.value}`}
            </span>
          ))}
          <br />
          {`可见范围：${visibilityLabels[content.visibility]}`}
          {content.coverKey === null && content.items.length > 0 ? (
            <>
              <br />
              封面：自动选择
            </>
          ) : null}
        </dd>
      </dl>
      {/* Neither version is preferred, so neither button is the primary one.
          Focusable while unavailable, so focus is never dropped to the page. */}
      <button
        aria-describedby={
          unavailableNoteId === undefined
            ? headingId
            : `${headingId} ${unavailableNoteId}`
        }
        aria-disabled={unavailable || undefined}
        className={styles.button}
        onClick={() => {
          if (!unavailable) onChoose();
        }}
        type="button"
      >
        {resolving ? "正在应用…" : `使用${choiceLabels[choice]}`}
      </button>
    </section>
  );
};

type CheckResult = "settled" | "open" | "unknown";

/**
 * Both recoverable versions of one concurrent edit, side by side (V03): the
 * text, media order with the cover, and settings of each. Choosing one makes
 * it the current edit through the Backend; the other stays in history. A
 * failed or unconfirmed choice reads the draft again: a conflict settled
 * elsewhere hands the account's draft back instead of leaving the author at
 * a dead end, and an unconfirmed choice may only be repeated, never switched.
 */
export const ConflictChooser = ({
  draftId,
  conflict,
  onResolved,
  onClose,
  mediaItems: providedMediaItems,
}: {
  readonly draftId: string;
  readonly conflict: PublishingDraftConflict;
  /** The draft after the choice; the editor continues from its content. */
  readonly onResolved: (draft: PublishingDraft) => void;
  readonly onClose: () => void;
  /**
   * The draft's media items when the editor already has them; otherwise the
   * chooser reads the draft once for thumbnails.
   */
  readonly mediaItems?: readonly PublishingMediaItem[];
}) => {
  const author = useAuthors();
  const [fetchedItems, setFetchedItems] = useState<
    readonly PublishingMediaItem[] | null
  >(null);
  const [mediaFailed, setMediaFailed] = useState(false);
  const [resolving, setResolving] = useState<Choice | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<{
    readonly text: string;
    readonly canCheck: boolean;
  } | null>(null);
  /** A choice whose outcome is unknown: only it may be sent again. */
  const [pendingChoice, setPendingChoice] = useState<Choice | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const noteId = useId();
  const intents = useRef(createIntentIds());
  const latest = useRef({ onResolved, notify: author.notify });
  latest.current = { onResolved, notify: author.notify };

  const needsItems =
    providedMediaItems === undefined &&
    [...conflict.device.content.items, ...conflict.account.content.items].some(
      (item) => item.itemId !== null,
    );

  useEffect(() => {
    if (!needsItems) return undefined;
    const controller = new AbortController();
    publishingClient
      .draft(draftId, controller.signal)
      .then((draft) => {
        if (!controller.signal.aborted) setFetchedItems(draft.mediaItems);
      })
      // Thumbnails are optional: the order, count and cover still show.
      .catch((failure: unknown) => {
        if (controller.signal.aborted || isAbort(failure)) return;
        setMediaFailed(true);
      });
    return () => controller.abort();
  }, [draftId, needsItems]);

  const mediaItems = providedMediaItems ?? fetchedItems ?? [];
  const mediaRead: MediaRead =
    providedMediaItems !== undefined || fetchedItems !== null
      ? "ready"
      : mediaFailed
        ? "failed"
        : "loading";
  const differences = compareContent(
    conflict.device.content,
    conflict.account.content,
  );

  /** Reads the draft again; a conflict no longer open hands that draft back. */
  const check = async (): Promise<CheckResult> => {
    setChecking(true);
    try {
      const fresh = await publishingClient.draft(draftId);
      if (fresh.conflict?.id === conflict.id) return "open";
      latest.current.notify(
        "这份草稿的版本已经确定，将从账号中的最新内容继续编辑",
      );
      latest.current.onResolved(fresh);
      return "settled";
    } catch {
      return "unknown";
    } finally {
      setChecking(false);
    }
  };

  const choose = async (choice: Choice) => {
    if (resolving !== null || checking) return;
    if (pendingChoice !== null && pendingChoice !== choice) return;
    const intent = `resolve:${conflict.id}:${choice}`;
    setResolving(choice);
    setError(null);
    setAnnouncement("正在应用所选版本…");
    try {
      const draft = await publishingClient.resolveConflict(draftId, {
        requestId: intents.current.take(intent),
        conflictId: conflict.id,
        choice,
      });
      intents.current.settle(intent);
      const other = choice === "device" ? "account" : "device";
      const done = `已使用${choiceLabels[choice]}，${choiceLabels[other]}保留在历史版本中`;
      setAnnouncement("");
      setPendingChoice(null);
      setResolving(null);
      // The app-wide notice, not this panel's status: the editor usually
      // closes the chooser at once, and the notice outlives it.
      latest.current.notify(done);
      latest.current.onResolved(draft);
    } catch (failure) {
      intents.current.settle(intent, failure);
      const unknown =
        failure instanceof PublishingRequestError && failure.outcomeUnknown;
      setPendingChoice(unknown ? choice : null);
      setAnnouncement("");
      const result = await check();
      setResolving(null);
      if (result === "settled") return;
      setError({
        text:
          result === "unknown"
            ? `${failureText(failure, "未能应用所选版本")}，暂时无法确认草稿的当前状态`
            : failureText(failure, "未能应用所选版本"),
        canCheck: result === "unknown",
      });
    }
  };

  const recheck = async () => {
    if (checking || resolving !== null) return;
    const result = await check();
    if (result === "open") setError(null);
    else if (result === "unknown")
      setError((current) =>
        current === null
          ? { text: "暂时无法确认草稿的当前状态", canCheck: true }
          : current,
      );
  };

  const busy = resolving !== null || checking;

  return (
    <AuthorDialog
      dismissible={!busy}
      onClose={onClose}
      title="选择要继续编辑的版本"
    >
      <div className={styles.panel} data-conflict-chooser={conflict.id}>
        <p className={styles.lead}>
          这份草稿在别处也保存了更改，现在有两个版本。选择一个继续编辑；未选择的版本会保留在历史版本中，之后仍可恢复。
        </p>
        <p aria-live="polite" className={styles.status} role="status">
          {checking && resolving === null ? "正在检查草稿…" : announcement}
        </p>
        {error !== null ? (
          <p className={styles.alert} role="alert">
            {error.text}
            {error.canCheck ? (
              <button
                aria-disabled={busy || undefined}
                className={styles.button}
                onClick={() => void recheck()}
                type="button"
              >
                重新检查
              </button>
            ) : null}
          </p>
        ) : null}
        {pendingChoice !== null ? (
          <p className={styles.notice} data-pending-choice="" id={noteId}>
            {`上一次选择的结果尚未确认，只能重试「使用${choiceLabels[pendingChoice]}」`}
          </p>
        ) : null}
        {mediaRead === "failed" ? (
          <p className={styles.notice} data-thumbs-failed="">
            缩略图暂时无法读取，图片的顺序和封面仍按各版本显示。
          </p>
        ) : null}
        <div className={styles.versions}>
          {(["device", "account"] as const).map((choice) => {
            const blocked = pendingChoice !== null && pendingChoice !== choice;
            return (
              <VersionColumn
                key={choice}
                at={
                  choice === "device"
                    ? conflict.device.savedAt
                    : conflict.account.updatedAt
                }
                choice={choice}
                content={
                  choice === "device"
                    ? conflict.device.content
                    : conflict.account.content
                }
                deviceClass={
                  choice === "device"
                    ? conflict.device.deviceClass
                    : conflict.account.deviceClass
                }
                differences={differences}
                mediaItems={mediaItems}
                mediaRead={mediaRead}
                onChoose={() => void choose(choice)}
                resolving={resolving === choice}
                unavailable={busy || blocked}
                unavailableNoteId={blocked ? noteId : undefined}
              />
            );
          })}
        </div>
      </div>
    </AuthorDialog>
  );
};
