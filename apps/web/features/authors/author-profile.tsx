"use client";
import { Icon } from "@moya/ui";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { AuthorProfile, OwnComment } from "@moya/contracts";
import type { ProductShellProfileOverlayRenderProps } from "../product-shell/product-shell";
import { useProductShell } from "../product-shell/product-shell";
import { HorizontalPager } from "../shell/horizontal-pager";
import type { HorizontalPagerHandle } from "../shell/horizontal-pager";
import { authorClient } from "./author-data";
import { useAuthors } from "./author-context";
import { AvatarEntry } from "./avatar-editor";
import { ProfileEditor } from "./profile-editor";
import { ProfileSettings } from "./profile-settings";
import { ProfileList } from "./profile-list";
import { PeopleList } from "./people-list";
import { TrashPanel } from "../publishing/ui/drafts/trash-panel";
import draftStyles from "../publishing/ui/drafts/drafts.module.css";
import { requestIdentity } from "../shell/request-identity";
import styles from "../user/user-presentation.module.css";
const tabs = ["works", "favorites", "likes", "history"] as const;
const labels = {
  works: "作品",
  favorites: "收藏",
  likes: "喜欢",
  history: "历史",
};
const ScopedAuthorProfileOverlay = ({
  state,
  backButtonRef,
  onClose,
  onViewChange,
}: ProductShellProfileOverlayRenderProps) => {
  const author = useAuthors(),
    shell = useProductShell(),
    id = state.authorId ?? author.viewer?.id ?? null,
    owner = id === author.viewer?.id || id === null,
    cacheKey = `profile:${id}`;
  const [profile, setProfile] = useState<AuthorProfile | null>(
      () => (author.cache.get(cacheKey) as AuthorProfile | undefined) ?? null,
    ),
    [error, setError] = useState(""),
    [modal, setModal] = useState<"edit" | "settings" | "trash" | null>(null),
    [people, setPeople] = useState<"following" | "followers" | null>(null),
    [revision, setRevision] = useState(0),
    [progress, setProgress] = useState(
      Math.max(0, tabs.indexOf(state.tab as (typeof tabs)[number])),
    );
  const root = useRef<HTMLElement>(null),
    pager = useRef<HorizontalPagerHandle<(typeof tabs)[number]>>(null),
    tabId = useId(),
    currentTab = state.tab === "comments" ? "works" : state.tab;
  const visibleTabs = owner ? tabs : tabs.slice(0, 3),
    viewTab = visibleTabs.includes(currentTab as (typeof tabs)[number])
      ? currentTab
      : "works";
  // The recycle bin is the signed-in owner's own: the entry and the panel
  // use this one check, and a panel whose viewer changed closes.
  const trashAllowed = !!profile?.isOwner && profile.id === author.viewer?.id;
  useEffect(() => {
    if (modal === "trash" && !trashAllowed) setModal(null);
  }, [modal, trashAllowed]);
  useEffect(() => {
    let current = true;
    setError("");
    if (!id) {
      setProfile(null);
      return;
    }
    // Keep the loaded profile (and its editor) while the session is rechecked.
    // Cleanup retires any earlier read before a failed check invalidates it.
    if (author.checking || author.sessionError) return;
    void authorClient
      .profile(id)
      .then((result) => {
        if (current) {
          setProfile(result);
          author.cache.set(cacheKey, result);
        }
      })
      .catch((e) => {
        if (current) {
          setProfile(null);
          setError(e.message);
        }
      });
    return () => {
      current = false;
    };
  }, [
    id,
    author.viewer?.id,
    author.checking,
    author.sessionError,
    author.revision,
    revision,
  ]);
  const save = () => setRevision((v) => v + 1);
  const positions = useRef<Record<string, number>>(
    (author.cache.get(`profile-scroll:${state.entryId}`) as
      Record<string, number> | undefined) ?? {},
  );
  const scrollTab = state.tab === "comments" ? "comments" : viewTab;
  useLayoutEffect(() => {
    const node = root.current?.querySelector<HTMLElement>(
      `[data-author-panel="${scrollTab}"]`,
    );
    if (!node) return;
    node.scrollTop =
      state.profileScrollTop || positions.current[scrollTab] || 0;
    const scroll = () => {
      positions.current[scrollTab] = node.scrollTop;
      author.cache.set(`profile-scroll:${state.entryId}`, positions.current);
      onViewChange(scrollTab, node.scrollTop);
    };
    node.addEventListener("scroll", scroll, { passive: true });
    return () => node.removeEventListener("scroll", scroll);
  }, [scrollTab, state.entryId, profile?.isOwner]);
  const panels = Object.fromEntries(
    tabs.map((tab) => [
      tab,
      <div className={styles.panelContent}>
        <ProfileList
          key={`${author.viewer?.id ?? "guest"}:${id}:${tab}:${state.entryId}`}
          authorId={id}
          tab={tab}
          entryId={state.entryId}
          owner={owner}
          active={tab === viewTab && state.tab !== "comments"}
        />
      </div>,
    ]),
  ) as Record<(typeof tabs)[number], ReactNode>;
  const name = profile?.displayName ?? (id ? "作者主页" : "访客");
  return (
    <section
      ref={root}
      role="dialog"
      aria-modal="true"
      aria-label="作者主页"
      className={styles.overlay}
      data-author-profile={id ?? "guest"}
    >
      <header className={styles.header}>
        <button
          type="button"
          ref={backButtonRef}
          aria-label="返回"
          className="yoyi-icon-button"
          onClick={onClose}
        >
          <Icon name="back" />
        </button>
        <strong>{owner ? "我的" : "作者主页"}</strong>
        {owner ? (
          <button
            type="button"
            aria-label="设置"
            className="yoyi-icon-button"
            onClick={() => setModal("settings")}
          >
            <Icon name="settings" />
          </button>
        ) : (
          <span />
        )}
      </header>
      <section
        className={styles.profile}
        aria-label="用户资料"
        data-profile-background-slot=""
      >
        {profile?.isOwner && profile.id === author.viewer?.id ? (
          <AvatarEntry profile={profile} className={styles.avatar}>
            {profile.avatar ? (
              <img src={profile.avatar.src} alt="" width={80} height={80} />
            ) : (
              <span>{name.slice(0, 1)}</span>
            )}
          </AvatarEntry>
        ) : (
          <div
            className={styles.avatar}
            role="img"
            aria-label={`${name}的头像`}
          >
            {profile?.avatar ? (
              <img src={profile.avatar.src} alt="" width={80} height={80} />
            ) : (
              <span>{name.slice(0, 1)}</span>
            )}
          </div>
        )}
        <div className={styles.identity}>
          <h1>{name}</h1>
          {profile ? (
            <>
              <p>@{profile.handle}</p>
              <p>{profile.bio}</p>
              <div className="phase4-actions">
                {profile.totals.following !== null && (
                  <button
                    type="button"
                    onClick={() =>
                      setPeople(people === "following" ? null : "following")
                    }
                  >
                    关注 {profile.totals.following}
                  </button>
                )}
                {profile.totals.followers !== null && (
                  <button
                    type="button"
                    onClick={() =>
                      setPeople(people === "followers" ? null : "followers")
                    }
                  >
                    粉丝 {profile.totals.followers}
                  </button>
                )}
                {profile.isOwner ? (
                  <>
                    <button type="button" onClick={() => setModal("edit")}>
                      编辑资料
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onViewChange(
                          state.tab === "comments" ? "works" : "comments",
                          0,
                        )
                      }
                    >
                      我的评论
                    </button>
                    {/* The same check as the panel: a cached profile after an
                        account switch never offers an entry that opens nothing. */}
                    {trashAllowed && (
                      <button
                        type="button"
                        aria-haspopup="dialog"
                        className={draftStyles.profileEntry}
                        onClick={() => setModal("trash")}
                      >
                        回收站
                      </button>
                    )}
                  </>
                ) : author.viewer ? (
                  <>
                    <button
                      type="button"
                      aria-pressed={profile.following}
                      onClick={async () => {
                        try {
                          await authorClient.command("relationships/follow", {
                            requestId: requestIdentity(),
                            targetId: profile.id,
                            enabled: !profile.following,
                          });
                          save();
                          author.mutate();
                        } catch (e) {
                          author.notify(
                            e instanceof Error ? e.message : "关注未完成",
                          );
                        }
                      }}
                    >
                      {profile.following ? "取消关注" : "关注"}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        if (
                          !window.confirm(
                            `屏蔽 ${profile.displayName}？双方的关注将移除。`,
                          )
                        )
                          return;
                        try {
                          await authorClient.command("relationships/block", {
                            requestId: requestIdentity(),
                            targetId: profile.id,
                            enabled: true,
                          });
                          author.mutate();
                          onClose();
                        } catch (e) {
                          author.notify(
                            e instanceof Error ? e.message : "屏蔽未完成",
                          );
                        }
                      }}
                    >
                      屏蔽
                    </button>
                  </>
                ) : (
                  <a href={author.signInHref}>登录后关注</a>
                )}
              </div>
              {people &&
                (profile.isOwner || profile.privacy[people] === "public") && (
                  <PeopleList
                    key={`${author.viewer?.id ?? "guest"}:${profile.id}:${people}`}
                    id={profile.id}
                    list={people}
                    revision={author.revision}
                  />
                )}
            </>
          ) : !id ? (
            <>
              <p>无需登录即可浏览与搜索。登录后可跨设备收藏、喜欢、关注。</p>
              <div className="phase4-actions">
                <a href={author.signInHref}>使用开发测试账户登录</a>
              </div>
            </>
          ) : null}
          {error && <p role="alert">{error}</p>}
        </div>
      </section>
      {state.tab === "comments" && profile?.isOwner ? (
        <div
          data-author-panel="comments"
          style={{ overflow: "auto", minHeight: 0 }}
          className={styles.panelContent}
        >
          <MyComments entryId={state.entryId} />
        </div>
      ) : (
        <section className={styles.userContent} aria-label="用户内容">
          <div className={styles.tabs} role="tablist" aria-label="用户内容分类">
            {visibleTabs.map((tab) => (
              <button
                type="button"
                key={tab}
                role="tab"
                id={`${tabId}-${tab}`}
                aria-controls={`${tabId}-panel-${tab}`}
                aria-selected={viewTab === tab}
                tabIndex={viewTab === tab ? 0 : -1}
                onClick={() => pager.current?.scrollToKey(tab)}
                onKeyDown={(event) => {
                  const index = visibleTabs.indexOf(tab);
                  const next =
                    event.key === "ArrowRight"
                      ? visibleTabs[Math.min(index + 1, visibleTabs.length - 1)]
                      : event.key === "ArrowLeft"
                        ? visibleTabs[Math.max(0, index - 1)]
                        : undefined;
                  if (next) {
                    event.preventDefault();
                    pager.current?.scrollToKey(next);
                    root.current
                      ?.querySelector<HTMLElement>(`[id="${tabId}-${next}"]`)
                      ?.focus();
                  }
                }}
              >
                {labels[tab]}
              </button>
            ))}
            <span
              aria-hidden
              className={styles.tabIndicator}
              style={{
                width: `${100 / visibleTabs.length}%`,
                transform: `translateX(${progress * 100}%)`,
              }}
            />
          </div>
          <HorizontalPager
            ref={pager}
            keys={visibleTabs}
            activeKey={viewTab as (typeof tabs)[number]}
            onCommit={(tab) => onViewChange(tab, positions.current[tab] ?? 0)}
            onProgress={setProgress}
            panels={panels}
            platform={shell.platform}
            scrollOwner="panel"
            visible={modal === null}
            frameClassName={styles.pager}
            panelClassName={styles.panel}
            panelAttributes={(tab) => ({ "data-author-panel": tab })}
            panelId={(tab) => `${tabId}-panel-${tab}`}
            panelLabelledBy={(tab) => `${tabId}-${tab}`}
          />
        </section>
      )}
      {profile && modal === "edit" && (
        <ProfileEditor
          profile={profile}
          onClose={() => setModal(null)}
          onSaved={save}
        />
      )}{" "}
      {profile && trashAllowed && modal === "trash" && (
        <TrashPanel
          key={profile.id}
          onClose={() => setModal(null)}
          // A restored work returns to the owner's lists as self-only.
          onRestored={() => author.mutate()}
        />
      )}
      {owner && modal === "settings" && (
        <ProfileSettings
          key={profile?.id ?? "guest"}
          profile={profile}
          onClose={() => setModal(null)}
          onSaved={save}
        />
      )}
    </section>
  );
};
const MyComments = ({ entryId }: { entryId: string }) => {
  const author = useAuthors(),
    shell = useProductShell();
  const cacheKey = `own-comments:${author.viewer?.id}:${entryId}`;
  type Snapshot = { items: OwnComment[]; page: number; total: number };
  const [snapshot, setSnapshot] = useState<Snapshot>(
    () =>
      (author.cache.get(cacheKey) as Snapshot) ?? {
        items: [],
        page: 0,
        total: 0,
      },
  );
  const { items, page, total } = snapshot;
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const lock = useRef(false),
    epoch = useRef(0),
    failed = useRef<number | null>(null),
    deletionLock = useRef(false);
  const saveSnapshot = (next: Snapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
    author.cache.set(cacheKey, next);
  };
  const load = async (n = 0) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const run = epoch.current;
    try {
      const last = n || Math.max(1, snapshotRef.current.page);
      const collected: OwnComment[] = [];
      let count = 0;
      for (let current = n || 1; current <= last; current++) {
        const result = await authorClient.comments(current);
        if (run !== epoch.current) return;
        collected.push(...result.items);
        count = result.total;
      }
      const merged =
        n > 1 ? [...snapshotRef.current.items, ...collected] : collected;
      saveSnapshot({
        items: [...new Map(merged.map((item) => [item.id, item])).values()],
        page: last,
        total: count,
      });
      failed.current = null;
    } catch (e) {
      if (run === epoch.current) {
        failed.current = n;
        setError(e instanceof Error ? e.message : "评论记录不可用");
      }
    } finally {
      if (run === epoch.current) {
        lock.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    void load();
    return () => {
      epoch.current++;
      lock.current = false;
    };
  }, [author.viewer?.id, author.revision]);
  return (
    <section>
      <h2>我的评论</h2>
      <p className="phase4-muted">
        仅自己可见。不可用的第三方内容不显示上下文。
      </p>
      <ul className="phase4-comment-list">
        {items.map((item) => (
          <li key={item.id}>
            <p>{item.text}</p>
            <small>{new Date(item.createdAt).toLocaleString()}</small>
            <div className="phase4-actions">
              {item.target ? (
                <button
                  type="button"
                  onClick={(event) => {
                    author.cache.set("discussion-location", {
                      target: item.target,
                      id: item.id,
                    });
                    shell.openContent(item.target!, event.currentTarget);
                  }}
                >
                  前往评论位置
                </button>
              ) : (
                <span>目标内容或讨论已不可用</span>
              )}
              {!item.deleted && (
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !window.confirm("删除这条评论正文？其他人的回复会保留。")
                    )
                      return;
                    if (deletionLock.current) return;
                    deletionLock.current = true;
                    const run = epoch.current;
                    try {
                      await authorClient.command(
                        `discussion/items/${item.id}/body`,
                        { requestId: requestIdentity() },
                        "DELETE",
                      );
                      if (run !== epoch.current) return;
                      saveSnapshot({
                        ...snapshotRef.current,
                        items: snapshotRef.current.items.map((current) =>
                          current.id === item.id
                            ? {
                                ...current,
                                text: "该正文已删除",
                                deleted: true,
                              }
                            : current,
                        ),
                      });
                      await load();
                      author.mutate();
                    } catch (e) {
                      if (run === epoch.current)
                        setError(e instanceof Error ? e.message : "删除失败");
                    } finally {
                      deletionLock.current = false;
                    }
                  }}
                >
                  删除正文
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {items.length < total && (
        <button
          className="phase4-button"
          disabled={busy}
          onClick={() => void load(page + 1)}
        >
          加载更多
        </button>
      )}
      {busy && <p role="status">读取中…</p>}
      {error && (
        <p role="alert">
          {error}
          <button
            type="button"
            disabled={busy}
            onClick={() => void load(failed.current ?? 0)}
          >
            重试读取
          </button>
        </p>
      )}
    </section>
  );
};

export const AuthorProfileOverlay = (
  props: ProductShellProfileOverlayRenderProps,
) => {
  const author = useAuthors();
  return (
    <ScopedAuthorProfileOverlay
      key={`${author.viewer?.id ?? "guest"}:${props.state.entryId}`}
      {...props}
    />
  );
};
