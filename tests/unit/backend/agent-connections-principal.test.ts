import { describe, expect, it } from "vitest";

import {
  PrincipalProvisionError,
  provisionPrincipal,
} from "admin/agent-connections-principal";

import type { PrincipalRegistry } from "admin/agent-connections-principal";
import type { StoredConnection } from "@moya/community-postgres";

/**
 * Agent Connections V1 (Issue #141) — what a consent may and may not do to a
 * machine principal.
 *
 * The property under test is narrow and was found by review rather than by
 * design: provisioning must CREATE an identity and must never overrule an
 * Owner's decision about one that already exists. Disabling a principal is a
 * first-class action in the operations view, with its own button and its own
 * "can be re-enabled at any time" wording; narrowing its scopes by hand is
 * another. An earlier version wrote `enabled: true` and the full scope set
 * whenever the row was not already what it wanted, so either decision would
 * have been silently undone by the next consent the Owner approved.
 */

const connection = {
  id: "conn-0123456789abcdef0123456789abcdef",
  principalLabel: "agent-acme-agent-0123456789ab",
  client: "acme-agent",
} as unknown as StoredConnection;

const READ_ONLY = ["comments:read", "content:read", "users:read"];

const registry = (
  row: Awaited<ReturnType<PrincipalRegistry["findPrincipal"]>>,
  options: { readonly writeReturns?: { label: string } | null } = {},
) => {
  const writes: unknown[] = [];
  return {
    writes,
    registry: {
      findPrincipal: async () => row,
      writePrincipal: async (input: unknown) => {
        writes.push(input);
        return options.writeReturns === undefined
          ? { label: connection.principalLabel }
          : options.writeReturns;
      },
    } as unknown as PrincipalRegistry,
  };
};

const existing = (overrides: Record<string, unknown> = {}) => ({
  label: connection.principalLabel,
  scopes: READ_ONLY,
  enabled: true,
  version: 3,
  revokedAt: null,
  ...overrides,
});

describe("provisioning a connection's machine principal", () => {
  it("creates the principal when there is none, with exactly the read-only scopes", async () => {
    const { registry: port, writes } = registry(null);
    await provisionPrincipal(port, connection, "read-only");
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      label: connection.principalLabel,
      scopes: READ_ONLY,
      enabled: true,
      // The registry's "insert only if there is no row" contract. Never an
      // update, so the version of an existing row is never consulted.
      expectedVersion: 0,
    });
  });

  it("writes nothing when the principal is already exactly what this consent needs", async () => {
    const { registry: port, writes } = registry(existing());
    await provisionPrincipal(port, connection, "read-only");
    expect(writes).toHaveLength(0);
  });

  it("refuses rather than re-enabling a principal the Owner disabled", async () => {
    // THE FINDING. Disabling is a deliberate, reversible Owner action; a
    // consent that silently flipped it back would be the connection
    // overruling the person who approved it, with nothing on the consent
    // screen saying so.
    const { registry: port, writes } = registry(existing({ enabled: false }));
    await expect(
      provisionPrincipal(port, connection, "read-only"),
    ).rejects.toThrow(PrincipalProvisionError);
    expect(writes).toHaveLength(0);
  });

  it("refuses rather than re-widening scopes the Owner narrowed", async () => {
    const { registry: port, writes } = registry(
      existing({ scopes: ["users:read"] }),
    );
    await expect(
      provisionPrincipal(port, connection, "read-only"),
    ).rejects.toThrow(PrincipalProvisionError);
    expect(writes).toHaveLength(0);
  });

  it("refuses rather than reviving a revoked principal", async () => {
    const { registry: port, writes } = registry(
      existing({ revokedAt: "2026-09-20T00:00:00.000Z" }),
    );
    await expect(
      provisionPrincipal(port, connection, "read-only"),
    ).rejects.toThrow(PrincipalProvisionError);
    expect(writes).toHaveLength(0);
  });

  it("names which decision is in the way, so the refusal is actionable", async () => {
    const codes: string[] = [];
    for (const row of [
      existing({ enabled: false }),
      existing({ scopes: ["users:read"] }),
      existing({ revokedAt: "2026-09-20T00:00:00.000Z" }),
    ]) {
      const { registry: port } = registry(row);
      await provisionPrincipal(port, connection, "read-only").catch(
        (error: unknown) => {
          codes.push(
            error instanceof PrincipalProvisionError ? error.code : "OTHER",
          );
        },
      );
    }
    expect(codes).toEqual([
      "PRINCIPAL_DISABLED",
      "PRINCIPAL_SCOPES_DIFFER",
      "PRINCIPAL_REVOKED",
    ]);
  });

  it("accepts a lost race whose winner left the principal in the required state", async () => {
    // Read says absent, the insert loses, and the re-read finds exactly what
    // this consent wanted. That is a success: the outcome is the point, not
    // which caller produced it.
    let reads = 0;
    const port = {
      findPrincipal: async () => (reads++ === 0 ? null : existing()),
      writePrincipal: async () => null,
    } as unknown as PrincipalRegistry;
    await expect(
      provisionPrincipal(port, connection, "read-only"),
    ).resolves.toBeUndefined();
  });

  it("refuses a lost race whose winner left it in any other state", async () => {
    let reads = 0;
    const port = {
      findPrincipal: async () =>
        reads++ === 0 ? null : existing({ enabled: false }),
      writePrincipal: async () => null,
    } as unknown as PrincipalRegistry;
    await expect(
      provisionPrincipal(port, connection, "read-only"),
    ).rejects.toThrow(PrincipalProvisionError);
  });
});
