"use client";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { Icon } from "@moya/ui";
import type { UserWork } from "@moya/contracts";
import { useProductShell } from "../product-shell/product-shell";
import { useAuthors } from "../authors/author-context";
import { usePublishingEntry } from "../publishing/publishing-entry";
import { useSubmission } from "../publishing/publishing-provider";
import { Heat } from "../discussion-preview/discussion-icons";
import styles from "../discussion-preview/discussion-preview.module.css";
import homeStyles from "../home/home-screen.module.css";
import { formatEditorialTime } from "../editorial-content/format-time";
import { authorClient } from "./thread-data";
import { useThread, useThreadPosts } from "./use-threads";

const PostCard = ({
  work,
  onOpen,
}: {
  work: UserWork;
  onOpen: (opener: HTMLElement) => void;
}) => (
  <div className={styles.postCard} data-thread-post={work.id}>
    <span className={styles.postAuthor}>
      <span className={styles.avatar} aria-hidden="true">
        {work.authorName.slice(0, 1)}
      </span>
      <strong>{work.authorName}</strong>
      {work.firstPublishedAt && (
        <time dateTime={work.firstPublishedAt}>
          {formatEditorialTime(work.firstPublishedAt)}
        </time>
      )}
    </span>
    <button
      type="button"
      className={styles.postRead}
      onClick={(event) => onOpen(event.currentTarget)}
      aria-label={`打开${work.authorName}的作品`}
    >
      <span className={styles.postExcerpt}>
        {work.title && <strong>{work.title}</strong>}
        {work.text}
      </span>
      {work.media.length > 0 && (
        <span className={styles.postThumbnails}>
          {work.media.slice(0, 3).map((media) => (
            <img
              key={media.id}
              src={media.src}
              alt=""
              loading="lazy"
              decoding="async"
            />
          ))}
          {work.media.length > 3 && <span>+{work.media.length - 3}</span>}
        </span>
      )}
      <span className={styles.postMeta}>
        <span>打开作品 →</span>
      </span>
    </button>
  </div>
);

/**
 * One Thread: its description, ranking facts and its posts (Works), plus the
 * 参与话题 entry that opens the existing publishing editor in thread mode.
 * Opening records the server-observed read marker for a signed-in reader.
 */
export function ThreadDetail({
  id,
  backButtonRef,
  onClose,
  onOpened,
}: {
  id: string;
  backButtonRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onOpened?: (id: string) => void;
}) {
  const shell = useProductShell();
  const author = useAuthors();
  const { openEditor, checking } = usePublishingEntry();
  const submission = useSubmission();
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const thread = useThread(id);
  const posts = useThreadPosts(id, revision);
  const marked = useRef<string | null>(null);
  useEffect(() => {
    backButtonRef.current?.focus({ preventScroll: true });
  }, [backButtonRef]);
  useEffect(() => {
    onOpened?.(id);
  }, [id, onOpened]);
  // Server read marker for the signed-in reader (never a client instant).
  useEffect(() => {
    const viewer = author.viewer?.id ?? null;
    if (thread.state.state !== "populated" || viewer === null) return;
    const key = `${viewer}:${id}:${thread.state.thread.latestActivityAt ?? ""}`;
    if (marked.current === key) return;
    marked.current = key;
    void authorClient.threads.markRead(id).catch(() => undefined);
  }, [author.viewer?.id, id, thread.state]);
  // A confirmed submission from this Thread's composer refreshes its posts.
  const lastConfirmed = useRef<string | null>(null);
  const submissionState = submission.state;
  const retryThread = thread.retry;
  useEffect(() => {
    if (submissionState.status !== "confirmed") return;
    const key = submissionState.receipt.requestId;
    if (lastConfirmed.current === key) return;
    lastConfirmed.current = key;
    setRevision((value) => value + 1);
    retryThread();
  }, [submissionState, retryThread]);
  const title = "话题";
  return (
    <section
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      data-thread-detail={id}
    >
      <header className={styles.detailHeader}>
        <button
          type="button"
          ref={backButtonRef}
          onClick={onClose}
          aria-label="返回讨论"
        >
          <Icon name="back" aria-hidden="true" />
        </button>
        <h1>{title}</h1>
        <span />
      </header>
      <div className={styles.detailScroll} data-topic-scroll="">
        {thread.state.state !== "populated" ? (
          <section
            className={homeStyles.stateMessage}
            role={thread.state.state === "unavailable" ? "alert" : "status"}
            data-thread-state={thread.state.state}
          >
            <h2>
              {thread.state.state === "loading"
                ? "正在加载"
                : thread.state.state === "missing"
                  ? "话题不可见"
                  : "话题暂时不可用"}
            </h2>
            {thread.state.state === "unavailable" && (
              <button type="button" onClick={thread.retry}>
                重试
              </button>
            )}
          </section>
        ) : (
          <div className={styles.topicPage}>
            <section className={styles.topicIntro}>
              <h2>{thread.state.thread.title}</h2>
              {thread.state.thread.description && (
                <p className={styles.topicDescription} data-expanded={expanded}>
                  {thread.state.thread.description}
                </p>
              )}
              {thread.state.thread.description.length > 95 && (
                <button
                  type="button"
                  className={styles.expandDescription}
                  aria-expanded={expanded}
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? "收起" : "展开"}
                </button>
              )}
              {thread.state.thread.tags.length > 0 && (
                <div className={styles.tags}>
                  {thread.state.thread.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              )}
              <div className={styles.meta}>
                <Heat value={Math.round(thread.state.thread.heat * 100)} />
                <span>{thread.state.thread.postCount} 篇帖子</span>
                {thread.state.thread.status === "closed" && <span>已关闭</span>}
              </div>
            </section>
            <div className={styles.postListHeading}>
              <h3>交流</h3>
              <span>最新在前</span>
            </div>
            {posts.state.state === "populated" ? (
              <div className={styles.posts}>
                {posts.state.items.map((work) => (
                  <PostCard
                    key={work.id}
                    work={work}
                    onOpen={(opener) =>
                      shell.openContent({ type: "work", id: work.id }, opener)
                    }
                  />
                ))}
                {posts.state.hasMore && (
                  <div className={styles.topicAction}>
                    <button
                      type="button"
                      disabled={posts.busy}
                      onClick={posts.loadMore}
                    >
                      {posts.busy ? "正在加载…" : "继续加载"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p
                role={posts.state.state === "unavailable" ? "alert" : "status"}
              >
                {posts.state.state === "loading"
                  ? "正在加载帖子…"
                  : posts.state.state === "empty"
                    ? "还没有帖子，来分享你的观察。"
                    : "帖子暂时不可用。"}
              </p>
            )}
            {thread.state.thread.status === "open" && (
              <div className={styles.topicAction}>
                <button
                  type="button"
                  disabled={checking}
                  data-thread-compose=""
                  onClick={(event) =>
                    openEditor(
                      { type: "new", threadId: id },
                      event.currentTarget,
                    )
                  }
                >
                  <Icon name="edit" aria-hidden="true" />
                  参与话题
                </button>
                <p className={styles.notice}>
                  文字加最多 3 张静态图片；发布后同时出现在你的作品中。
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
