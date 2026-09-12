import {
  developmentSessionSchema,
  developmentSignInRequestSchema,
  publicUserProfileSchema,
  sessionTokenSchema,
} from "@moya/contracts/schemas";

import type { DevelopmentSession, PublicUserProfile } from "@moya/contracts";

export interface CommunitySessionTransportContext {
  readonly baseUrl: URL;
  readonly fetch: typeof globalThis.fetch;
}

export type CurrentUserTransportResult =
  | { readonly state: "success"; readonly profile: PublicUserProfile }
  | {
      readonly state: "unauthenticated" | "unavailable" | "unexpected-error";
    };

export type DevelopmentSignInTransportResult =
  | { readonly state: "success"; readonly session: DevelopmentSession }
  | {
      readonly state:
        "invalid-request" | "not-found" | "unavailable" | "unexpected-error";
    };

export type DevelopmentSignOutTransportResult = {
  readonly state:
    "success" | "unauthenticated" | "unavailable" | "unexpected-error";
};

/** Accepts only the opaque credential shape the Backend issues. */
export const parseSessionToken = (candidate: unknown): string | null => {
  const parsed = sessionTokenSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
};

export const parseDevelopmentSignInHandle = (
  candidate: unknown,
): string | null => {
  const parsed = developmentSignInRequestSchema.safeParse({
    handle: candidate,
  });
  return parsed.success ? parsed.data.handle : null;
};

const requestInit = (
  method: "GET" | "POST",
  token?: string,
  body?: string,
): RequestInit => ({
  method,
  cache: "no-store",
  redirect: "error",
  signal: AbortSignal.timeout(15_000),
  headers: {
    Accept: "application/json",
    ...(token === undefined ? {} : { Authorization: `Bearer ${token}` }),
    ...(body === undefined ? {} : { "Content-Type": "application/json" }),
  },
  ...(body === undefined ? {} : { body }),
});

export const fetchCurrentUser = async (
  context: CommunitySessionTransportContext,
  token: string,
): Promise<CurrentUserTransportResult> => {
  if (parseSessionToken(token) === null) return { state: "unauthenticated" };
  try {
    const response = await context.fetch(
      new URL("v1/me", context.baseUrl).toString(),
      requestInit("GET", token),
    );
    if (response.status === 401) return { state: "unauthenticated" };
    if (response.status === 503) return { state: "unavailable" };
    if (response.status !== 200) return { state: "unexpected-error" };
    const profile = publicUserProfileSchema.safeParse(await response.json());
    return profile.success
      ? { state: "success", profile: profile.data }
      : { state: "unexpected-error" };
  } catch {
    return { state: "unexpected-error" };
  }
};

/** Development-only support operation; the Backend never composes it in Production. */
export const signInDevelopmentAccount = async (
  context: CommunitySessionTransportContext,
  handle: string,
): Promise<DevelopmentSignInTransportResult> => {
  const parsedHandle = parseDevelopmentSignInHandle(handle);
  if (parsedHandle === null) return { state: "invalid-request" };
  try {
    const response = await context.fetch(
      new URL("v1/development/sign-in", context.baseUrl).toString(),
      requestInit(
        "POST",
        undefined,
        JSON.stringify(
          developmentSignInRequestSchema.parse({ handle: parsedHandle }),
        ),
      ),
    );
    if (response.status === 400) return { state: "invalid-request" };
    if (response.status === 404) return { state: "not-found" };
    if (response.status === 503) return { state: "unavailable" };
    if (response.status !== 201) return { state: "unexpected-error" };
    const session = developmentSessionSchema.safeParse(await response.json());
    return session.success
      ? { state: "success", session: session.data }
      : { state: "unexpected-error" };
  } catch {
    return { state: "unexpected-error" };
  }
};

export const signOutDevelopmentSession = async (
  context: CommunitySessionTransportContext,
  token: string,
): Promise<DevelopmentSignOutTransportResult> => {
  if (parseSessionToken(token) === null) return { state: "unauthenticated" };
  try {
    const response = await context.fetch(
      new URL("v1/development/sign-out", context.baseUrl).toString(),
      requestInit("POST", token),
    );
    if (response.status === 204) return { state: "success" };
    if (response.status === 401) return { state: "unauthenticated" };
    if (response.status === 503) return { state: "unavailable" };
    return { state: "unexpected-error" };
  } catch {
    return { state: "unexpected-error" };
  }
};
