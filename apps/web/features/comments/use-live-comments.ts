"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  createLiveCommentSource,
  LIVE_COMMENT_PAGE_SIZE,
  LIVE_REPLY_PAGE_SIZE,
  toCommentItemPresentation,
  toCommentReplyPresentation,
  toCommentUserPresentation,
} from "./live-comments";

import type { LiveCommentSource } from "./live-comments";
import type {
  CommentItem,
  CommentReplyTarget,
  CommentUserPresentation,
} from "./comment-types";

export type LiveCommentListingStatus =
  "loading" | "ready" | "not-found" | "unavailable" | "unexpected-error";

export type LiveCommentViewer =
  | { readonly status: "checking" }
  | { readonly status: "signed-in"; readonly user: CommentUserPresentation }
  | { readonly status: "signed-out" }
  | { readonly status: "unavailable" };

export interface LiveCommentNotice {
  readonly tone: "info" | "error";
  readonly text: string;
}

interface Listing {
  readonly status: LiveCommentListingStatus;
  readonly hot: readonly CommentItem[];
  readonly latest: readonly CommentItem[];
  readonly page: number;
  readonly totalPages: number;
  /** Latest roots the Backend counted, excluding the hot ones. */
  readonly latestTotal: number;
}

const emptyListing: Listing = {
  hot: [],
  latest: [],
  latestTotal: 0,
  page: 0,
  status: "loading",
  totalPages: 0,
};

const submissionNotice = (state: string): LiveCommentNotice => {
  switch (state) {
    case "invalid-input":
      return {
        text: "评论内容无效：请输入 1–1000 字的纯文本，首尾不留空白。",
        tone: "error",
      };
    case "not-found":
      return { text: "这条资料或评论暂不接受回复。", tone: "error" };
    case "unauthenticated":
      return { text: "登录后才能发表评论。", tone: "error" };
    case "unavailable":
      return { text: "评论服务暂时不可用，请稍后再试。", tone: "error" };
    default:
      return { text: "评论发送失败，请稍后再试。", tone: "error" };
  }
};

const mergeUnseen = <Item extends { readonly id: string }>(
  existing: readonly Item[],
  incoming: readonly Item[],
): Item[] => {
  const seen = new Set(existing.map((item) => item.id));
  return [...existing, ...incoming.filter((item) => !seen.has(item.id))];
};

const withThread = (
  items: readonly CommentItem[],
  rootId: string,
  update: (thread: CommentItem) => CommentItem,
): CommentItem[] =>
  items.map((item) => (item.id === rootId ? update(item) : item));

/**
 * The real comment client behind the accepted #106 seam. The listing is the
 * Backend's combined list: the hot section first, then the latest page. A
 * load-more request pins the hot ids it holds, so the latest pages exclude
 * exactly those roots; ids are still deduplicated on merge, because offset
 * pagination cannot promise stability under concurrent inserts. A refresh
 * replaces the whole list coherently, and every submission ends in one.
 */
export const useLiveComments = (
  catalogId: string,
  options: {
    readonly source?: LiveCommentSource;
    readonly now?: () => Date;
  } = {},
) => {
  const source = useMemo(
    () => options.source ?? createLiveCommentSource(),
    [options.source],
  );
  const now = options.now ?? (() => new Date());
  const nowRef = useRef(now);
  nowRef.current = now;
  const [listing, setListing] = useState<Listing>(emptyListing);
  const [viewer, setViewer] = useState<LiveCommentViewer>({
    status: "checking",
  });
  const [notice, setNotice] = useState<LiveCommentNotice | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const replyPages = useRef(new Map<string, number>());

  const loadFirstPage = useCallback(
    async (signal?: AbortSignal) => {
      const result = await source.readListing(
        catalogId,
        { page: 1, pageSize: LIVE_COMMENT_PAGE_SIZE },
        signal,
      );
      if (signal?.aborted === true) return;
      replyPages.current = new Map();
      if (result.state !== "success") {
        setListing({
          ...emptyListing,
          status:
            result.state === "invalid-query"
              ? "unexpected-error"
              : result.state,
        });
        return;
      }
      const at = nowRef.current();
      setListing({
        hot: result.page.hot.map((item) => toCommentItemPresentation(item, at)),
        latest: result.page.items.map((item) =>
          toCommentItemPresentation(item, at),
        ),
        latestTotal: result.page.total,
        page: result.page.page,
        status: "ready",
        totalPages: result.page.totalPages,
      });
    },
    [catalogId, source],
  );

  const loadViewer = useCallback(
    async (signal?: AbortSignal) => {
      const result = await source.readViewer(signal);
      if (signal?.aborted === true) return;
      if (result.state === "success")
        setViewer({
          status: "signed-in",
          user: toCommentUserPresentation(result.profile),
        });
      else if (result.state === "unauthenticated")
        setViewer({ status: "signed-out" });
      else setViewer({ status: "unavailable" });
    },
    [source],
  );

  useEffect(() => {
    const controller = new AbortController();
    setListing(emptyListing);
    setNotice(null);
    void loadFirstPage(controller.signal).catch(() => undefined);
    void loadViewer(controller.signal).catch(() => undefined);
    return () => controller.abort();
  }, [loadFirstPage, loadViewer]);

  const refresh = useCallback(async () => {
    await loadFirstPage();
  }, [loadFirstPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || listing.status !== "ready") return;
    if (listing.page >= listing.totalPages) return;
    setLoadingMore(true);
    try {
      const result = await source.readListing(catalogId, {
        page: listing.page + 1,
        pageSize: LIVE_COMMENT_PAGE_SIZE,
        pinned: listing.hot.map((item) => item.id),
      });
      if (result.state !== "success") {
        setNotice({ text: "无法加载更多评论，请稍后再试。", tone: "error" });
        return;
      }
      const at = nowRef.current();
      setListing((current) => ({
        ...current,
        latest: mergeUnseen(
          current.latest,
          result.page.items.map((item) => toCommentItemPresentation(item, at)),
        ),
        latestTotal: result.page.total,
        page: result.page.page,
        totalPages: result.page.totalPages,
      }));
    } finally {
      setLoadingMore(false);
    }
  }, [catalogId, listing, loadingMore, source]);

  const loadMoreReplies = useCallback(
    async (rootId: string) => {
      const page = (replyPages.current.get(rootId) ?? 0) + 1;
      const result = await source.readReplies(catalogId, rootId, {
        page,
        pageSize: LIVE_REPLY_PAGE_SIZE,
      });
      if (result.state !== "success") {
        setNotice({ text: "无法加载更多回复，请稍后再试。", tone: "error" });
        return;
      }
      replyPages.current.set(rootId, page);
      const at = nowRef.current();
      const incoming = result.page.items.map((reply) =>
        toCommentReplyPresentation(reply, at),
      );
      const update = (thread: CommentItem): CommentItem => ({
        ...thread,
        replies: mergeUnseen(thread.replies, incoming),
        replyTotal: result.page.total,
      });
      setListing((current) => ({
        ...current,
        hot: withThread(current.hot, rootId, update),
        latest: withThread(current.latest, rootId, update),
      }));
    },
    [catalogId, source],
  );

  const afterSubmission = useCallback(
    async (state: string, awaitingApproval: boolean) => {
      if (state === "success") {
        setNotice(
          awaitingApproval
            ? {
                text: "已提交，待审核通过后才会显示。",
                tone: "info",
              }
            : { text: "已发布。", tone: "info" },
        );
        await loadFirstPage();
        return;
      }
      if (state === "unauthenticated") setViewer({ status: "signed-out" });
      setNotice(submissionNotice(state));
    },
    [loadFirstPage],
  );

  const sendComment = useCallback(
    async (text: string) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        const result = await source.submitComment(catalogId, text);
        await afterSubmission(
          result.state,
          result.state === "success" && result.awaitingApproval,
        );
      } finally {
        setSubmitting(false);
      }
    },
    [afterSubmission, catalogId, source, submitting],
  );

  const sendReply = useCallback(
    async (target: CommentReplyTarget, text: string) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        const result = await source.submitReply(
          catalogId,
          target.rootCommentId,
          text,
          target.replyId,
        );
        await afterSubmission(
          result.state,
          result.state === "success" && result.awaitingApproval,
        );
      } finally {
        setSubmitting(false);
      }
    },
    [afterSubmission, catalogId, source, submitting],
  );

  return {
    hasMore: listing.status === "ready" && listing.page < listing.totalPages,
    hot: listing.hot,
    latest: listing.latest,
    loadMore,
    loadMoreReplies,
    loadingMore,
    notice,
    refresh,
    /** Root comments only: the hot section plus every latest root. */
    rootTotal: listing.hot.length + listing.latestTotal,
    sendComment,
    sendReply,
    status: listing.status,
    submitting,
    viewer,
  };
};
