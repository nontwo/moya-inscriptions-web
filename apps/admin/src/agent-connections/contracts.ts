import { agentScopeSchema } from "@moya/contracts/internal/community-operator";
import { z } from "zod";

/**
 * Agent Connections V1 (Issue #141 r9) — the shapes a browser-consented
 * connection is made of.
 *
 * A connection is NOT a credential. It is the record of one human's consent
 * binding one vendor client, in one environment, to one restricted machine
 * principal with one permission preset. Tokens are minted against it and are
 * revoked by bumping its generation; the connection outlives them.
 */

/** Client surfaces the Owner connects from. Descriptive, never authenticated. */
export const connectionClientSchema = z.enum(["claude", "codex", "cursor"]);
export type ConnectionClient = z.infer<typeof connectionClientSchema>;

/**
 * Two presets, and no third. `read-only` is the default for a new connection;
 * `management` still requires the Owner to approve every operation in the
 * Admin, so it grants the right to PREPARE and RUN an approved operation,
 * never the right to approve one.
 */
export const connectionPresetSchema = z.enum(["read-only", "management"]);
export type ConnectionPreset = z.infer<typeof connectionPresetSchema>;

/**
 * The business scopes each preset consents to, expressed in the Backend's own
 * seven-scope vocabulary so the two can never drift into separate dialects.
 * A preset is a consent shorthand; the Backend still enforces the scope.
 */
export const PRESET_SCOPES: Readonly<
  Record<ConnectionPreset, readonly z.infer<typeof agentScopeSchema>[]>
> = {
  "read-only": ["users:read", "content:read", "comments:read"],
  management: [
    "users:read",
    "content:read",
    "comments:read",
    "comments:moderate",
    "featured:write",
    "operations:execute",
    "operations:undo",
  ],
};

/**
 * The MCP tools each preset may call. Derived from the preset rather than from
 * the token, so a token can never widen what its connection consented to.
 *
 * The five `editorial_*` tools are deliberately absent from both presets: a
 * connection is an Agent Administration identity and never inherits the
 * separate editorial domain, whatever its bearer presents.
 */
export const PRESET_TOOLS: Readonly<
  Record<ConnectionPreset, readonly string[]>
> = {
  // `artvenn_operations_get` is deliberately ABSENT here. The Backend
  // authorizes it under `operations:execute`
  // (agent-administration-service.ts `get`), which the read-only preset does
  // not hold, so advertising it would put a tool in `tools/list` that the
  // Backend then refuses. The fix is to stop advertising it, not to widen the
  // preset: a read-only connection must expose only tools whose COMPLETE
  // Backend path is read-only under the scopes it actually consented to.
  "read-only": [
    "artvenn_users_find",
    "artvenn_content_search",
    "artvenn_comments_query",
    "artvenn_comments_read",
  ],
  management: [
    "artvenn_users_find",
    "artvenn_content_search",
    "artvenn_comments_query",
    "artvenn_comments_read",
    "artvenn_operations_get",
    "artvenn_comments_prepare",
    "artvenn_featured_prepare",
    "artvenn_operations_execute",
    "artvenn_operations_cancel",
    "artvenn_operations_prepare_undo",
  ],
};

/**
 * One canonical scope representation, so "the same scopes" never depends on
 * order, case or repetition. Normalization is total: anything it cannot
 * normalize is `null`, which is a refusal rather than a lenient reading.
 *
 * Duplicates are deliberately a failure rather than something to collapse. A
 * token that says `comments:read comments:read` was not minted by a provider
 * issuing this connection's canonical set, and quietly accepting it would mean
 * the resource server and the provider disagree about what a token says.
 */
export const normalizeScopes = (raw: unknown): readonly string[] | null => {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const seen = new Set<string>();
  for (const scope of raw) {
    if (typeof scope !== "string") return null;
    if (scope !== scope.trim() || scope === "") return null;
    if (!agentScopeSchema.safeParse(scope).success) return null;
    if (seen.has(scope)) return null;
    seen.add(scope);
  }
  return [...seen].sort();
};

/** The exact scope set a token for this preset must carry. Nothing more. */
export const canonicalScopes = (preset: ConnectionPreset): readonly string[] =>
  [...PRESET_SCOPES[preset]].sort();

/**
 * Exact match, in both directions. A token with fewer scopes is not "safely
 * narrower": it did not come from this connection's consent, and letting it
 * through would mean an absent scope claim could inherit the preset by
 * default. Reordering is fine because both sides are sorted.
 */
export const scopesMatchPreset = (
  claimed: unknown,
  preset: ConnectionPreset,
): boolean => {
  const normalized = normalizeScopes(claimed);
  if (normalized === null) return false;
  const expected = canonicalScopes(preset);
  return (
    normalized.length === expected.length &&
    normalized.every((scope, index) => scope === expected[index])
  );
};

export const connectionStatusSchema = z.enum([
  "awaiting-consent",
  "authorized",
  "revoked",
]);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

/**
 * `generation` is what makes disconnect real. Every token carries the
 * generation it was minted under; revoking bumps it, so an unexpired token, a
 * refresh and a live MCP session all fail their NEXT protected request
 * instead of waiting for a clock. It is not a timestamp comparison: a clock
 * that drifts cannot resurrect access.
 */
export const agentConnectionSchema = z.strictObject({
  id: z.string().min(1).max(128),
  principalLabel: z
    .string()
    .regex(/^agent-[a-z0-9-]{2,57}$/u, "a principal label starts with agent-"),
  humanAccountId: z.string().min(1).max(128),
  client: connectionClientSchema,
  /**
   * The EXACT registered OAuth client this connection authorized. The `client`
   * family above is descriptive metadata for the UI; this is the identity
   * authorization is decided on. A token minted for a different registered
   * client fails even when the human, connection, issuer, resource and
   * generation all agree.
   */
  oauthClientId: z.string().min(1).max(256),
  environment: z.string().min(1).max(64),
  preset: connectionPresetSchema,
  status: connectionStatusSchema,
  generation: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  revokedAt: z.iso.datetime({ offset: false }).nullable(),
});
export type AgentConnection = z.infer<typeof agentConnectionSchema>;

/**
 * What a verified access token asserts. Every field here IS checked against the
 * connection before anything is granted — subject, client, resource, issuer,
 * scopes and generation — so a token that is internally valid but disagrees
 * with its connection is refused rather than reconciled.
 */
export const verifiedGrantSchema = z.strictObject({
  connectionId: z.string().min(1).max(128),
  subject: z.string().min(1).max(128),
  clientId: z.string().min(1).max(128),
  /** RFC 8707 resource indicator: which ArtVenn resource this token is for. */
  resource: z.string().min(1).max(512),
  issuer: z.string().min(1).max(512),
  scopes: z.array(z.string().min(1).max(64)).max(32),
  generation: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
});
export type VerifiedGrant = z.infer<typeof verifiedGrantSchema>;

/**
 * ArtVenn connection access tokens carry this prefix so `overrideAuth` can
 * tell them from a legacy Payload MCP API key DELIBERATELY, rather than by
 * trying one path and falling through to the other on failure. Falling
 * through is exactly the confused-deputy shape this prefix exists to prevent:
 * once a presented credential claims to be ours, it succeeds on its own terms
 * or it is refused.
 */
export const CONNECTION_TOKEN_PREFIX = "artvenn_ct_";

export const isConnectionToken = (presented: string): boolean =>
  presented.startsWith(CONNECTION_TOKEN_PREFIX);

/** Refusals carry a bare stable code; they never echo the presented token. */
export class ConnectionAuthError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ConnectionAuthError";
  }
}
