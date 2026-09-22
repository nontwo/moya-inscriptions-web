"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@moya/ui";
import type { ContentIdentity } from "@moya/contracts";
import { QuickActionIcon } from "../quick-actions/quick-action-card-action";
import { AuthorDialog } from "./author-dialog";
import { MyComments } from "./author-profile";
import { useAuthors } from "./author-context";
import { useProductShell } from "../product-shell/product-shell";
import type { PrimaryDestination } from "../shell/primary-shell";
import {
  useDiscussionPreview,
  type PreviewCommentLocation,
} from "../discussion-preview/preview-context";
import styles from "./message-center.module.css";
import { LiveMessageTrigger } from "../notifications/live-message-center";
import { MessagePreview } from "./message-preview";
import {
  DirectMessagePanel,
  useDirectMessageEntry,
  useUnreadConversationCount,
} from "../messages";
const sections = ["direct", "likes", "favorites", "comments"] as const;
type Section = (typeof sections)[number];
const labels = {
  direct: "私信",
  likes: "点赞",
  favorites: "收藏",
  comments: "我的评论",
};
export function MessageTrigger({
  unreadCount = 0,
  developmentPreview = false,
  liveNotifications = false,
}: {
  readonly unreadCount?: number;
  readonly developmentPreview?: boolean;
  readonly liveNotifications?: boolean;
}) {
  const author = useAuthors();
  if (liveNotifications) return <LiveMessageTrigger />;
  return (
    <ScopedMessageTrigger
      key={author.viewer?.id ?? "guest"}
      unreadCount={unreadCount}
      developmentPreview={developmentPreview}
    />
  );
}
function ScopedMessageTrigger({
  unreadCount,
  developmentPreview,
}: {
  readonly unreadCount: number;
  readonly developmentPreview: boolean;
}) {
  const author = useAuthors();
  const shell = useProductShell();
  const discussionPreview = useDiscussionPreview();
  const opener = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<Section>("direct");
  // content-community-completion-v1: real direct messages in the 私信 tab. The
  // DM unread unit (unread conversations) joins the supplied activity count
  // exactly once; a profile's 私信 action opens this center on that pair.
  const directEntry = useDirectMessageEntry();
  const unreadConversations = useUnreadConversationCount();
  const [directDepth, setDirectDepth] = useState(0);
  const [directBack, setDirectBack] = useState(0);
  const [directOpenWith, setDirectOpenWith] = useState<{
    userId: string;
    displayName: string;
  } | null>(null);
  const consumedEntry = useRef<number | null>(null);
  useEffect(() => {
    const request = directEntry?.request;
    if (!request || consumedEntry.current === request.token) return;
    // The header (and this trigger) is mounted once per primary destination;
    // only the instance inside the active destination opens the dialog.
    const host = opener.current?.closest<HTMLElement>(
      "[data-primary-destination]",
    );
    if (host && host.dataset.active !== "true") return;
    consumedEntry.current = request.token;
    directEntry.consume(request.token);
    setDirectOpenWith({
      userId: request.userId,
      displayName: request.displayName,
    });
    setActive("direct");
    setCloseRequested(false);
    setPreviewCommentTab(null);
    setOpen(true);
  }, [directEntry]);
  const [closeRequested, setCloseRequested] = useState(false);
  const [previewCommentTab, setPreviewCommentTab] = useState<
    "received" | "sent" | null
  >(null);
  const pending = useRef<ContentIdentity | null>(null);
  const pendingPreviewComment = useRef<{
    location: PreviewCommentLocation;
    sourceTab: "received" | "sent";
    sourceDestination: PrimaryDestination;
  } | null>(null);
  const previewCommentReturn = useRef<{
    topicId: string;
    sourceTab: "received" | "sent";
    sourceDestination: PrimaryDestination;
    opened: boolean;
  } | null>(null);
  const frame = useRef<number | null>(null);
  const confirmedAccount = useRef<string | null>(null);
  confirmedAccount.current =
    !author.checking && !author.sessionError
      ? (author.viewer?.id ?? null)
      : null;
  const unread =
    confirmedAccount.current && Number.isFinite(unreadCount)
      ? Math.max(0, Math.floor(unreadCount)) + unreadConversations
      : 0;
  const badge = unread > 99 ? "99+" : String(unread);
  useEffect(
    () => () => {
      pending.current = null;
      pendingPreviewComment.current = null;
      previewCommentReturn.current = null;
      confirmedAccount.current = null;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );
  useEffect(() => {
    const target = previewCommentReturn.current;
    if (!target) return;
    if (shell.activeTopicId === target.topicId) {
      target.opened = true;
      return;
    }
    if (!target.opened || shell.activeTopicId !== null) return;
    previewCommentReturn.current = null;
    shell.navigatePrimary(target.sourceDestination);
    setCloseRequested(false);
    setPreviewCommentTab(target.sourceTab);
    setOpen(true);
  }, [shell.activeTopicId]);
  return (
    <>
      <button
        ref={opener}
        type="button"
        className={styles.trigger}
        aria-label={unread > 0 ? `打开消息，${badge} 条未读消息` : "打开消息"}
        onClick={() => {
          setCloseRequested(false);
          setPreviewCommentTab(null);
          setOpen(true);
        }}
      >
        <Icon name="message" aria-hidden="true" />
        {unread > 0 && (
          <span
            className={styles.badge}
            data-message-unread-badge=""
            aria-hidden="true"
          >
            {badge}
          </span>
        )}
      </button>
      {open && developmentPreview ? (
        <MessagePreview
          closeRequested={closeRequested}
          initialCommentTab={previewCommentTab ?? "received"}
          initialView={previewCommentTab === null ? "home" : "comments"}
          onOpenComment={(location, sourceTab) => {
            if (!discussionPreview) return;
            discussionPreview.queueCommentLocation(location);
            pendingPreviewComment.current = {
              location,
              sourceTab,
              sourceDestination: shell.activeDestination,
            };
            setCloseRequested(true);
          }}
          onClose={() => {
            setOpen(false);
            setCloseRequested(false);
            setPreviewCommentTab(null);
            const target = pendingPreviewComment.current;
            pendingPreviewComment.current = null;
            if (!target || !discussionPreview) return;
            frame.current = requestAnimationFrame(() => {
              frame.current = null;
              const targetOpener = opener.current;
              if (!targetOpener) return;
              previewCommentReturn.current = {
                topicId: target.location.topicId,
                sourceTab: target.sourceTab,
                sourceDestination: target.sourceDestination,
                opened: false,
              };
              shell.navigatePrimary("discussion");
              shell.openTopic(target.location.topicId, targetOpener, 0);
            });
          }}
        />
      ) : open ? (
        <AuthorDialog
          title="消息"
          className={styles.page}
          closeRequested={closeRequested}
          navigationDepth={active === "direct" ? directDepth : 0}
          onBack={() => setDirectBack((value) => value + 1)}
          onClose={() => {
            setOpen(false);
            setCloseRequested(false);
            setDirectOpenWith(null);
            setDirectDepth(0);
            const target = pending.current;
            pending.current = null;
            const account = confirmedAccount.current;
            if (target && account)
              frame.current = requestAnimationFrame(() => {
                frame.current = null;
                if (confirmedAccount.current === account && opener.current)
                  shell.openContent(target, opener.current);
              });
          }}
        >
          <div role="tablist" aria-label="消息类型" className={styles.tabs}>
            {sections.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active === id}
                aria-controls={
                  active === id ? `message-panel-${id}` : undefined
                }
                tabIndex={active === id ? 0 : -1}
                id={`message-tab-${id}`}
                onClick={() => setActive(id)}
                onKeyDown={(event) => {
                  const index = sections.indexOf(id);
                  const next =
                    event.key === "ArrowRight"
                      ? sections[(index + 1) % sections.length]
                      : event.key === "ArrowLeft"
                        ? sections[
                            (index + sections.length - 1) % sections.length
                          ]
                        : event.key === "Home"
                          ? sections[0]
                          : event.key === "End"
                            ? sections[sections.length - 1]
                            : undefined;
                  if (!next) return;
                  event.preventDefault();
                  setActive(next);
                  document.getElementById(`message-tab-${next}`)?.focus();
                }}
              >
                {labels[id]}
              </button>
            ))}
          </div>
          <section
            role="tabpanel"
            id={`message-panel-${active}`}
            aria-labelledby={`message-tab-${active}`}
          >
            {active === "comments" ? (
              author.checking ? (
                <p role="status">正在加载账户…</p>
              ) : author.sessionError ? (
                <p role="alert">账户暂时不可用，请稍后重试。</p>
              ) : !author.viewer ? (
                <p>
                  <a href={author.signInHref}>登录后查看我的评论</a>
                </p>
              ) : (
                <MyComments
                  key={author.viewer?.id ?? "guest"}
                  entryId={`messages-${author.viewer?.id ?? "guest"}`}
                  onOpenContent={(target) => {
                    if (!confirmedAccount.current) return;
                    pending.current = target;
                    setCloseRequested(true);
                  }}
                />
              )
            ) : active === "direct" ? (
              <DirectMessagePanel
                key={author.viewer?.id ?? "guest"}
                openWith={directOpenWith}
                onDepthChange={setDirectDepth}
                backRequested={directBack}
                onOpenProfile={(userId, profileOpener) => {
                  if (!confirmedAccount.current) return;
                  shell.openProfile(userId, profileOpener);
                }}
              />
            ) : (
              <div className={styles.empty}>
                <QuickActionIcon
                  action={active === "likes" ? "like" : "favorite"}
                />
                <h3>{active === "likes" ? "暂无点赞消息" : "暂无收藏消息"}</h3>
                <p>
                  {active === "likes"
                    ? "作品收到的点赞会在这里展示。"
                    : "作品收到的收藏会在这里展示。"}
                </p>
              </div>
            )}
          </section>
        </AuthorDialog>
      ) : null}
    </>
  );
}
