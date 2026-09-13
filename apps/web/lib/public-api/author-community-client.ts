import {
  authorProfileSchema,
  authorMediaSchema,
  authorPeoplePageSchema,
  workSchema,
  workPageSchema,
  workDraftPageSchema,
  workDraftResultSchema,
  workApplyResultSchema,
  avatarUpdateResultSchema,
  guestFavoriteMergeResultSchema,
  discussionPageSchema,
  discussionReplyPageSchema,
  ownCommentPageSchema,
  discussionSubmitResultSchema,
  discussionLocationSchema,
  savedResultSchema,
  deletedResultSchema,
  discardedResultSchema,
  publicUserProfileSchema,
  contentCardSchema,
  discoveryPageSchema,
  contentCollectionPageSchema,
  inscriptionFilterOptionsSchema,
  contentStateSchema,
} from "@moya/contracts/schemas";
import type { ContentIdentity, DiscoveryQuery } from "@moya/contracts";
interface Parser<T> {
  parse: (value: unknown) => T;
}
let expectedAccount: string | null = null;
let accountEpoch = 0;
export class AuthorRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
const request = async <T>(
  path: string,
  schema: Parser<T>,
  options: {
    method?: string;
    body?: unknown;
    signal?: AbortSignal;
    upload?: Blob;
    requestId?: string;
  } = {},
): Promise<T> => {
  const epoch = accountEpoch;
  const method = options.method ?? "GET";
  if (method !== "GET" && expectedAccount === null)
    throw new AuthorRequestError(401, "请先确认当前账户");
  const identityHeaders =
    method === "GET" ? {} : { "x-author-account": expectedAccount! };
  const response = await fetch(`/api/community/${path}`, {
    method: options.method ?? "GET",
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(15000)])
      : AbortSignal.timeout(15000),
    headers: options.upload
      ? {
          ...identityHeaders,
          "content-type": "image/png",
          "x-request-id": options.requestId ?? "",
        }
      : options.body === undefined
        ? { accept: "application/json" }
        : { ...identityHeaders, "content-type": "application/json" },
    ...(options.upload
      ? { body: options.upload }
      : options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
  });
  if (!response.ok) {
    let message =
      response.status === 401
        ? "请先登录"
        : response.status === 404
          ? "内容不可用或此列表未公开"
          : response.status === 409
            ? "状态已变化，请检查后重试"
            : "暂时无法完成，请重试";
    try {
      const value = await response.json();
      if (response.status === 409 && typeof value?.error?.message === "string")
        message = value.error.message;
    } catch {
      /* Preserve the transport failure. */
    }
    throw new AuthorRequestError(response.status, message);
  }
  const result = schema.parse(await response.json());
  if (epoch !== accountEpoch)
    throw new AuthorRequestError(401, "账户状态已变化，请重试读取");
  return result;
};
const targetPath = (t: ContentIdentity) =>
  `${t.type}/${encodeURIComponent(t.id)}`;
const query = (q: Record<string, string | number | undefined>) =>
  new URLSearchParams(
    Object.entries(q)
      .filter(
        (entry): entry is [string, string | number] => entry[1] !== undefined,
      )
      .map(([k, v]) => [k, String(v)]),
  ).toString();
export const authorClient = {
  setAccount: (id: string | null) => {
    if (expectedAccount !== id) accountEpoch++;
    expectedAccount = id;
  },
  account: () => expectedAccount,
  me: (signal?: AbortSignal) =>
    request("me", publicUserProfileSchema, { ...(signal ? { signal } : {}) }),
  profile: (id: string, signal?: AbortSignal) =>
    request(`authors/${encodeURIComponent(id)}`, authorProfileSchema, {
      ...(signal ? { signal } : {}),
    }),
  people: (id: string, list: "following" | "followers" | "blocks", page = 1) =>
    request(
      `${list === "blocks" ? "me" : `authors/${encodeURIComponent(id)}`}/${list}?page=${page}&pageSize=20`,
      authorPeoplePageSchema,
    ),
  works: (id: string, page = 1) =>
    request(
      `authors/${encodeURIComponent(id)}/works?page=${page}&pageSize=12`,
      workPageSchema,
    ),
  work: (id: string, signal?: AbortSignal) =>
    request(`works/${encodeURIComponent(id)}`, workSchema, {
      ...(signal ? { signal } : {}),
    }),
  command: (path: string, body: unknown, method = "POST") =>
    request<unknown>(
      path,
      path.includes("/drafts/") && method === "DELETE"
        ? discardedResultSchema
        : method === "DELETE"
          ? deletedResultSchema
          : savedResultSchema,
      { method, body },
    ),
  upload: (blob: Blob, requestId: string) =>
    request("media", authorMediaSchema, {
      method: "POST",
      upload: blob,
      requestId,
    }),
  avatar: (body: unknown) =>
    request("me/avatar", avatarUpdateResultSchema, { method: "POST", body }),
  drafts: (work: string, page = 1) =>
    request(
      `works/${work}/drafts?page=${page}&pageSize=20`,
      workDraftPageSchema,
    ),
  saveDraft: (work: string, body: unknown) =>
    request(`works/${work}/drafts`, workDraftResultSchema, {
      method: "POST",
      body,
    }),
  applyDraft: (work: string, body: unknown) =>
    request(`works/${work}/drafts/apply`, workApplyResultSchema, {
      method: "POST",
      body,
    }),
  merge: (body: unknown) =>
    request("favorites/merge", guestFavoriteMergeResultSchema, {
      method: "POST",
      body,
    }),
  discovery: (q: DiscoveryQuery, signal?: AbortSignal) =>
    request(
      `discover?${query({ kind: q.kind, pageSize: q.pageSize, filters: JSON.stringify(q.filters), sequence: q.sequence, after: q.after, search: q.search })}`,
      discoveryPageSchema,
      { ...(signal ? { signal } : {}) },
    ),
  filters: () => request("filter-options", inscriptionFilterOptionsSchema),
  collection: (
    id: string,
    list: "favorites" | "likes",
    page: number,
    search = "",
    kind = "all",
  ) =>
    request(
      `authors/${id}/${list}?${query({ page, pageSize: 12, search, kind })}`,
      contentCollectionPageSchema,
    ),
  card: (target: ContentIdentity) =>
    request(`content/${targetPath(target)}/card`, contentCardSchema),
  state: (target: ContentIdentity) =>
    request(`content/${targetPath(target)}/state`, contentStateSchema),
  discussion: (
    target: ContentIdentity,
    page: number,
    pinned?: readonly string[],
    signal?: AbortSignal,
  ) =>
    request(
      `discussion/${targetPath(target)}?${query({ page, pageSize: 10, pinned: pinned?.join(",") })}`,
      discussionPageSchema,
      { ...(signal ? { signal } : {}) },
    ),
  replies: (target: ContentIdentity, root: string, page: number) =>
    request(
      `discussion/${targetPath(target)}/replies/${root}?page=${page}&pageSize=10`,
      discussionReplyPageSchema,
    ),
  send: (
    target: ContentIdentity,
    text: string,
    root?: string,
    replyTo?: string,
  ) =>
    request(
      `discussion/${targetPath(target)}${root ? `/replies/${root}` : ""}`,
      discussionSubmitResultSchema,
      { method: "POST", body: { text, ...(replyTo ? { replyTo } : {}) } },
    ),
  locate: (target: ContentIdentity, id: string, pinned: readonly string[]) =>
    request(
      `discussion/${targetPath(target)}/locate/${id}?${query({ page: 1, pageSize: 10, pinned: pinned.join(",") })}`,
      discussionLocationSchema,
    ),
  comments: (page = 1) =>
    request(`me/comments?page=${page}&pageSize=20`, ownCommentPageSchema),
};
