import "server-only";
import { localCatalogFileUrl } from "../../features/detail/local-catalog-media";
import { readCommunitySessionToken } from "./community-session-cookie";

import { fetchCatalogSearchPage } from "./catalog-search";
import type { CatalogSearchTransportResult } from "./catalog-search";
import type { CatalogSearchTransportQuery } from "@moya/contracts";

import { fetchCatalogDetail } from "./catalog-detail";
import { fetchCatalogPage } from "./catalog-list";
import {
  createCatalogComment,
  createCatalogCommentReply,
  fetchCatalogCommentPage,
  fetchCatalogCommentReplyPage,
} from "./catalog-comments";
import {
  fetchCurrentUser,
  signInDevelopmentAccount,
  signOutDevelopmentSession,
} from "./community-session";

import type {
  CatalogComment,
  CatalogCommentReply,
  CatalogCommentListingTransportQuery,
  CatalogCommentTransportQuery,
  CatalogListTransportQuery,
} from "@moya/contracts";
import type { CatalogDetailTransportResult } from "./catalog-detail";
import type { CatalogPageTransportResult } from "./catalog-list";
import type {
  CommentPageTransportResult,
  CommentReplyPageTransportResult,
  CommentSubmissionTransportResult,
} from "./catalog-comments";
import type {
  CurrentUserTransportResult,
  DevelopmentSignInTransportResult,
  DevelopmentSignOutTransportResult,
} from "./community-session";

const publicApiBaseUrlVariable = "MOYA_PUBLIC_API_BASE_URL" as const;

export const parsePublicApiBaseUrl = (value: string | undefined): URL => {
  if (value === undefined || value === "" || value !== value.trim()) {
    throw new Error(`${publicApiBaseUrlVariable} is required`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${publicApiBaseUrlVariable} must be an absolute URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${publicApiBaseUrlVariable} must use HTTP(S)`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error(`${publicApiBaseUrlVariable} must not contain credentials`);
  }
  if (url.search !== "") {
    throw new Error(`${publicApiBaseUrlVariable} must not contain a query`);
  }
  if (url.hash !== "") {
    throw new Error(`${publicApiBaseUrlVariable} must not contain a hash`);
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
};

export const fetchServerCatalogPage = async (
  query: CatalogListTransportQuery = {},
): Promise<CatalogPageTransportResult> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await fetchCatalogPage({ baseUrl, fetch: globalThis.fetch }, query);
  } catch {
    return { state: "unexpected-error" };
  }
};

export const fetchServerCatalogDetail = async (
  catalogId: string,
): Promise<CatalogDetailTransportResult> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await fetchCatalogDetail(
      { baseUrl, fetch: globalThis.fetch },
      catalogId,
    );
  } catch {
    return { state: "unexpected-error" };
  }
};

export const fetchServerCatalogSearchPage = async (
  query: CatalogSearchTransportQuery,
  signal?: AbortSignal,
): Promise<CatalogSearchTransportResult> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await fetchCatalogSearchPage(
      { baseUrl, fetch: globalThis.fetch },
      query,
      signal,
    );
  } catch {
    return { state: "unexpected-error" };
  }
};

export const fetchServerCatalogCommentPage = async (
  catalogId: string,
  query: CatalogCommentListingTransportQuery = {},
  signal?: AbortSignal,
  token?: string,
): Promise<CommentPageTransportResult> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await fetchCatalogCommentPage(
      { baseUrl, fetch: globalThis.fetch },
      catalogId,
      query,
      signal,
      token,
    );
  } catch (error) {
    if (signal?.aborted === true) throw error;
    return { state: "unexpected-error" };
  }
};

export const fetchServerCatalogCommentReplyPage = async (
  catalogId: string,
  commentId: string,
  query: CatalogCommentTransportQuery = {},
  signal?: AbortSignal,
  token?: string,
): Promise<CommentReplyPageTransportResult> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await fetchCatalogCommentReplyPage(
      { baseUrl, fetch: globalThis.fetch },
      catalogId,
      commentId,
      query,
      signal,
      token,
    );
  } catch (error) {
    if (signal?.aborted === true) throw error;
    return { state: "unexpected-error" };
  }
};

export const createServerCatalogComment = async (
  catalogId: string,
  token: string,
  body: unknown,
): Promise<CommentSubmissionTransportResult<CatalogComment>> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await createCatalogComment(
      { baseUrl, fetch: globalThis.fetch },
      catalogId,
      token,
      body,
    );
  } catch {
    return { state: "unexpected-error" };
  }
};

export const createServerCatalogCommentReply = async (
  catalogId: string,
  commentId: string,
  token: string,
  body: unknown,
): Promise<CommentSubmissionTransportResult<CatalogCommentReply>> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await createCatalogCommentReply(
      { baseUrl, fetch: globalThis.fetch },
      catalogId,
      commentId,
      token,
      body,
    );
  } catch {
    return { state: "unexpected-error" };
  }
};

/** Web relays the cookie credential explicitly; it never decodes or validates it. */
export const fetchServerCurrentUser = async (
  token: string,
): Promise<CurrentUserTransportResult> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await fetchCurrentUser({ baseUrl, fetch: globalThis.fetch }, token);
  } catch {
    return { state: "unexpected-error" };
  }
};

export const signInServerDevelopmentAccount = async (
  handle: string,
): Promise<DevelopmentSignInTransportResult> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await signInDevelopmentAccount(
      { baseUrl, fetch: globalThis.fetch },
      handle,
    );
  } catch {
    return { state: "unexpected-error" };
  }
};

export const signOutServerDevelopmentSession = async (
  token: string,
): Promise<DevelopmentSignOutTransportResult> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await signOutDevelopmentSession(
      { baseUrl, fetch: globalThis.fetch },
      token,
    );
  } catch {
    return { state: "unexpected-error" };
  }
};

/** Fixed Development namespace relay. Credentials stay on the server and every read is private. */
export const relayServerAuthorCommunity = async (
  request: Request,
): Promise<Response> => {
  const headers = {
    "cache-control": "private, no-store",
    vary: "Cookie",
    "x-content-type-options": "nosniff",
  };
  const fail = (status: number) => new Response(null, { status, headers });
  if (!["GET", "POST", "DELETE"].includes(request.method)) return fail(405);
  const incoming = new URL(request.url);
  // Next's development Request.url may normalize the hostname to localhost.
  // Host is the browser's requested authority; scripts cannot forge it. Never
  // trust forwarded-host to turn a foreign Origin into an accepted mutation.
  const origin = request.headers.get("origin");
  const authority = request.headers.get("host") ?? incoming.host;
  let sameOrigin = origin === null;
  if (origin !== null) {
    try {
      const source = new URL(origin);
      sameOrigin =
        source.origin === origin &&
        source.host === authority &&
        source.protocol === incoming.protocol;
    } catch {
      sameOrigin = false;
    }
  }
  if (
    request.method !== "GET" &&
    (!sameOrigin || request.headers.get("sec-fetch-site") === "cross-site")
  )
    return fail(403);
  const prefix = "/api/community/";
  if (!incoming.pathname.startsWith(prefix)) return fail(404);
  const suffix = incoming.pathname.slice(prefix.length);
  try {
    if (
      suffix.split("/").some((p) => {
        const d = decodeURIComponent(p);
        return (
          !d ||
          d === "." ||
          d === ".." ||
          d.includes("\u0000") ||
          /[\\/]/u.test(d)
        );
      })
    )
      return fail(404);
    const base = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    const target = new URL(`v1/community/${suffix}`, base);
    target.search = incoming.search;
    const token = readCommunitySessionToken(request.headers.get("cookie"));
    const outgoing: Record<string, string> = {
      accept: "application/json, image/png",
    };
    if (token !== undefined) outgoing.Authorization = `Bearer ${token}`;
    let bytes: Uint8Array | undefined;
    if (request.method !== "GET") {
      const type = request.headers.get("content-type");
      if (type !== "application/json" && type !== "image/png") return fail(422);
      outgoing["content-type"] = type;
      const expected = request.headers.get("x-author-account");
      if (expected) {
        if (!/^user-[0-9a-f]{32}$/u.test(expected)) return fail(422);
        outgoing["x-author-account"] = expected;
      }
      const id = request.headers.get("x-request-id");
      if (id) outgoing["x-request-id"] = id;
      const reader = request.body?.getReader();
      if (!reader) return fail(422);
      const chunks: Uint8Array[] = [];
      let size = 0;
      const limit = type === "image/png" ? 4194304 : 100000;
      for (;;) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > limit) {
          await reader.cancel();
          return fail(413);
        }
        chunks.push(part.value);
      }
      bytes = new Uint8Array(Buffer.concat(chunks));
    }
    const upstream = await fetch(target, {
      method: request.method,
      headers: outgoing,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      ...(bytes === undefined ? {} : { body: bytes as BodyInit }),
    });
    const type = upstream.headers.get("content-type")?.split(";")[0];
    if (type !== "application/json" && type !== "image/png")
      return fail(upstream.ok ? 502 : upstream.status);
    const reader = upstream.body?.getReader();
    if (!reader) return fail(502);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 4500000) {
        await reader.cancel();
        return fail(502);
      }
      chunks.push(part.value);
    }
    return new Response(new Uint8Array(Buffer.concat(chunks)), {
      status: upstream.status,
      headers: { ...headers, "content-type": type },
    });
  } catch {
    return fail(503);
  }
};

/** Development-only caller; look up published membership before an anonymous native file read. */
export const relayServerLocalCatalogMedia = async (
  catalogId: string,
  mediaId: string,
): Promise<Response> => {
  const headers = {
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  };
  const fail = (status: number) => new Response(null, { status, headers });
  try {
    const detail = await fetchServerCatalogDetail(catalogId);
    if (detail.state !== "success")
      return fail(detail.state === "not-found" ? 404 : 503);
    const media =
      detail.detail.media.find((item) => item.id === mediaId) ??
      (detail.detail.representativeMedia?.id === mediaId
        ? detail.detail.representativeMedia
        : undefined);
    const url = media ? localCatalogFileUrl(media.src) : null;
    if (!url) return fail(404);
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "image/png,image/jpeg,image/webp" },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      return fail(
        response.status === 404 || response.status === 403 ? 404 : 503,
      );
    const type = response.headers.get("content-type")?.split(";")[0];
    if (!type || !["image/png", "image/jpeg", "image/webp"].includes(type))
      return fail(502);
    const reader = response.body?.getReader();
    if (!reader) return fail(502);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 12 * 1024 * 1024) {
        await reader.cancel();
        return fail(502);
      }
      chunks.push(next.value);
    }
    return new Response(new Uint8Array(Buffer.concat(chunks)), {
      headers: { ...headers, "content-type": type },
    });
  } catch {
    return fail(503);
  }
};
