"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";

import { useCommentComposerPortalTarget } from "./comment-composer-portal";
import styles from "./comment-section.module.css";

import type { FormEvent } from "react";
import type { QaCommentScenarioName } from "./comment-scenarios";
import type {
  CommentItem,
  CommentMediaPresentation,
  CommentReply,
  CommentReplyTarget,
  CommentUserPresentation,
} from "./comment-types";

type CommentSort = "hot" | "latest";

export interface CommentSectionProps {
  readonly catalogId: string;
  readonly currentUser: CommentUserPresentation;
  readonly items: readonly CommentItem[];
  readonly onSendComment: (text: string) => void;
  readonly onSendReply: (target: CommentReplyTarget, text: string) => void;
  readonly onToggleLike: (commentId: string, replyId?: string) => void;
  readonly scenario: QaCommentScenarioName;
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
  readonly onLike: () => void;
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
    <LikeButton count={likeCount} liked={liked} onClick={onLike} />
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
  readonly onToggleLike: (commentId: string, replyId?: string) => void;
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
          onLike={() => onToggleLike(commentId, reply.id)}
          onReply={() =>
            onReply({ rootCommentId: commentId, user: reply.user })
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
  onReply,
  onToggleLike,
}: {
  readonly comment: CommentItem;
  readonly expanded: boolean;
  readonly onExpandedChange: () => void;
  readonly onReply: (target: CommentReplyTarget) => void;
  readonly onToggleLike: (commentId: string, replyId?: string) => void;
}) => {
  const visibleReplies = expanded
    ? comment.replies
    : comment.replies.slice(0, 2);
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
            onLike={() => onToggleLike(comment.id)}
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
      </div>
    </li>
  );
};

export const CommentSection = ({
  catalogId,
  currentUser,
  items,
  onSendComment,
  onSendReply,
  onToggleLike,
  scenario,
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
  const loading = scenario === "comment-loading";
  const count = items.reduce(
    (total, comment) => total + 1 + comment.replies.length,
    0,
  );
  const sortedItems = useMemo(() => {
    const local = items.filter((item) => item.isQaGenerated);
    const fixture = items.filter((item) => !item.isQaGenerated);
    return [
      ...local,
      ...(sort === "latest" ? [...fixture].reverse() : fixture),
    ];
  }, [items, sort]);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (text.length === 0) return;
    if (replyTarget === null) onSendComment(text);
    else {
      onSendReply(replyTarget, text);
      setExpandedCommentIds((current) =>
        new Set(current).add(replyTarget.rootCommentId),
      );
    }
    setDraft("");
    setReplyTarget(null);
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
            <button disabled={draft.trim().length === 0} type="submit">
              发送
            </button>
          </div>
        </div>
      </div>
    </form>
  );

  return (
    <section
      aria-busy={loading}
      aria-labelledby={`comment-title-${catalogId}`}
      className={styles.section}
      data-comment-scenario={scenario}
      data-comment-section=""
    >
      <header className={styles.header}>
        <h2 id={`comment-title-${catalogId}`}>
          评论
          {loading ? null : <span aria-label={`${count} 条`}> {count}</span>}
        </h2>
        {loading ? null : (
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
      ) : (
        <>
          {composerPortalTarget === null
            ? composer
            : createPortal(composer, composerPortalTarget)}

          {sortedItems.length === 0 ? (
            <p className={styles.empty} data-comment-empty="">
              还没有评论，来说说你的看法。
            </p>
          ) : (
            <ul aria-live="polite" className={styles.list} data-comment-list="">
              {sortedItems.map((comment) => (
                <CommentRow
                  comment={comment}
                  expanded={expandedCommentIds.has(comment.id)}
                  key={comment.id}
                  onExpandedChange={() =>
                    setExpandedCommentIds((current) => {
                      const next = new Set(current);
                      if (next.has(comment.id)) next.delete(comment.id);
                      else next.add(comment.id);
                      return next;
                    })
                  }
                  onReply={setReplyTarget}
                  onToggleLike={onToggleLike}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
};
