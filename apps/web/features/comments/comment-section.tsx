"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useCommentComposerPortalTarget } from "./comment-composer-portal";
import styles from "./comment-section.module.css";

import type { FormEvent, ReactNode } from "react";
import type { QaCommentScenarioName } from "./comment-scenarios";
import type {
  CommentItem,
  CommentMediaPresentation,
  CommentReply,
  CommentReplyTarget,
  CommentUserPresentation,
} from "./comment-types";

type CommentSort = "hot" | "latest";

/** Who is behind the composer in the live composition. */
export type CommentViewerState =
  | { readonly state: "checking" }
  | { readonly state: "signed-in" }
  | { readonly state: "signed-out"; readonly signInHref: string }
  /** The session service could not answer; never shown as signed out. */
  | { readonly state: "unavailable" };

/**
 * A send handler may report whether the submission was accepted. The QA
 * store returns nothing (always accepted); the live client resolves false on
 * a failure so the draft stays in the composer for another attempt.
 */
export type CommentSendResult = void | Promise<boolean>;

export interface CommentSectionNotice {
  readonly tone: "info" | "error";
  readonly text: string;
}

export interface CommentLoadMore {
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly onLoadMore: () => void;
}

export interface CommentSectionProps {
  readonly catalogId: string;
  readonly currentUser: CommentUserPresentation;
  readonly items: readonly CommentItem[];
  readonly onSendComment: (text: string) => CommentSendResult;
  readonly onSendReply: (
    target: CommentReplyTarget,
    text: string,
  ) => CommentSendResult;
  /** QA only; the live composition hides likes (decision 5). */
  readonly onToggleLike?: (commentId: string, replyId?: string) => void;
  /** QA only; the live composition derives loading from the real client. */
  readonly scenario?: QaCommentScenarioName;
  /**
   * Live composition (scope amendment 2026-09-12): contract-derived props in
   * place of the QA inputs. `hotItems` is the Backend's hot section, rendered
   * above the latest list; the 热门/最新 client-side sort control is hidden.
   */
  readonly presentation?: "qa" | "live";
  readonly hotItems?: readonly CommentItem[];
  readonly loading?: boolean;
  readonly viewer?: CommentViewerState;
  readonly status?: "not-found" | "unavailable" | "unexpected-error" | null;
  readonly notice?: CommentSectionNotice | null;
  /** Root comments the Backend counted; replaces the loaded-item count. */
  readonly totalCount?: number;
  readonly loadMore?: CommentLoadMore;
  readonly onLoadMoreReplies?: (commentId: string) => void;
  readonly submitting?: boolean;
}

const Avatar = ({ user }: { readonly user: CommentUserPresentation }) => (
  <span
    aria-label={`${user.name}的头像`}
    className={styles.avatar}
    data-comment-avatar=""
    role="img"
  >
    {user.avatarSrc === undefined || user.avatarSrc === null ? (
      user.name.trim().slice(0, 1) || "访"
    ) : (
      <img alt="" src={user.avatarSrc} />
    )}
  </span>
);

const CommentContent = ({
  media,
  replyToUser,
  text,
}: {
  readonly media?: readonly CommentMediaPresentation[] | undefined;
  readonly replyToUser?: CommentUserPresentation | undefined;
  readonly text: string;
}) => (
  <>
    <p className={styles.commentText}>
      {replyToUser === undefined ? null : (
        <span className={styles.replyTo}>回复 {replyToUser.name}：</span>
      )}
      {text}
    </p>
    {media === undefined || media.length === 0 ? null : (
      <ul aria-label="评论图片" className={styles.commentMedia}>
        {media.map((item) => (
          <li
            data-comment-media={item.id}
            data-comment-media-kind={item.kind}
            key={item.id}
          >
            <img alt={item.alt} loading="lazy" src={item.src} />
          </li>
        ))}
      </ul>
    )}
  </>
);

const LikeButton = ({
  count,
  liked,
  onClick,
}: {
  readonly count: number;
  readonly liked: boolean;
  readonly onClick: () => void;
}) => (
  <button
    aria-label={liked ? "取消喜欢评论" : "喜欢评论"}
    aria-pressed={liked}
    className={styles.textAction}
    data-comment-like=""
    onClick={onClick}
    type="button"
  >
    <span aria-hidden="true" className={styles.heart}>
      {liked ? "♥" : "♡"}
    </span>
    {count > 0 ? count : "喜欢"}
  </button>
);

const CommentActions = ({
  likeCount,
  liked,
  onLike,
  onReply,
}: {
  readonly likeCount: number;
  readonly liked: boolean;
  /** Absent in the live composition: no like data exists, so no control. */
  readonly onLike?: (() => void) | undefined;
  readonly onReply: () => void;
}) => (
  <div className={styles.actions}>
    <button
      className={styles.textAction}
      data-comment-reply-action=""
      onClick={onReply}
      type="button"
    >
      回复
    </button>
    {onLike === undefined ? null : (
      <LikeButton count={likeCount} liked={liked} onClick={onLike} />
    )}
  </div>
);

const ReplyRow = ({
  commentId,
  onReply,
  onToggleLike,
  reply,
}: {
  readonly commentId: string;
  readonly onReply: (target: CommentReplyTarget) => void;
  readonly onToggleLike?:
    ((commentId: string, replyId?: string) => void) | undefined;
  readonly reply: CommentReply;
}) => (
  <li className={styles.reply} data-comment-reply={reply.id}>
    <Avatar user={reply.user} />
    <div className={styles.commentBody}>
      <p className={styles.userName}>{reply.user.name}</p>
      <CommentContent
        media={reply.media}
        replyToUser={reply.replyToUser}
        text={reply.text}
      />
      <div className={styles.metaRow}>
        <time>{reply.createdAtLabel}</time>
        <CommentActions
          likeCount={reply.likeCount}
          liked={reply.liked}
          onLike={
            onToggleLike === undefined
              ? undefined
              : () => onToggleLike(commentId, reply.id)
          }
          onReply={() =>
            onReply({
              replyId: reply.id,
              rootCommentId: commentId,
              user: reply.user,
            })
          }
        />
      </div>
    </div>
  </li>
);

const CommentRow = ({
  comment,
  expanded,
  onExpandedChange,
  onLoadMoreReplies,
  onReply,
  onToggleLike,
}: {
  readonly comment: CommentItem;
  readonly expanded: boolean;
  readonly onExpandedChange: () => void;
  readonly onLoadMoreReplies?: ((commentId: string) => void) | undefined;
  readonly onReply: (target: CommentReplyTarget) => void;
  readonly onToggleLike?:
    ((commentId: string, replyId?: string) => void) | undefined;
}) => {
  const visibleReplies = expanded
    ? comment.replies
    : comment.replies.slice(0, 2);
  // The Backend's real visible total; more exist only when it says so.
  const remoteRemaining =
    comment.replyTotal === undefined
      ? 0
      : Math.max(0, comment.replyTotal - comment.replies.length);
  return (
    <li className={styles.comment} data-comment-id={comment.id}>
      <Avatar user={comment.user} />
      <div className={styles.commentBody}>
        <p className={styles.userName}>{comment.user.name}</p>
        <CommentContent media={comment.media} text={comment.text} />
        <div className={styles.metaRow}>
          <time>{comment.createdAtLabel}</time>
          <CommentActions
            likeCount={comment.likeCount}
            liked={comment.liked}
            onLike={
              onToggleLike === undefined
                ? undefined
                : () => onToggleLike(comment.id)
            }
            onReply={() =>
              onReply({ rootCommentId: comment.id, user: comment.user })
            }
          />
        </div>
        {visibleReplies.length === 0 ? null : (
          <ul
            aria-label={`${comment.user.name}的回复`}
            className={styles.replies}
          >
            {visibleReplies.map((reply) => (
              <ReplyRow
                commentId={comment.id}
                key={reply.id}
                onReply={onReply}
                onToggleLike={onToggleLike}
                reply={reply}
              />
            ))}
          </ul>
        )}
        {comment.replies.length <= 2 ? null : (
          <button
            aria-expanded={expanded}
            className={styles.expandReplies}
            data-comment-expand-replies=""
            onClick={onExpandedChange}
            type="button"
          >
            {expanded
              ? "收起回复"
              : `展开其余 ${comment.replies.length - 2} 条回复`}
          </button>
        )}
        {onLoadMoreReplies === undefined || remoteRemaining === 0 ? null : (
          <button
            className={styles.expandReplies}
            data-comment-load-more-replies=""
            onClick={() => onLoadMoreReplies(comment.id)}
            type="button"
          >
            查看更多回复（还有 {remoteRemaining} 条）
          </button>
        )}
      </div>
    </li>
  );
};

export const CommentSection = ({
  catalogId,
  currentUser,
  hotItems,
  items,
  loadMore,
  loading: loadingOverride,
  notice,
  onLoadMoreReplies,
  onSendComment,
  onSendReply,
  onToggleLike,
  presentation = "qa",
  scenario,
  status = null,
  submitting = false,
  totalCount,
  viewer,
}: CommentSectionProps) => {
  const [draft, setDraft] = useState("");
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [replyTarget, setReplyTarget] = useState<CommentReplyTarget | null>(
    null,
  );
  const [sort, setSort] = useState<CommentSort>("hot");
  const composerPortalTarget = useCommentComposerPortalTarget();
  const live = presentation === "live";
  const loading = loadingOverride ?? scenario === "comment-loading";
  const hot = hotItems ?? [];
  const count =
    totalCount ??
    [...hot, ...items].reduce(
      (total, comment) => total + 1 + comment.replies.length,
      0,
    );
  const sortedItems = useMemo(() => {
    if (live) return items;
    const local = items.filter((item) => item.isQaGenerated);
    const fixture = items.filter((item) => !item.isQaGenerated);
    return [
      ...local,
      ...(sort === "latest" ? [...fixture].reverse() : fixture),
    ];
  }, [items, live, sort]);
  const toggleExpanded = (commentId: string) =>
    setExpandedCommentIds((current) => {
      const next = new Set(current);
      if (next.has(commentId)) next.delete(commentId);
      else next.add(commentId);
      return next;
    });
  const expandThread = (commentId: string) =>
    setExpandedCommentIds((current) => new Set(current).add(commentId));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0 || submitting) return;
    const target = replyTarget;
    const outcome =
      target === null ? onSendComment(text) : onSendReply(target, text);
    const accepted = () => {
      if (target !== null) expandThread(target.rootCommentId);
      setDraft("");
      setReplyTarget(null);
    };
    // A failed live submission keeps the text; nothing is shown as sent.
    if (outcome instanceof Promise) {
      void outcome.then((ok) => {
        if (ok) accepted();
      });
    } else accepted();
  };
  const composer = (
    <form
      className={styles.composer}
      data-comment-composer=""
      onSubmit={submit}
    >
      <Avatar user={currentUser} />
      <div className={styles.composerBody}>
        {replyTarget === null ? null : (
          <div className={styles.replyMode} data-comment-reply-mode="">
            <span>回复 {replyTarget.user.name}</span>
            <button onClick={() => setReplyTarget(null)} type="button">
              取消
            </button>
          </div>
        )}
        <div className={styles.composerInputRow}>
          <textarea
            aria-label={
              replyTarget === null
                ? "写下你的评论"
                : `回复 ${replyTarget.user.name}`
            }
            onChange={(event) => setDraft(event.currentTarget.value)}
            placeholder="写下你的评论…"
            rows={3}
            value={draft}
          />
          <div className={styles.composerFooter}>
            <span>以“{currentUser.name}”发布</span>
            <button
              disabled={draft.trim().length === 0 || submitting}
              type="submit"
            >
              {submitting ? "发送中…" : "发送"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
  // Signed out, the composer's place carries the truthful state instead.
  const composerSlot: ReactNode =
    viewer === undefined || viewer.state === "signed-in" ? (
      composer
    ) : viewer.state === "signed-out" ? (
      <p className={styles.signedOut} data-comment-signed-out="">
        <a href={viewer.signInHref}>登录</a>后即可发表评论。
      </p>
    ) : viewer.state === "unavailable" ? (
      <p className={styles.signedOut} data-comment-viewer-unavailable="">
        暂时无法确认登录状态，请稍后刷新再试。
      </p>
    ) : null;
  const renderRow = (comment: CommentItem) => (
    <CommentRow
      comment={comment}
      expanded={expandedCommentIds.has(comment.id)}
      key={comment.id}
      onExpandedChange={() => toggleExpanded(comment.id)}
      onLoadMoreReplies={
        onLoadMoreReplies === undefined
          ? undefined
          : (commentId) => {
              expandThread(commentId);
              onLoadMoreReplies(commentId);
            }
      }
      onReply={setReplyTarget}
      onToggleLike={live ? undefined : onToggleLike}
    />
  );

  return (
    <section
      aria-busy={loading}
      aria-labelledby={`comment-title-${catalogId}`}
      className={styles.section}
      data-comment-presentation={presentation}
      data-comment-section=""
      {...(scenario === undefined ? {} : { "data-comment-scenario": scenario })}
    >
      <header className={styles.header}>
        <h2 id={`comment-title-${catalogId}`}>
          评论
          {loading || status !== null ? null : (
            <span aria-label={`${count} 条`}> {count}</span>
          )}
        </h2>
        {loading || live ? null : (
          <label className={styles.sortControl}>
            <span className={styles.visuallyHidden}>评论排序</span>
            <select
              data-comment-sort=""
              onChange={(event) =>
                setSort(event.currentTarget.value as CommentSort)
              }
              value={sort}
            >
              <option value="hot">热门</option>
              <option value="latest">最新</option>
            </select>
          </label>
        )}
      </header>

      {notice === undefined || notice === null ? null : (
        <p
          className={styles.notice}
          data-comment-notice={notice.tone}
          role="status"
        >
          {notice.text}
        </p>
      )}

      {loading ? (
        <div
          aria-label="正在加载评论"
          className={styles.skeleton}
          role="status"
        >
          <span />
          <span />
          <span />
        </div>
      ) : status !== null ? (
        <p className={styles.empty} data-comment-unavailable={status}>
          {status === "not-found"
            ? "这条资料暂不开放评论。"
            : "评论暂时无法加载，请稍后再试。"}
        </p>
      ) : (
        <>
          {composerPortalTarget === null
            ? composerSlot
            : createPortal(composerSlot, composerPortalTarget)}

          {hot.length === 0 ? null : (
            <section
              aria-label="热门评论"
              className={styles.group}
              data-comment-hot=""
            >
              <h3 className={styles.groupLabel}>热门</h3>
              <ul
                aria-live="polite"
                className={styles.list}
                data-comment-list="hot"
              >
                {hot.map(renderRow)}
              </ul>
            </section>
          )}

          {sortedItems.length === 0 ? (
            hot.length === 0 ? (
              <p className={styles.empty} data-comment-empty="">
                还没有评论，来说说你的看法。
              </p>
            ) : null
          ) : (
            <section
              aria-label={hot.length === 0 ? undefined : "最新评论"}
              className={styles.group}
              data-comment-latest=""
            >
              {hot.length === 0 ? null : (
                <h3 className={styles.groupLabel}>最新</h3>
              )}
              <ul
                aria-live="polite"
                className={styles.list}
                data-comment-list=""
              >
                {sortedItems.map(renderRow)}
              </ul>
            </section>
          )}

          {loadMore === undefined || !loadMore.hasMore ? null : (
            <button
              className={styles.loadMore}
              data-comment-load-more=""
              disabled={loadMore.loading}
              onClick={loadMore.onLoadMore}
              type="button"
            >
              {loadMore.loading ? "加载中…" : "加载更多评论"}
            </button>
          )}
        </>
      )}
    </section>
  );
};
