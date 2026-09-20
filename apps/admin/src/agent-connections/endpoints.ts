import { z } from "zod";

import { isOwner } from "../editorial/access";
import {
  ConsentError,
  consentDecisionSchema,
  interactionUidSchema,
} from "./consent";
import { decideConsent } from "./decide";
import { resolveConnection } from "./resolve";
import { connectionsEnabled } from "./composition";
import { oauthClientIdSchema } from "./contracts";
import { consentRuntime } from "./runtime";

import type { ConsentRuntime } from "./runtime";
import type { Endpoint, PayloadRequest } from "payload";

/**
 * Agent Connections V1 (Issue #141 r15 §5, §7) — the Owner-only control plane.
 *
 * These endpoints exist only where the composition gate already allows the
 * agent boundary: development, and then only on an explicit opt-in. The gate
 * is the ARRAY being empty, not a branch inside a handler, so the surface is
 * absent rather than present-and-refusing where it is not wanted.
 *
 * Nothing here trusts the request for authority. The acting human is the
 * Payload session; the client, resource and scopes are the row the PROVIDER
 * wrote; the issuer is frozen configuration. No request field names an actor,
 * an audience or a return URL.
 */

const readJson = async (req: PayloadRequest): Promise<unknown> => {
  if (!req.json) throw new ConsentError("JSON_BODY_REQUIRED");
  try {
    return await req.json();
  } catch {
    throw new ConsentError("JSON_BODY_REQUIRED");
  }
};

const parse = <Output>(
  schema: {
    safeParse: (input: unknown) => { success: boolean; data?: Output };
  },
  input: unknown,
): Output => {
  const result = schema.safeParse(input);
  if (!result.success || result.data === undefined)
    throw new ConsentError("REQUEST_MALFORMED");
  return result.data;
};

/** Owner-only. `automation` never consents, and never disconnects. */
const requireOwner = (req: PayloadRequest): string => {
  if (!isOwner(req)) throw new ConsentError("OWNER_ONLY", 403);
  const id = req.user?.id;
  if (typeof id !== "string" && typeof id !== "number")
    throw new ConsentError("OWNER_ONLY", 403);
  return `payload-user-${String(id)}`;
};

const failure = (error: unknown): Response => {
  const consent =
    error instanceof ConsentError
      ? error
      : new ConsentError("CONSENT_UNAVAILABLE", 500);
  return Response.json(
    { ok: false, error: consent.code },
    { status: consent.status, headers: { "Cache-Control": "no-store" } },
  );
};

const ok = (result: unknown): Response =>
  Response.json(
    { ok: true, result },
    { headers: { "Cache-Control": "no-store" } },
  );

const runtimeOrRefuse = (): ConsentRuntime => {
  const runtime = consentRuntime();
  if (runtime === null) throw new ConsentError("NOT_FOUND", 404);
  return runtime;
};

const decideEndpoint: Endpoint = {
  path: "/agent-connections/consent",
  method: "post",
  handler: async (req) => {
    try {
      const humanAccountId = requireOwner(req);
      const runtime = runtimeOrRefuse();
      const decided = await decideConsent(
        runtime,
        humanAccountId,
        parse(consentDecisionSchema, await readJson(req)),
      );
      return ok(decided);
    } catch (error) {
      return failure(error);
    }
  },
};

/**
 * The page's data. Observations only: what the database recorded, never a
 * liveness claim. There is no "online" here because nothing observes one.
 */
const listEndpoint: Endpoint = {
  path: "/agent-connections",
  method: "get",
  handler: async (req) => {
    try {
      const humanAccountId = requireOwner(req);
      const runtime = runtimeOrRefuse();
      const connections =
        await runtime.connections.listForHuman(humanAccountId);
      return ok({
        clients: [...runtime.clients.values()],
        connections: connections.map((entry) => ({
          id: entry.connection.id,
          client: entry.connection.client,
          clientLabel:
            runtime.clients.get(entry.connection.oauthClientId)?.label ?? null,
          oauthClientId: entry.connection.oauthClientId,
          environment: entry.connection.environment,
          preset: entry.connection.preset,
          status: entry.connection.status,
          generation: entry.connection.generation,
          consentedAt: entry.connection.consentedAt,
          revokedAt: entry.connection.revokedAt,
          // An observation of the last request that actually authenticated.
          // Null means none has been seen, not that anything is offline.
          lastVerifiedAt: entry.lastVerifiedAt,
          hasCurrentGrant: entry.currentGrantId !== null,
        })),
      });
    } catch (error) {
      return failure(error);
    }
  },
};

const startSchema = z.object({ clientId: oauthClientIdSchema }).strict();

/**
 * Starts a connection. It grants nothing: a new record is
 * `awaiting-consent` at generation 0, and stays there until a human approves
 * in a browser. This exists so the Owner can see what they are about to
 * connect before a client ever asks.
 */
const startEndpoint: Endpoint = {
  path: "/agent-connections/start",
  method: "post",
  handler: async (req) => {
    try {
      const humanAccountId = requireOwner(req);
      const runtime = runtimeOrRefuse();
      const body = parse(startSchema, await readJson(req));
      const connection = await resolveConnection(
        runtime,
        humanAccountId,
        body.clientId,
      );
      return ok({ id: connection.id, status: connection.status });
    } catch (error) {
      return failure(error);
    }
  },
};

const connectionSchema = z
  .object({ id: z.string().regex(/^conn-[0-9a-f]{32}$/u) })
  .strict();

/**
 * Disconnect.
 *
 * The canonical deny is stored FIRST and is what the resource server reads.
 * Provider-side cleanup is downstream of it and is NOT wired here yet, so
 * this endpoint deliberately does not claim it: the connection is denied, and
 * a retained refresh token remains redeemable at the provider until grant
 * destruction runs. What the bump DOES guarantee is that anything minted from
 * it carries the old generation and is refused.
 */
const disconnectEndpoint: Endpoint = {
  path: "/agent-connections/disconnect",
  method: "post",
  handler: async (req) => {
    try {
      const humanAccountId = requireOwner(req);
      const runtime = runtimeOrRefuse();
      const body = parse(connectionSchema, await readJson(req));
      const stored = await runtime.connections.read(body.id);
      // Scoped to the acting human: an Owner-only endpoint that could name any
      // connection id would still be a way to reach somebody else's record.
      if (
        stored === null ||
        stored.connection.humanAccountId !== humanAccountId
      )
        throw new ConsentError("CONNECTION_NOT_FOUND", 404);
      const revoked = await runtime.authority.revoke(
        body.id,
        new Date().toISOString(),
      );
      return ok({ id: revoked.id, status: revoked.status });
    } catch (error) {
      return failure(error);
    }
  },
};

/**
 * The endpoints, or none at all.
 *
 * An empty array is the composition gate: where connections are off, these
 * paths do not exist, and a request for one gets Payload's own 404 rather
 * than a handler that has to remember to refuse.
 */
export const agentConnectionEndpoints = (
  environment: NodeJS.ProcessEnv = process.env,
): Endpoint[] =>
  connectionsEnabled(environment)
    ? [decideEndpoint, listEndpoint, startEndpoint, disconnectEndpoint]
    : [];

/** Re-exported for the review page, which arms an interaction before it renders. */
export { interactionUidSchema };
