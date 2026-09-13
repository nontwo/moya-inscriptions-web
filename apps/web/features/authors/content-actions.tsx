"use client";
import { useEffect, useRef, useState } from "react";
import type { ContentIdentity } from "@moya/contracts";
import type { ContentQuickActionEnvironment } from "../quick-actions/quick-action-types";
import { quickActionContentKey } from "../quick-actions/quick-action-types";
import { useAuthors, shareContent, contentKey } from "./author-context";
import { authorClient } from "./author-data";
import { QuickActionIcon } from "../quick-actions/quick-action-card-action";
import type { QuickActionName } from "../quick-actions/quick-action-types";
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
    [pendingAction, setPendingAction] = useState<QuickActionName | null>(null),
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
    setPendingAction(action);
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
      setPendingAction(null);
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
    pendingAction,
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
    <div
      className="phase4-detail-actions"
      role="group"
      aria-label="内容操作"
      data-detail-content-actions=""
    >
      {(["favorite", "like", "share"] as const).map((action) => {
        const active =
          action === "favorite"
            ? actions.state.favorite
            : action === "like"
              ? actions.state.liked
              : actions.pendingAction === "share";
        return (
          <button
            key={action}
            type="button"
            aria-label={
              action === "favorite"
                ? "收藏"
                : action === "like"
                  ? "喜欢"
                  : "分享"
            }
            aria-pressed={action === "share" ? undefined : active}
            aria-busy={actions.pendingAction === action || undefined}
            data-active={active}
            disabled={
              checking ||
              actions.busy ||
              (action !== "share" && !actions.state.known)
            }
            onClick={() => {
              if (action === "like" && !viewer) {
                window.location.assign(signInHref);
                return;
              }
              void actions.execute(action, {
                kind: target.type,
                id: target.id,
                title,
              });
            }}
          >
            <QuickActionIcon
              action={action}
              filled={action !== "share" && active}
            />
          </button>
        );
      })}
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
