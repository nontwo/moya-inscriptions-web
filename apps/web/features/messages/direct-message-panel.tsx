"use client";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Icon } from "@moya/ui";
import type { DirectConversation } from "@moya/contracts";
import { useAuthors } from "../authors/author-context";
import { useProductShell } from "../product-shell/product-shell";
import { requestIdentity } from "../shell/request-identity";
import commentStyles from "../comments/comment-section.module.css";
import styles from "../authors/message-preview.module.css";
import { formatEditorialTime } from "../editorial-content/format-time";
import { authorClient } from "./message-data";
import {
  findConversationWith,
  startConversationWith,
  useConversation,
  useConversations,
} from "./use-direct-messages";

const UNDO_NOTICE_MS = 4000;
const TEXT_MAXIMUM = 2000;

const initial = (name: string) => name.trim().slice(0, 1) || "友";

const Avatar = ({ name, onOpen }: { name: string; onOpen?: () => void }) =>
  onOpen ? (
    <button
      type="button"
      className={styles.smallAvatar}
      aria-label={`查看${name}的主页`}
      onClick={onOpen}
    >
      {initial(name)}
    </button>
  ) : (
    <span className={styles.smallAvatar} aria-hidden="true">
      {initial(name)}
    </span>
  );

const refusalText = (conversation: DirectConversation): string | null =>
  conversation.sendRefusal === "request_pending"
    ? "你已发送一条私信，等对方回复后才能继续发送。"
    : conversation.sendRefusal === "blocked"
      ? "对方目前不接受你的私信。"
      : conversation.sendRefusal === "unavailable"
        ? "对方账号暂不可用。"
        : null;

/** A fixed bottom composer; drafts survive refusals and the text is plain. */
const Composer = ({
  disabledReason,
  onSend,
  autoFocus = false,
}: {
  disabledReason: string | null;
  onSend: (
    text: string,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  autoFocus?: boolean;
}) => {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy || disabledReason) return;
    setBusy(true);
    setError(null);
    const result = await onSend(text);
    setBusy(false);
    if (result.ok) setDraft("");
    else setError(result.message);
  };
  return (
    <form
      className={`${commentStyles.composer} ${styles.chatComposer}`}
      data-message-composer=""
      onSubmit={submit}
    >
      {disabledReason ? (
        <p role="status" className={styles.notice} data-dm-refusal="">
          {disabledReason}
        </p>
      ) : (
        <>
          <textarea
            value={draft}
            maxLength={TEXT_MAXIMUM * 2}
            rows={1}
            placeholder="写下私信…"
            aria-label="私信内容"
            autoFocus={autoFocus}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" disabled={busy || !draft.trim()}>
            发送
          </button>
        </>
      )}
      {error && (
        <p role="alert" className={styles.notice} data-dm-error="">
          {error}
        </p>
      )}
    </form>
  );
};

const ConversationView = ({
  id,
  onOpenProfile,
}: {
  id: string;
  onOpenProfile: (userId: string, opener: HTMLElement) => void;
}) => {
  const author = useAuthors();
  const { state, loadOlder, send } = useConversation(id, true);
  const stream = useRef<HTMLDivElement>(null);
  const count = state.state === "populated" ? state.messages.length : 0;
  useEffect(() => {
    stream.current?.scrollTo?.({
      top: stream.current.scrollHeight,
      behavior: "auto",
    });
  }, [count]);
  if (state.state !== "populated")
    return (
      <p
        role={state.state === "unavailable" ? "alert" : "status"}
        className={styles.notice}
      >
        {state.state === "loading" ? "正在加载对话…" : state.message}
      </p>
    );
  const me = author.viewer?.id;
  return (
    <div
      className={styles.conversation}
      data-dm-conversation={id}
      data-dm-state={state.conversation.state}
    >
      <div className={styles.chatTitle}>
        <Avatar
          name={state.conversation.participant.displayName}
          onOpen={() => {
            const opener =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : document.body;
            onOpenProfile(state.conversation.participant.id, opener);
          }}
        />
        <strong>{state.conversation.participant.displayName}</strong>
        {state.conversation.muted && (
          <span className={styles.mutedMark} aria-label="已静音" />
        )}
      </div>
      <div className={styles.chatStream} ref={stream} data-dm-stream="">
        {state.hasOlder && (
          <button
            type="button"
            className={styles.secondary}
            onClick={() => void loadOlder()}
          >
            加载更早的消息
          </button>
        )}
        {state.messages.map((message) => (
          <div
            key={message.id}
            data-dm-message={message.sequence}
            data-dm-removed={message.removed}
          >
            <p
              className={
                message.senderId === me
                  ? styles.sentBubble
                  : styles.receivedBubble
              }
            >
              {message.removed ? <em>此消息已被移除</em> : message.text}
            </p>
            <time className={styles.chatTime} dateTime={message.createdAt}>
              {formatEditorialTime(message.createdAt)}
            </time>
          </div>
        ))}
        {state.conversation.state === "requested" &&
          state.conversation.sendRefusal === "request_pending" && (
            <p role="status" className={styles.notice} data-dm-gate="">
              对方尚未回复。收到回复后即可继续交流。
            </p>
          )}
      </div>
      <Composer
        disabledReason={refusalText(state.conversation)}
        onSend={send}
      />
    </div>
  );
};

/** First message to an account without a conversation yet; opening sends nothing. */
const StartConversation = ({
  userId,
  displayName,
  onStarted,
}: {
  userId: string;
  displayName: string;
  onStarted: (conversationId: string) => void;
}) => (
  <div className={styles.conversation} data-dm-start={userId}>
    <div className={styles.chatTitle}>
      <Avatar name={displayName} />
      <strong>{displayName}</strong>
    </div>
    <div className={styles.chatStream}>
      <p role="status" className={styles.notice}>
        发送第一条私信后，需等待对方回复才能继续发送。
      </p>
    </div>
    <Composer
      disabledReason={null}
      autoFocus
      onSend={async (text) => {
        const result = await startConversationWith(userId, text);
        if (result.ok) onStarted(result.conversationId);
        return result.ok ? { ok: true } : result;
      }}
    />
  </div>
);

export interface DirectMessagePanelProps {
  /** Open straight into the conversation with this account (from a profile). */
  readonly openWith?: {
    readonly userId: string;
    readonly displayName: string;
  } | null;
  readonly onOpenProfile: (userId: string, opener: HTMLElement) => void;
  /** Reports whether a child conversation is open so the host's Back returns one level. */
  readonly onDepthChange?: (depth: number) => void;
  readonly backRequested?: number;
}

/**
 * The 私信 panel content-community-completion-v1 supplies to the message-center
 * host: a real conversation list with hide (timed Undo) and mute, and a real
 * conversation view over the same-origin API. Nothing here is a preview.
 */
export const DirectMessagePanel = ({
  openWith = null,
  onOpenProfile,
  onDepthChange,
  backRequested = 0,
}: DirectMessagePanelProps) => {
  const author = useAuthors();
  const shell = useProductShell();
  const conversations = useConversations(author.viewer !== null);
  const [open, setOpen] = useState<string | null>(null);
  const [starting, setStarting] = useState<{
    userId: string;
    displayName: string;
  } | null>(null);
  const [undo, setUndo] = useState<{
    conversation: DirectConversation;
    until: number;
  } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const handled = useRef<string | null>(null);
  useEffect(() => {
    onDepthChange?.(open || starting ? 1 : 0);
  }, [open, starting, onDepthChange]);
  useEffect(() => {
    if (backRequested > 0) {
      setOpen(null);
      setStarting(null);
    }
  }, [backRequested]);
  // A profile's private-message action: resolve the canonical pair, never create it here.
  useEffect(() => {
    if (!openWith || !author.viewer) return;
    const key = `${author.viewer.id}:${openWith.userId}`;
    if (handled.current === key) return;
    handled.current = key;
    void findConversationWith(openWith.userId)
      .then((conversation) => {
        if (conversation) setOpen(conversation.id);
        else setStarting(openWith);
      })
      .catch(() => setStarting(openWith));
  }, [openWith, author.viewer?.id]);
  useEffect(() => {
    if (!undo && !notice) return;
    const timer = window.setTimeout(() => {
      setUndo(null);
      setNotice(null);
    }, UNDO_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [undo, notice]);
  if (author.checking) return <p role="status">正在加载账户…</p>;
  if (author.sessionError)
    return <p role="alert">账户暂时不可用，请稍后重试。</p>;
  if (!author.viewer)
    return (
      <p>
        <a href={author.signInHref}>登录后查看私信</a>
      </p>
    );
  if (starting)
    return (
      <StartConversation
        userId={starting.userId}
        displayName={starting.displayName}
        onStarted={(conversationId) => {
          setStarting(null);
          setOpen(conversationId);
          void conversations.refresh();
        }}
      />
    );
  if (open) return <ConversationView id={open} onOpenProfile={onOpenProfile} />;
  const hide = async (conversation: DirectConversation) => {
    try {
      const hidden = await authorClient.messages.participant(
        conversation.id,
        "hide",
        requestIdentity(),
      );
      conversations.remove(hidden.id);
      setUndo({ conversation: hidden, until: Date.now() + UNDO_NOTICE_MS });
      setNotice("已删除对话");
    } catch {
      setNotice("删除未完成，请重试");
    }
  };
  const undoHide = async () => {
    if (!undo) return;
    try {
      // Restores only the version being undone; a newer state is never overwritten.
      await authorClient.messages.participant(
        undo.conversation.id,
        "unhide",
        requestIdentity(),
      );
      setUndo(null);
      setNotice("已恢复对话");
      await conversations.refresh();
    } catch {
      setNotice("恢复未完成，请重试");
    }
  };
  const toggleMute = async (conversation: DirectConversation) => {
    try {
      const updated = await authorClient.messages.participant(
        conversation.id,
        conversation.muted ? "unmute" : "mute",
        requestIdentity(),
      );
      conversations.replace(updated);
      setNotice(updated.muted ? "已静音" : "已取消静音");
    } catch {
      setNotice("操作未完成，请重试");
    }
  };
  const list = conversations.state;
  return (
    <div className={styles.conversationList} data-dm-list="">
      {notice && (
        <p role="status" className={styles.notice} data-dm-notice="">
          {notice}
          {undo && (
            <button type="button" onClick={() => void undoHide()}>
              撤销
            </button>
          )}
        </p>
      )}
      {list.state === "loading" && <p role="status">正在加载私信…</p>}
      {list.state === "unavailable" && (
        <p role="alert">
          {list.message}{" "}
          <button type="button" onClick={() => void conversations.refresh()}>
            重试
          </button>
        </p>
      )}
      {list.state === "empty" && (
        <div className={styles.empty}>
          <Icon name="message" aria-hidden="true" />
          <h3>暂无私信</h3>
          <p>在他人主页点击「私信」即可开始对话。</p>
        </div>
      )}
      {list.state === "populated" && (
        <ul>
          {list.items.map((conversation) => (
            <li
              key={conversation.id}
              className={styles.swipeRow}
              data-dm-row={conversation.id}
            >
              <div className={styles.rowFront}>
                <Avatar
                  name={conversation.participant.displayName}
                  onOpen={() => {
                    const opener =
                      document.activeElement instanceof HTMLElement
                        ? document.activeElement
                        : document.body;
                    onOpenProfile(conversation.participant.id, opener);
                  }}
                />
                <button
                  type="button"
                  className={styles.conversationBody}
                  onClick={() => setOpen(conversation.id)}
                  aria-label={`打开与${conversation.participant.displayName}的私信`}
                >
                  <span className={styles.rowHeading}>
                    <strong>{conversation.participant.displayName}</strong>
                    {conversation.lastMessage && (
                      <time dateTime={conversation.lastMessage.createdAt}>
                        {formatEditorialTime(
                          conversation.lastMessage.createdAt,
                        )}
                      </time>
                    )}
                  </span>
                  <span className={styles.rowPreview}>
                    {conversation.lastMessage
                      ? conversation.lastMessage.removed
                        ? "此消息已被移除"
                        : conversation.lastMessage.text
                      : "尚无消息"}
                  </span>
                  {conversation.state === "requested" && (
                    <span className={styles.notice}>
                      {conversation.sendRefusal === "request_pending"
                        ? "等待对方回复"
                        : "私信请求"}
                    </span>
                  )}
                </button>
                {conversation.unreadCount > 0 && !conversation.muted && (
                  <span
                    className={styles.unread}
                    data-dm-unread={conversation.unreadCount}
                  >
                    {conversation.unreadCount > 99
                      ? "99+"
                      : conversation.unreadCount}
                  </span>
                )}
                {conversation.muted && (
                  <span className={styles.mutedMark} aria-label="已静音" />
                )}
              </div>
              <div className={styles.rowActions}>
                <button
                  type="button"
                  onClick={() => void toggleMute(conversation)}
                  aria-label={conversation.muted ? "取消静音" : "静音"}
                >
                  {conversation.muted ? "取消静音" : "静音"}
                </button>
                <button
                  type="button"
                  onClick={() => void hide(conversation)}
                  aria-label="删除对话"
                >
                  删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {list.state === "populated" && list.nextCursor && (
        <button
          type="button"
          className={styles.secondary}
          onClick={() => void conversations.loadMore()}
        >
          继续加载
        </button>
      )}
      <p className={styles.previewNote}>
        私信为纯文本，每 10 秒在前台自动刷新；删除仅对自己隐藏。
      </p>
      {shell.platform === "phone" ? null : null}
    </div>
  );
};

export { useUnreadConversationCount } from "./direct-message-entry";
