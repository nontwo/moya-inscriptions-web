import { isCommunityStoreUnavailableError } from "@moya/api";
import {
  developmentSessionSchema,
  developmentSignInRequestSchema,
  noQueryTransportSchema,
  publicUserProfileSchema,
} from "@moya/contracts/schemas";

import { sendApiError } from "../http/api-error-response.js";
import { readJsonBody } from "../http/json-body.js";
import { sendJson } from "../http/json-response.js";
import { collectTransportQuery } from "../http/transport-query.js";

import type { CommunitySessionService } from "@moya/api";
import type { IncomingMessage, ServerResponse } from "node:http";

const bearerPattern = /^Bearer ([A-Za-z0-9_-]{43})$/;

/** The opaque bearer credential relayed by Web; anything else is unauthenticated. */
const readBearerToken = (request: IncomingMessage): string | undefined => {
  const header = request.headers.authorization;
  if (typeof header !== "string") return undefined;
  return bearerPattern.exec(header)?.[1];
};

const hasQuery = (request: IncomingMessage): boolean => {
  const url = new URL(request.url ?? "/", "http://request.invalid");
  return !noQueryTransportSchema.safeParse(
    collectTransportQuery(url.searchParams),
  ).success;
};

const sendServiceFailure = (response: ServerResponse, error: unknown): void => {
  if (isCommunityStoreUnavailableError(error)) {
    sendApiError(
      response,
      "SERVICE_UNAVAILABLE",
      "Service temporarily unavailable",
    );
    return;
  }
  sendApiError(response, "INTERNAL_ERROR", "Internal server error");
};

const sendUnauthenticated = (response: ServerResponse): void => {
  sendApiError(response, "UNAUTHENTICATED", "A valid session is required");
};

export const handleCurrentUser = async (
  request: IncomingMessage,
  response: ServerResponse,
  sessionService: CommunitySessionService | undefined,
): Promise<void> => {
  if (hasQuery(request)) {
    sendApiError(response, "INVALID_QUERY", "Invalid current-user query");
    return;
  }
  const token = readBearerToken(request);
  if (token === undefined || sessionService === undefined) {
    sendUnauthenticated(response);
    return;
  }
  try {
    const profile = await sessionService.identify(token);
    if (profile === null) {
      sendUnauthenticated(response);
      return;
    }
    sendJson(response, 200, publicUserProfileSchema.parse(profile));
  } catch (error) {
    sendServiceFailure(response, error);
  }
};

/** Development-only: composed exclusively under NODE_ENV=development. */
export const handleDevelopmentSignIn = async (
  request: IncomingMessage,
  response: ServerResponse,
  sessionService: CommunitySessionService,
): Promise<void> => {
  if (hasQuery(request)) {
    sendApiError(response, "INVALID_QUERY", "Invalid sign-in query");
    return;
  }
  let handle: string;
  try {
    handle = developmentSignInRequestSchema.parse(
      await readJsonBody(request),
    ).handle;
  } catch {
    sendApiError(response, "INVALID_QUERY", "Invalid sign-in request");
    return;
  }
  try {
    const session = await sessionService.signInDevelopmentAccount(handle);
    if (session === null) {
      sendApiError(response, "ITEM_NOT_FOUND", "Development account not found");
      return;
    }
    sendJson(response, 201, developmentSessionSchema.parse(session));
  } catch (error) {
    sendServiceFailure(response, error);
  }
};

export const handleDevelopmentSignOut = async (
  request: IncomingMessage,
  response: ServerResponse,
  sessionService: CommunitySessionService,
): Promise<void> => {
  if (hasQuery(request)) {
    sendApiError(response, "INVALID_QUERY", "Invalid sign-out query");
    return;
  }
  const token = readBearerToken(request);
  if (token === undefined) {
    sendUnauthenticated(response);
    return;
  }
  try {
    if (!(await sessionService.signOut(token))) {
      sendUnauthenticated(response);
      return;
    }
    response.writeHead(204, { "cache-control": "no-store" });
    response.end();
  } catch (error) {
    sendServiceFailure(response, error);
  }
};
