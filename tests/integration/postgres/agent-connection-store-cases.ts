import { randomBytes } from "node:crypto";

import {
  AgentConnectionInvariantError,
  AgentConnectionRowError,
  createAgentConnectionStore,
  parseConnectionRow,
} from "@moya/community-postgres";
import { afterEach, describe, expect, it } from "vitest";

import type { StoredConnection } from "@moya/community-postgres";
import type { createPostgresPool } from "@moya/catalog-postgres";

/**
 * Agent Connections V1 (Issue #141 r14 §4) — the canonical authority, now in
 * a row rather than in a `MemoryStore`.
 *
 * Until r14 the only `ConnectionStore` anywhere in the repository was a
 * `MemoryStore` in a unit test, and no production code read
 * `community.agent_connections` at all. These cases exercise the real adapter
 * against the real schema, including the invariants the r13 triggers enforce.
 *
 * Two distinctions here are the whole point, because getting either backwards
 * inverts a security decision rather than merely failing a test:
 *
 *  - a lost compare-and-set returns NULL (the authority re-decides), while an
 *    unavailable authority THROWS (the authority stops and fails closed);
 *  - authorization reads identity from the FROZEN grant, never from the
 *    connection row, whose client and subject stay writable by design.
 */
export const registerAgentConnectionStoreTests = (
  pool: ReturnType<typeof createPostgresPool>,
) => {
  describe("Agent connection store on PostgreSQL", () => {
    const store = createAgentConnectionStore({ pool });
    const newId = () => `conn-${randomBytes(16).toString("hex")}`;

    const connectionFields = (
      overrides: Partial<StoredConnection> = {},
    ): StoredConnection => ({
      id: newId(),
      principalLabel: "agent-phone",
      humanAccountId: "user-owner",
      client: "claude",
      oauthClientId: "artvenn-claude-01",
      environment: "development",
      preset: "read-only",
      status: "awaiting-consent",
      generation: 0,
      revokedAt: null,
      consentedAt: null,
      ...overrides,
    });

    const addGrant = async (
      grantId: string,
      connectionId: string,
      generationAtConsent: number,
      identity: { clientId?: string; subject?: string } = {},
    ) => {
      await pool.query(
        `INSERT INTO community.agent_connection_grants
           (grant_id, connection_id, generation_at_consent, oauth_client_id,
            human_subject, issuer, resource, capability_scopes,
            protocol_scopes, preset_at_consent)
         VALUES ($1,$2,$3,$4,$5,'https://auth.invalid','https://resource.invalid',
                 '{artvenn:read}','{offline_access}','read-only')`,
        [
          grantId,
          connectionId,
          generationAtConsent,
          identity.clientId ?? "artvenn-claude-01",
          identity.subject ?? "user-owner",
        ],
      );
    };

    it("refuses a stored value the consented shape will not accept", async () => {
      // Carry-forward C2 from the r14 review: reverting all four frozen-field
      // parsers to bare `text()` left 403 tests passing, so the bounds were
      // unwitnessed. The gap is real and specific: the column CHECK counts
      // CHARACTERS (`char_length(oauth_client_id) BETWEEN 1 AND 1024`) while
      // the consented shape bounds UTF-8 BYTES, so a value can be perfectly
      // storable and still be something authorization must not accept.
      const id = newId();
      const wide = "字".repeat(400); // 400 characters, 1200 UTF-8 bytes
      await pool.query(
        `INSERT INTO community.agent_connections
           (id, human_account_id, client_family, oauth_client_id, environment,
            principal_label, preset, status)
         VALUES ($1,'user-owner','claude',$2,'development','agent-wide',
                 'read-only','awaiting-consent')`,
        [id, wide],
      );
      // Storable: the database accepted it.
      const { rows } = await pool.query(
        "SELECT char_length(oauth_client_id) AS chars FROM community.agent_connections WHERE id=$1",
        [id],
      );
      expect(Number((rows[0] as { chars: string }).chars)).toBe(400);
      // And refused on the way out, rather than reaching a comparison.
      await expect(store.read(id)).rejects.toBeInstanceOf(
        AgentConnectionRowError,
      );
      // One witness, not four, and deliberately: `principal_label` is checked
      // by the SAME pattern in the column and in the schema, so there is no
      // storable-but-unacceptable value to write. The byte-versus-character
      // gap on the client id is the one place the two genuinely disagree, and
      // it is the one the r14 review named.
    });

    afterEach(async () => {
      // A consent references its connection, so this leaf goes before the
      // connection does, exactly like the wrappers below it.
      await pool.query("DELETE FROM community.agent_connection_consents");
      await pool.query("DELETE FROM community.agent_connection_wrappers");
      await pool.query(
        "UPDATE community.agent_connections SET current_grant_id=NULL",
      );
      await pool.query("DELETE FROM community.agent_connection_grants");
      await pool.query("DELETE FROM community.agent_connections");
    });

    describe("a connection becomes a row, and comes back the shape it went in", () => {
      it("round-trips every field, with BIGINT as a number and TIMESTAMPTZ as an offset instant", async () => {
        const at = new Date().toISOString();
        const fields = connectionFields({
          status: "authorized",
          generation: 3,
          consentedAt: at,
        });
        const created = await store.create(fields);
        expect(created).not.toBeNull();
        // A fresh row starts at version 1, not 0 — the column default.
        expect(created?.version).toBe(1);

        const read = await store.read(fields.id);
        expect(read?.connection).toEqual(fields);
        // The two conversions node-postgres does NOT do for us. `generation`
        // arrives as the string "3" and `consented_at` as a Date; the
        // consented shape's zod schema rejects both.
        expect(typeof read?.connection.generation).toBe("number");
        expect(typeof read?.version).toBe("number");
        expect(read?.connection.consentedAt).toBe(at);
      });

      it("refuses to re-open an id, because reusing one revalidates its previous life", async () => {
        const fields = connectionFields();
        expect(await store.create(fields)).not.toBeNull();
        // Not an exception: a null result is "that id is taken". Re-opening
        // would reset generation to 0 and make a generation-1 token from the
        // id's previous life valid again after the next consent.
        expect(
          await store.create(connectionFields({ id: fields.id })),
        ).toBeNull();
      });

      it("refuses a shape the database will not accept, as an invariant rather than an outage", async () => {
        await expect(
          store.create(connectionFields({ id: "conn-not-hex" })),
        ).rejects.toBeInstanceOf(AgentConnectionInvariantError);
        await expect(
          store.create(connectionFields({ principalLabel: "agent-A" })),
        ).rejects.toMatchObject({ sqlState: "23514" });
      });

      it("answers null for an absent connection and throws when it cannot answer at all", async () => {
        expect(await store.read(newId())).toBeNull();
        // The distinction the authority depends on: a store that returned
        // null here would turn "the database is down" into the definite
        // answer "there is no such connection", which is fail-OPEN.
        const broken = createAgentConnectionStore({
          pool: {
            query: () => Promise.reject(new Error("pool exhausted")),
          },
        });
        await expect(broken.read("conn-anything")).rejects.toThrow(
          /pool exhausted/u,
        );
      });
    });

    describe("compare-and-set is one conditional statement", () => {
      it("stores at the expected version and hands back the new one", async () => {
        const fields = connectionFields();
        await store.create(fields);
        const written = await store.compareAndSet(fields.id, 1, {
          ...fields,
          status: "authorized",
          generation: 1,
          consentedAt: new Date().toISOString(),
        });
        expect(written?.version).toBe(2);
        expect(written?.connection.status).toBe("authorized");
      });

      it("returns null rather than throwing when another writer moved first", async () => {
        const fields = connectionFields();
        await store.create(fields);
        await store.compareAndSet(fields.id, 1, {
          ...fields,
          preset: "management",
        });
        // Stale expectation. This MUST be null: the authority reads null as
        // "re-decide against what is actually there" and reads a throw as
        // "the authority is unavailable" and stops. Reporting contention as
        // an exception silently disables the entire retry protocol.
        expect(
          await store.compareAndSet(fields.id, 1, {
            ...fields,
            preset: "read-only",
          }),
        ).toBeNull();
      });

      it("lets exactly one of two racing writers win at the same version", async () => {
        const fields = connectionFields();
        await store.create(fields);
        const [a, b] = await Promise.all([
          store.compareAndSet(fields.id, 1, {
            ...fields,
            preset: "management",
          }),
          store.compareAndSet(fields.id, 1, { ...fields, environment: "qa" }),
        ]);
        expect([a, b].filter((r) => r !== null)).toHaveLength(1);
      });

      it("reports a trigger refusal as an invariant, not as a lost race", async () => {
        const fields = connectionFields({
          status: "authorized",
          generation: 5,
        });
        await store.create({
          ...fields,
          consentedAt: new Date().toISOString(),
        });
        // The monotonic trigger refuses a backwards generation. A null here
        // would send the authority around its retry loop against a write the
        // database will never accept.
        await expect(
          store.compareAndSet(fields.id, 1, {
            ...fields,
            generation: 1,
            consentedAt: new Date().toISOString(),
          }),
        ).rejects.toMatchObject({ sqlState: "23001" });
      });

      it("freezes the acting principal, which the consent grant cannot hold", async () => {
        // The r14 review's deepest finding. `principal_label` becomes
        // `req.user.agentPrincipal`, and the Backend derives scopes,
        // delegations and fencing from it — but it is not on the grant, so
        // moving r14's identity checks to the frozen snapshot did not cover
        // it. Rewriting it re-points an existing unexpired token at a
        // different, possibly more privileged principal, with no generation
        // bump and no new consent.
        const fields = connectionFields({
          status: "authorized",
          generation: 1,
          consentedAt: new Date().toISOString(),
        });
        await store.create(fields);
        await expect(
          store.compareAndSet(fields.id, 1, {
            ...fields,
            principalLabel: "agent-privileged",
          }),
        ).rejects.toMatchObject({ sqlState: "23001" });
        // Everything the LIFECYCLE moves still moves; only identity is held.
        // `environment` used to be the control here and became frozen in r15,
        // so the control is now a column a real transition actually writes.
        expect(
          await store.compareAndSet(fields.id, 1, {
            ...fields,
            status: "revoked",
            revokedAt: new Date().toISOString(),
            generation: 2,
          }),
        ).not.toBeNull();
      });

      it("refuses to write one connection's state onto another's id", async () => {
        const fields = connectionFields();
        await store.create(fields);
        await expect(
          store.compareAndSet(fields.id, 1, connectionFields()),
        ).rejects.toBeInstanceOf(AgentConnectionRowError);
      });
    });

    describe("authorization reads identity from the grant, never from the connection", () => {
      it("returns the frozen grant beside the connection whose state decides revocation", async () => {
        const fields = connectionFields({
          status: "authorized",
          generation: 1,
          consentedAt: new Date().toISOString(),
        });
        await store.create(fields);
        await addGrant("g-auth-1", fields.id, 1);
        await pool.query(
          "UPDATE community.agent_connections SET current_grant_id=$2 WHERE id=$1",
          [fields.id, "g-auth-1"],
        );

        const read = await store.readForAuthorization(fields.id);
        expect(read?.connection.id).toBe(fields.id);
        expect(read?.grant).toMatchObject({
          grantId: "g-auth-1",
          generationAtConsent: 1,
          oauthClientId: "artvenn-claude-01",
          humanSubject: "user-owner",
          presetAtConsent: "read-only",
        });
      });

      it("reads identity from the grant even when the connection says something else", async () => {
        // The property is unchanged since r14: authorization takes identity
        // from the FROZEN grant, never from the connection row. The mechanism
        // had to change, and the reason is worth recording.
        //
        // This used to prove it by REWRITING the connection's identity
        // columns, which r13's own COMMENT ON TABLE described as writable by
        // design. r15 froze them — closing the provider's forged-consent path
        // meant granting the control plane a column list wide enough for
        // `compareAndSet`, and `human_account_id` is the only key the Owner's
        // disconnect is scoped by. So the rewrite is no longer possible, which
        // is strictly safer and makes this test's old mechanism unavailable.
        //
        // The disagreement is therefore built rather than created: the
        // connection carries one identity from the moment it is opened, the
        // grant carries another, and the read must return the grant's.
        const fields = connectionFields({
          status: "authorized",
          generation: 1,
          consentedAt: new Date().toISOString(),
        });
        await store.create(fields);
        await addGrant("g-auth-2", fields.id, 1, {
          clientId: "artvenn-frozen-client",
          subject: "user-who-consented",
        });
        await pool.query(
          "UPDATE community.agent_connections SET current_grant_id=$2 WHERE id=$1",
          [fields.id, "g-auth-2"],
        );

        const read = await store.readForAuthorization(fields.id);
        // The connection says one thing...
        expect(read?.connection.oauthClientId).toBe("artvenn-claude-01");
        expect(read?.connection.humanAccountId).toBe("user-owner");
        // ...and the frozen grant, which is what authorization reads, says
        // the other. r14's column-collision defect made these agree by
        // silently overwriting the connection's values with the grant's.
        expect(read?.grant?.oauthClientId).toBe("artvenn-frozen-client");
        expect(read?.grant?.humanSubject).toBe("user-who-consented");
      });

      it("reports a connection with no current grant as present-but-ungranted", async () => {
        const fields = connectionFields();
        await store.create(fields);
        const read = await store.readForAuthorization(fields.id);
        // Present, so the boundary can refuse it with a reason. Dropping the
        // row here would report a real connection as CONNECTION_NOT_FOUND.
        expect(read?.connection.id).toBe(fields.id);
        expect(read?.grant).toBeNull();
      });

      it("finds a grant by its own id, including one no connection points at", async () => {
        const fields = connectionFields();
        await store.create(fields);
        await addGrant("g-orphan", fields.id, 0);
        expect(await store.readGrant("g-orphan")).toMatchObject({
          grantId: "g-orphan",
          connectionId: fields.id,
          generationAtConsent: 0,
          destroyStatus: "not-requested",
          destroyedAt: null,
        });
        expect(await store.readGrant("g-absent")).toBeNull();
      });
    });

    describe("a row that does not parse is refused, not partially believed", () => {
      it("refuses an unsafe BIGINT rather than silently converting it", () => {
        expect(() =>
          parseConnectionRow({
            id: "conn-x",
            principal_label: "agent-probe",
            human_account_id: "u",
            client_family: "claude",
            oauth_client_id: "c",
            environment: "development",
            preset: "read-only",
            status: "authorized",
            // Past Number.MAX_SAFE_INTEGER: Number() would round it and every
            // later generation comparison would be wrong forever after.
            generation: "9007199254740993",
            version: "1",
            revoked_at: null,
            consented_at: null,
          }),
        ).toThrow(/BIGINT_OUT_OF_SAFE_RANGE/u);
      });

      it("refuses a family outside the slug shape, and accepts one the presets never listed", () => {
        // The family stopped being a three-value enum: ArtVenn is a tool
        // service, and a new approved client is a registration rather than a
        // schema change. What did NOT stop is the bound — this parser sits on
        // the authorization READ path, so it has to agree with the column's
        // CHECK or a row the database accepted becomes a connection nobody
        // can authenticate against.
        const row = (client_family: string) => ({
          id: "conn-x",
          principal_label: "agent-probe",
          human_account_id: "u",
          client_family,
          oauth_client_id: "c",
          environment: "development",
          preset: "read-only",
          status: "authorized",
          generation: "1",
          version: "1",
          revoked_at: null,
          consented_at: null,
        });
        // A vendor nobody enumerated parses, which is the point.
        expect(parseConnectionRow(row("copilot")).connection.client).toBe(
          "copilot",
        );
        for (const family of [
          "",
          "-leading",
          "Upper",
          "under_score",
          "with space",
          "a".repeat(33),
        ])
          // Either refusal code is correct: an empty string is caught one
          // layer earlier by the text check (NOT_TEXT), everything else by
          // the pattern (MALFORMED). The property is that the row is refused
          // and the column is named, not which of the two guards got there
          // first.
          expect(() => parseConnectionRow(row(family)), family).toThrow(
            /(?:MALFORMED|NOT_TEXT) \(client_family\)/u,
          );
      });
    });
  });
};
