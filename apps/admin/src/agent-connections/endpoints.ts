import { randomBytes } from "node:crypto";
import { z } from "zod";

import { isOwner } from "../editorial/access";
import {
  ConsentError,
  consentDecisionSchema,
  digestConsentTicket,
  interactionUidSchema,
  providerResumeUrl,
} from "./consent";
import { connectionsEnabled } from "./composition";
import { oauthClientIdSchema } from "./contracts";
import { consentRuntime } from "./runtime";
import { authorizeConnection, reconnectConnection } from "./lifecycle";

import type { ConsentRuntime } from "./runtime";
import type { StoredConnection } from "@moya/community-postgres";
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

const newConnectionId = (): string => `conn-${randomBytes(16).toString("hex")}`;

/**
 * The machine principal label. Derived from the client family and a random
 * suffix, never supplied by a caller: a request that could name a principal
 * could name one that already exists and inherit its authority.
 */
const principalLabelFor = (family: string): string =>
  `agent-${family}-${randomBytes(6).toString("hex")}`;

/**
 * Finds the connection this human holds for this exact client, creating one
 * that grants nothing if there is none.
 *
 * A new connection is `awaiting-consent` at generation 0 — powerless until a
 * human says otherwise in a browser. Creating it here is not consent and does
 * not authorize anything; it is the record consent will later attach to.
 */
export const resolveConnection = async (
  runtime: ConsentRuntime,
  humanAccountId: string,
  oauthClientId: string,
): Promise<StoredConnection> => {
  const client = runtime.clients.get(oauthClientId);
  if (client === undefined) throw new ConsentError("CLIENT_NOT_REGISTERED");
  const existing = await runtime.connections.findForClient(
    humanAccountId,
    oauthClientId,
  );
  if (existing !== null) return existing.connection;
  const created = await runtime.connections.create({
    id: newConnectionId(),
    principalLabel: principalLabelFor(client.family),
    humanAccountId,
    client: client.family,
    oauthClientId,
    environment: runtime.environment,
    preset: "read-only",
    status: "awaiting-consent",
    generation: 0,
    revokedAt: null,
    consentedAt: null,
  });
  if (created === null) throw new ConsentError("CONNECTION_NOT_CREATED", 500);
  return created.connection;
};

/**
 * The decision.
 *
 * The order of the three writes is the whole safety argument:
 *
 *  1. the pure transition is computed from the connection READ AT A VERSION,
 *     so the generation the consent will record is the one this decision
 *     would produce;
 *  2. `decide` is the gate — the ticket, the human and the deadline are all
 *     in its WHERE clause, and a wrong ticket writes NOTHING. It runs before
 *     any connection change, because a failed decision that had already
 *     bumped a generation would have silently revoked live tokens;
 *  3. the connection is stored under compare-and-set at that version.
 *
 * If (3) loses a race the consent stands with a generation the connection
 * never reached, and the provider refuses to build a grant on it. That is the
 * fail-closed direction: an approval that grants nothing, never a grant
 * nobody approved.
 */
const decideEndpoint: Endpoint = {
  path: "/agent-connections/consent",
  method: "post",
  handler: async (req) => {
    try {
      const humanAccountId = requireOwner(req);
      const runtime = runtimeOrRefuse();
      const body = parse(consentDecisionSchema, await readJson(req));
      const digest = digestConsentTicket(body.ticket);

      if (body.decision === "deny") {
        const denied = await runtime.consents.decide({
          interactionUid: body.interaction,
          ticketDigest: digest,
          humanAccountId,
          decision: "denied",
          grantedGeneration: null,
        });
        if (denied === null) throw new ConsentError("CONSENT_NOT_DECIDABLE");
        return ok({
          decision: "denied",
          resume: providerResumeUrl(runtime.issuer, body.interaction),
        });
      }

      const consent = await runtime.consents.read(body.interaction);
      if (consent === null || consent.connectionId === null)
        throw new ConsentError("CONSENT_NOT_DECIDABLE");
      // The resource the human was shown must be the resource this Admin is
      // the server for. A mismatch is refused, never rewritten to agree.
      if (consent.resource !== runtime.resource)
        throw new ConsentError("RESOURCE_NOT_AVAILABLE");
      if (consent.preset !== "read-only")
        throw new ConsentError("PRESET_NOT_AVAILABLE");

      const stored = await runtime.connections.read(consent.connectionId);
      if (stored === null) throw new ConsentError("CONNECTION_NOT_FOUND", 404);
      const record = {
        humanAccountId,
        preset: "read-only" as const,
        at: new Date().toISOString(),
      };
      // Reconnecting a revoked connection is a FRESH consent, never a
      // restoration; both paths raise the generation, which is what stops a
      // token from before the disconnect being admitted afterwards.
      const next =
        stored.connection.status === "revoked"
          ? reconnectConnection(stored.connection, record)
          : authorizeConnection(stored.connection, record);

      const decided = await runtime.consents.decide({
        interactionUid: body.interaction,
        ticketDigest: digest,
        humanAccountId,
        decision: "approved",
        grantedGeneration: next.generation,
      });
      if (decided === null) throw new ConsentError("CONSENT_NOT_DECIDABLE");

      const written = await runtime.connections.compareAndSet(
        consent.connectionId,
        stored.version,
        next,
      );
      if (written === null) throw new ConsentError("CONNECTION_CHANGED", 409);

      return ok({
        decision: "approved",
        resume: providerResumeUrl(runtime.issuer, body.interaction),
      });
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
