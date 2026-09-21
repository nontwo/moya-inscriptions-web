import { canonicalScopes } from "./contracts";

import type { ConnectionPreset } from "./contracts";
import type { StoredConnection } from "@moya/community-postgres";

/**
 * Agent Connections V1 (Issue #141) — the machine principal a consent creates.
 *
 * WHAT WAS BROKEN. Consent moved a connection to `authorized` and the provider
 * minted a token against it, and then every business tool answered
 * `AGENT_FORBIDDEN` — because the Backend authorizes a principal LABEL against
 * `community.agent_principals`, and nothing had ever written a row there. The
 * acceptance harness papered over it by pre-seeding the principal through the
 * database owner before any service started, which made the harness pass and
 * left a real first connection unusable. A connection that authenticates and
 * can read nothing is not an onboarding path.
 *
 * WHERE THE IDENTITY COMES FROM, and why none of it is the client's to choose:
 *
 *   * the LABEL is `connection.principalLabel`, minted by `resolveConnection`
 *     when the connection row was created and frozen from then on by the
 *     trigger in migration 20260920060000. A caller cannot propose one, and a
 *     caller that could would be proposing to inherit another principal's
 *     authority.
 *   * the SCOPES are `canonicalScopes(preset)` where the preset is the
 *     provider-written, CHECK-pinned column on the consent row — not a scope
 *     list from the request, and not the token's own claim.
 *   * the DISPLAY NAME is derived from the connection, bounded, and carries
 *     nothing a caller supplied.
 *
 * So this function takes a connection and a preset and has no parameter a
 * request could reach.
 */

/** Bounded, and derived — never a caller's string. */
const displayNameFor = (connection: StoredConnection): string =>
  `${connection.client} · ${connection.id.slice(0, 16)}`.slice(0, 80);

export class PrincipalProvisionError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(`principal provisioning refused: ${code}`);
    this.name = "PrincipalProvisionError";
    this.code = code;
  }
}

/**
 * What this needs from the registry adapter. Deliberately two methods and no
 * more: the control plane may read THIS principal and write it, and has no
 * reason to list, revoke or rename anything. The names match
 * `PostgresAgentAdministrationAdapter` exactly, so the real adapter satisfies
 * this structurally and no shim invents a third spelling.
 */
export interface PrincipalRegistry {
  findPrincipal(label: string): Promise<{
    readonly label: string;
    readonly scopes: readonly string[];
    readonly enabled: boolean;
    readonly version: number;
    readonly revokedAt: string | null;
  } | null>;
  writePrincipal(
    input: {
      readonly label: string;
      readonly displayName: string;
      readonly scopes: readonly string[];
      readonly enabled: boolean;
      readonly expectedVersion: number;
    },
    at: Date,
  ): Promise<{ readonly label: string } | null>;
}

/**
 * Creates or re-affirms the connection's principal, idempotently.
 *
 * IDEMPOTENT BY READ-THEN-COMPARE-AND-SET, which is what makes a retried or
 * concurrent consent safe: the expected version comes from the row that was
 * just read, so a second caller that wrote first makes this one's write return
 * `null` rather than clobbering it. A lost race where the winner left the
 * principal in the state we wanted is a SUCCESS — re-reading and finding the
 * right scopes is the outcome, not the mechanism.
 *
 * REVOCATION IS NOT RESOLVED BY REVIVAL. `writePrincipal` refuses a row whose
 * `revoked_at` is set, and this does not work around that: a revoked principal
 * is a deliberate act by an Owner, and quietly re-enabling it during someone
 * else's consent would be the connection stealing an identity that had been
 * taken away. It refuses with a code instead.
 */
export const provisionPrincipal = async (
  registry: PrincipalRegistry,
  connection: StoredConnection,
  preset: ConnectionPreset,
  now: Date = new Date(),
): Promise<void> => {
  const label = connection.principalLabel;
  const scopes = canonicalScopes(preset);
  const existing = await registry.findPrincipal(label);

  if (existing !== null && existing.revokedAt !== null)
    throw new PrincipalProvisionError("PRINCIPAL_REVOKED");

  const satisfied =
    existing !== null &&
    existing.enabled &&
    existing.scopes.length === scopes.length &&
    [...existing.scopes]
      .sort()
      .every((scope, index) => scope === scopes[index]);
  if (satisfied) return;

  const written = await registry.writePrincipal(
    {
      label,
      displayName: displayNameFor(connection),
      scopes,
      enabled: true,
      expectedVersion: existing === null ? 0 : existing.version,
    },
    now,
  );
  if (written !== null) return;

  // The write did not apply. Either somebody else wrote first — in which case
  // the row may already be exactly what this consent wanted — or the row is
  // revoked. Re-read and accept only the state we asked for; never retry into
  // existence.
  const after = await registry.findPrincipal(label);
  if (
    after === null ||
    after.revokedAt !== null ||
    !after.enabled ||
    after.scopes.length !== scopes.length ||
    ![...after.scopes].sort().every((scope, index) => scope === scopes[index])
  )
    throw new PrincipalProvisionError("PRINCIPAL_NOT_PROVISIONED");
};
