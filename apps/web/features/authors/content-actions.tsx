"use client";
import { useEffect, useRef, useState } from "react";
import type { ContentIdentity } from "@moya/contracts";
import type { ContentQuickActionEnvironment } from "../quick-actions/quick-action-types";
import { quickActionContentKey } from "../quick-actions/quick-action-types";
import { useAuthors, shareContent, contentKey } from "./author-context";
import { authorClient } from "./author-data";
export const useContentActions = (target: ContentIdentity, title: string) => {
  const author = useAuthors(),
    key = `${author.viewer?.id ?? "guest"}:${contentKey(target)}`;
  const [snapshot, setSnapshot] = useState({
      key,
      favorite: false,
      liked: false,
      known: false,
    }),
    [busy, setBusy] = useState(false),
    scope = useRef(key),
    inFlight = useRef(false);
  scope.current = key;
  const state =
    snapshot.key === key
      ? snapshot
      : { key, favorite: false, liked: false, known: false };
  useEffect(() => {
    let current = true;
    if (author.checking) return;
    if (!author.viewer) {
      setSnapshot({
        key,
        favorite: author.guestFavorites.some(
          (x) => contentKey(x) === contentKey(target),
        ),
        liked: false,
        known: true,
      });
      return;
    }
    void authorClient
      .state(target)
      .then((value) => {
        if (current && scope.current === key)
          setSnapshot({ key, ...value, known: true });
      })
      .catch(() => {
        /* Same-scope failures preserve known state; another account starts unknown. */
      });
    return () => {
      current = false;
    };
  }, [key, author.checking, author.revision, author.guestFavorites]);
  const execute: ContentQuickActionEnvironment["onAction"] = async (action) => {
    if (inFlight.current) return false;
    if (action !== "share" && !state.known) {
      author.notify("内容状态尚未确认，请稍后重试");
      return false;
    }
    inFlight.current = true;
    setBusy(true);
    const run = key;
    try {
      if (action === "share") {
        const result = await shareContent(target, title);
        if (result !== "cancelled")
          author.notify(result === "shared" ? "已分享" : "链接已复制");
        return result !== "cancelled";
      }
      const field = action === "favorite" ? "favorite" : "liked",
        value = !state[field];
      const saved = await (action === "favorite"
        ? author.favorite(target, value)
        : author.like(target, value));
      if (saved && scope.current === run)
        setSnapshot((old) =>
          old.key === run ? { ...old, [field]: value } : old,
        );
      return saved && scope.current === run;
    } catch (error) {
      if (scope.current === run)
        author.notify(error instanceof Error ? error.message : "操作未完成");
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  const actionKey = quickActionContentKey({
    kind: target.type,
    id: target.id,
    title,
  });
  return {
    state,
    busy,
    execute,
    environment: {
      onAction: execute,
      likedIds: state.liked ? [actionKey] : [],
      favoriteIds: state.favorite ? [actionKey] : [],
    } satisfies ContentQuickActionEnvironment,
  };
};
export const ContentActionsView = ({
  target,
  title,
  actions,
}: {
  target: ContentIdentity;
  title: string;
  actions: ReturnType<typeof useContentActions>;
}) => {
  const { viewer, signInHref, checking } = useAuthors();
  return (
    <div className="phase4-actions" aria-label="内容操作">
      <button
        type="button"
        disabled={checking || actions.busy || !actions.state.known}
        aria-pressed={actions.state.favorite}
        onClick={() =>
          void actions.execute("favorite", {
            kind: target.type,
            id: target.id,
            title,
          })
        }
      >
        {actions.state.favorite ? "取消收藏" : "收藏"}
      </button>
      {viewer ? (
        <button
          type="button"
          disabled={checking || actions.busy || !actions.state.known}
          aria-pressed={actions.state.liked}
          onClick={() =>
            void actions.execute("like", {
              kind: target.type,
              id: target.id,
              title,
            })
          }
        >
          {actions.state.liked ? "取消喜欢" : "喜欢"}
        </button>
      ) : (
        <a href={signInHref}>登录后喜欢</a>
      )}
      <button
        type="button"
        disabled={actions.busy}
        onClick={() =>
          void actions.execute("share", {
            kind: target.type,
            id: target.id,
            title,
          })
        }
      >
        分享
      </button>
    </div>
  );
};
export const ContentActions = ({
  target,
  title,
}: {
  target: ContentIdentity;
  title: string;
}) => {
  const actions = useContentActions(target, title);
  return <ContentActionsView target={target} title={title} actions={actions} />;
};
