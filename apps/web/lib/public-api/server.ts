import "server-only";

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
): Promise<CommentPageTransportResult> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await fetchCatalogCommentPage(
      { baseUrl, fetch: globalThis.fetch },
      catalogId,
      query,
      signal,
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
): Promise<CommentReplyPageTransportResult> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await fetchCatalogCommentReplyPage(
      { baseUrl, fetch: globalThis.fetch },
      catalogId,
      commentId,
      query,
      signal,
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
