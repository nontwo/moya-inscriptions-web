import {
  admitGrant,
  admitWrite,
  authorizeConnection,
  openConnection,
  reconnectConnection,
  reconsentConnection,
  revokeConnection,
} from "admin/agent-connections";
import { describe, expect, it } from "vitest";

import type { AgentConnection, VerifiedGrant } from "admin/agent-connections";

/**
 * Agent Connections V1 (Issue #141 r9): connect, disconnect, reconnect.
 *
 * Disconnect is the requirement with the most ways to be quietly wrong — an
 * unexpired token that still works, a refresh that restores access, a live
 * session that keeps going, or a reconnect that resurrects what was revoked.
 * Each of those has a regression here.
 */

const ISSUER = "https://auth.artvenn.invalid";
const RESOURCE = "https://admin.artvenn.invalid/api/mcp";
const ENVIRONMENT = "development";
const CLIENT_ID = "artvenn-claude-desktop-01";
const READ_ONLY_SCOPES = ["comments:read", "content:read", "users:read"];
const MANAGEMENT_SCOPES = [
  "comments:moderate",
  "comments:read",
  "content:read",
  "featured:write",
  "operations:execute",
  "operations:undo",
  "users:read",
];
const AT = "2026-09-18T01:00:00";

const expected = {
  issuer: ISSUER,
  resource: RESOURCE,
  environment: ENVIRONMENT,
};

const fresh = () =>
  openConnection({
    id: "conn-1",
    principalLabel: "agent-phone",
    humanAccountId: "user-owner",
    client: "claude",
    oauthClientId: CLIENT_ID,
    environment: ENVIRONMENT,
  });

const consent = (
  over: Partial<{
    humanAccountId: string;
    preset: AgentConnection["preset"];
    at: string;
  }> = {},
) => ({
  humanAccountId: over.humanAccountId ?? "user-owner",
  preset: over.preset ?? ("read-only" as const),
  at: over.at ?? AT,
});

/** A token minted for a connection exactly as it stood at that moment. */
const tokenFor = (connection: AgentConnection): VerifiedGrant => ({
  connectionId: connection.id,
  subject: connection.humanAccountId,
  clientId: connection.oauthClientId,
  resource: RESOURCE,
  issuer: ISSUER,
  scopes:
    connection.preset === "management" ? MANAGEMENT_SCOPES : READ_ONLY_SCOPES,
  generation: connection.generation,
});

describe("opening and consenting", () => {
  it("opens powerless: awaiting consent, read-only, and unable to mint anything", () => {
    const connection = fresh();
    expect(connection.status).toBe("awaiting-consent");
    expect(connection.preset).toBe("read-only");
    expect(connection.generation).toBe(0);
  });

  it("defaults to read-only rather than acquiring management by omission", () => {
    expect(fresh().preset).toBe("read-only");
    expect(openConnection({ ...fresh(), preset: "management" }).preset).toBe(
      "management",
    );
  });

  it("refuses consent from somebody other than the bound human instead of re-pointing the connection", () => {
    expect(() =>
      authorizeConnection(fresh(), consent({ humanAccountId: "user-other" })),
    ).toThrow("CONNECTION_CONSENT_SUBJECT_MISMATCH");
  });

  it("authorizes into a generation that can mint tokens", () => {
    const authorized = authorizeConnection(fresh(), consent());
    expect(authorized.status).toBe("authorized");
    expect(authorized.generation).toBe(1);
    expect(authorized.revokedAt).toBeNull();
  });
});

describe("raising permission is a new consent, not an edit", () => {
  it("bumps the generation so tokens minted under the narrower preset stop working", () => {
    const readOnly = authorizeConnection(fresh(), consent());
    const narrowToken = tokenFor(readOnly);
    const managed = reconsentConnection(
      readOnly,
      consent({ preset: "management" }),
    );
    expect(managed.preset).toBe("management");
    expect(managed.generation).toBeGreaterThan(readOnly.generation);
    // The live session does not silently widen; it stops.
    expect(() => admitGrant(narrowToken, managed, expected)).toThrow(
      "CONNECTION_GENERATION_STALE",
    );
  });
});

describe("disconnect", () => {
  it("denies an unexpired access token on its next protected request", () => {
    const authorized = authorizeConnection(fresh(), consent());
    const live = tokenFor(authorized);
    expect(admitGrant(live, authorized, expected).id).toBe("conn-1");
    const revoked = revokeConnection(authorized, AT);
    expect(() => admitGrant(live, revoked, expected)).toThrow(
      "CONNECTION_REVOKED",
    );
  });

  it("denies a refresh attempt by the same generation rule, so refresh cannot restore access", () => {
    const authorized = authorizeConnection(fresh(), consent());
    const refreshGeneration = authorized.generation;
    const revoked = revokeConnection(authorized, AT);
    expect(() => admitWrite(revoked, refreshGeneration)).toThrow(
      "CONNECTION_REVOKED",
    );
  });

  it("stops a live MCP session admitting any NEW write after revocation", () => {
    const authorized = authorizeConnection(fresh(), consent());
    const sessionGeneration = authorized.generation;
    expect(() => admitWrite(authorized, sessionGeneration)).not.toThrow();
    const revoked = revokeConnection(authorized, AT);
    expect(() => admitWrite(revoked, sessionGeneration)).toThrow(
      "CONNECTION_REVOKED",
    );
  });

  it("is idempotent: a second disconnect neither fails nor churns the generation", () => {
    const revoked = revokeConnection(
      authorizeConnection(fresh(), consent()),
      AT,
    );
    const again = revokeConnection(revoked, "2026-09-18T02:00:00");
    expect(again.generation).toBe(revoked.generation);
    expect(again.revokedAt).toBe(revoked.revokedAt);
  });

  it("leaves another connection entirely alone", () => {
    const mine = authorizeConnection(fresh(), consent());
    const theirs = authorizeConnection(
      openConnection({
        id: "conn-2",
        principalLabel: "agent-desk",
        humanAccountId: "user-owner",
        client: "codex",
        oauthClientId: CLIENT_ID,
        environment: ENVIRONMENT,
      }),
      consent(),
    );
    revokeConnection(mine, AT);
    expect(admitGrant(tokenFor(theirs), theirs, expected).id).toBe("conn-2");
  });
});

describe("reconnect is a fresh consent, not a restoration", () => {
  it("produces a generation beyond the revocation, so nothing from before the disconnect works again", () => {
    const authorized = authorizeConnection(fresh(), consent());
    const beforeDisconnect = tokenFor(authorized);
    const revoked = revokeConnection(authorized, AT);
    const reconnected = reconnectConnection(revoked, consent());

    expect(reconnected.status).toBe("authorized");
    expect(reconnected.revokedAt).toBeNull();
    expect(reconnected.generation).toBeGreaterThan(revoked.generation);
    // The decisive assertion: reconnecting is not undoing.
    expect(() => admitGrant(beforeDisconnect, reconnected, expected)).toThrow(
      "CONNECTION_GENERATION_STALE",
    );
  });

  it("refuses to reconnect a connection that was never disconnected", () => {
    expect(() =>
      reconnectConnection(authorizeConnection(fresh(), consent()), consent()),
    ).toThrow("CONNECTION_NOT_REVOKED");
  });

  it("refuses a reconnect consented to by somebody else", () => {
    const revoked = revokeConnection(
      authorizeConnection(fresh(), consent()),
      AT,
    );
    expect(() =>
      reconnectConnection(revoked, consent({ humanAccountId: "user-other" })),
    ).toThrow("CONNECTION_CONSENT_SUBJECT_MISMATCH");
  });

  it("cannot be reached by re-authorizing a revoked connection through the consent path", () => {
    const revoked = revokeConnection(
      authorizeConnection(fresh(), consent()),
      AT,
    );
    expect(() => authorizeConnection(revoked, consent())).toThrow(
      "CONNECTION_REVOKED",
    );
  });

  it("does not restore the previous preset by itself: the new consent decides", () => {
    const managed = authorizeConnection(
      fresh(),
      consent({ preset: "management" }),
    );
    const reconnected = reconnectConnection(
      revokeConnection(managed, AT),
      consent({ preset: "read-only" }),
    );
    expect(reconnected.preset).toBe("read-only");
  });
});

describe("write admission", () => {
  it("admits a write only at the exact generation the token was minted under", () => {
    const authorized = authorizeConnection(fresh(), consent());
    expect(() => admitWrite(authorized, authorized.generation)).not.toThrow();
    expect(() => admitWrite(authorized, authorized.generation - 1)).toThrow(
      "CONNECTION_GENERATION_STALE",
    );
  });

  it("refuses a write under a connection still awaiting consent", () => {
    expect(() => admitWrite(fresh(), 0)).toThrow("CONNECTION_NOT_AUTHORIZED");
  });

  it("governs starting work only: revoke is not undo, so a committed operation keeps its receipt", () => {
    // admitWrite is the whole surface for revocation, and it takes no
    // already-committed operation as input. That is the design, pinned here so
    // a later change cannot quietly make disconnect reach backwards.
    expect(admitWrite.length).toBe(2);
  });
});
