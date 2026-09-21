import { createCipheriv, createHash, randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { createPostgresPool } from "@moya/catalog-postgres";

/**
 * Agent Connections V1 (Issue #141 r13): the canonical connection authority in
 * PostgreSQL.
 *
 * What these cases exist to hold is the r12 vulnerability. A connection
 * accumulates one provider grant per consent, and every old grant must keep
 * resolving to the generation that was current when its human consented. If a
 * token refreshed from an old grant could resolve to the CURRENT generation, a
 * client that was disconnected would be re-admitted by a reconnect it had no
 * part in.
 *
 * The schema makes that impossible rather than asking application code to
 * remember: a wrapper row carries `(grant_id, connection_id, generation)` and
 * a composite foreign key points it at the grant's frozen identity tuple, so a
 * disagreeing row cannot be inserted at all.
 *
 * The r13 review found that claim was only half true as first written. The
 * foreign key restricts once a WRAPPER exists; a grant exists from consent,
 * and in that window `generation_at_consent` could be rewritten (measured:
 * 1 -> 99). The freeze is now a trigger, and the migration that added it says
 * so. What is proven here is the PERSISTENCE link of the r12 property -- a
 * wrapper cannot claim a generation its grant did not freeze, and neither row
 * can be edited afterwards. The other links (a writer that records a grant at
 * consent, a reader that refuses an old generation, provider-side grant
 * destruction) do not exist yet, and nothing here should be read as proving
 * them.
 */
export const registerAgentConnectionTests = (
  pool: ReturnType<typeof createPostgresPool>,
) => {
  describe("Agent connections on PostgreSQL", () => {
    const connectionId = () => `conn-${randomBytes(16).toString("hex")}`;
    const digest = () => randomBytes(32).toString("hex");
    /** Shaped like real AEAD output: 12-byte nonce, 16-byte tag, body. */
    const sealed = () => randomBytes(29 + 16);

    let connection: string;

    /**
     * A human who is not the Owner of the connection under test.
     *
     * Several cases here need a SECOND connection to point a grant, a wrapper
     * or a cleanup at, and since migration 20260921010000 a second connection
     * for one (human, client) pair is the thing the schema forbids. So the
     * other connection belongs to somebody else. Nothing these cases assert
     * depends on who: they are about foreign keys and freezes between rows,
     * and no trigger compares a connection's human to its grant's subject.
     */
    const anotherHuman = () => `user-other-${randomBytes(6).toString("hex")}`;

    const openConnection = async (
      overrides: Partial<{
        status: string;
        generation: number;
        currentGrantId: string | null;
        consentedAt: string | null;
        revokedAt: string | null;
        humanAccountId: string;
      }> = {},
    ) => {
      const id = connectionId();
      await pool.query(
        `INSERT INTO community.agent_connections
           (id, human_account_id, client_family, oauth_client_id, environment,
            principal_label, preset, status, generation, current_grant_id,
            consented_at, revoked_at)
         VALUES ($1,$7,'claude','artvenn-claude-01','development',
                 'agent-phone','read-only',$2,$3,$4,$5,$6)`,
        [
          id,
          overrides.status ?? "authorized",
          overrides.generation ?? 1,
          overrides.currentGrantId ?? null,
          overrides.consentedAt === undefined
            ? new Date().toISOString()
            : overrides.consentedAt,
          overrides.revokedAt ?? null,
          overrides.humanAccountId ?? "user-owner",
        ],
      );
      return id;
    };

    const addGrant = async (
      grantId: string,
      generationAtConsent: number,
      onConnection = connection,
    ) => {
      await pool.query(
        `INSERT INTO community.agent_connection_grants
           (grant_id, connection_id, generation_at_consent, oauth_client_id,
            human_subject, issuer, resource, capability_scopes,
            protocol_scopes, preset_at_consent)
         VALUES ($1,$2,$3,'artvenn-claude-01','user-owner',
                 'https://auth.invalid','https://resource.invalid',
                 '{artvenn:read}','{offline_access}','read-only')`,
        [grantId, onConnection, generationAtConsent],
      );
    };

    const addWrapper = (
      grantId: string,
      onConnection: string,
      generation: number,
    ) =>
      pool.query(
        `INSERT INTO community.agent_connection_wrappers
           (lookup_digest, sealed_jti, grant_id, connection_id, generation,
            expires_at)
         VALUES ($1,$2,$3,$4,$5, CURRENT_TIMESTAMP + interval '5 minutes')`,
        [digest(), sealed(), grantId, onConnection, generation],
      );

    beforeEach(async () => {
      connection = await openConnection();
    });

    afterEach(async () => {
      // Own tables only, in foreign-key order. `current_grant_id` is now a
      // real foreign key, so the pointer is released before the grants it
      // points at are removed.
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

    describe("relational integrity", () => {
      it("opens a connection that has no consent grant yet", async () => {
        const id = await openConnection({
          status: "awaiting-consent",
          generation: 0,
          consentedAt: null,
          humanAccountId: anotherHuman(),
        });
        const { rows } = await pool.query(
          `SELECT status, generation, current_grant_id, consented_at
             FROM community.agent_connections WHERE id=$1`,
          [id],
        );
        expect(rows[0]).toMatchObject({
          status: "awaiting-consent",
          generation: "0",
          current_grant_id: null,
          consented_at: null,
        });
      });

      it("refuses a consent timestamp on a connection still awaiting consent", async () => {
        await expect(
          openConnection({ status: "awaiting-consent", generation: 0 }),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("refuses a revoked status with no revocation timestamp, and the reverse", async () => {
        await expect(
          openConnection({ status: "revoked", revokedAt: null }),
        ).rejects.toMatchObject({ code: "23514" });
        await expect(
          openConnection({
            status: "authorized",
            revokedAt: new Date().toISOString(),
          }),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("keeps every historical grant across a reconnect, with its own frozen generation", async () => {
        await addGrant("grant-r1", 1);
        await addGrant("grant-r2", 3);
        await pool.query(
          `UPDATE community.agent_connections
              SET generation=3, current_grant_id='grant-r2', version=version+1
            WHERE id=$1`,
          [connection],
        );
        const { rows } = await pool.query(
          `SELECT grant_id, generation_at_consent
             FROM community.agent_connection_grants
            WHERE connection_id=$1 ORDER BY grant_id`,
          [connection],
        );
        expect(rows).toEqual([
          { grant_id: "grant-r1", generation_at_consent: "1" },
          { grant_id: "grant-r2", generation_at_consent: "3" },
        ]);
      });

      it("refuses a current_grant_id belonging to another connection, or to nothing", async () => {
        const other = await openConnection({
          humanAccountId: anotherHuman(),
        });
        await addGrant("grant-elsewhere", 1, other);
        // Previously unconstrained, so cleanup could have been pointed at
        // someone else's grant. Now a composite foreign key.
        await expect(
          pool.query(
            `UPDATE community.agent_connections SET current_grant_id=$2 WHERE id=$1`,
            [connection, "grant-elsewhere"],
          ),
        ).rejects.toMatchObject({ code: "23503" });
        await expect(
          pool.query(
            `UPDATE community.agent_connections SET current_grant_id='nowhere' WHERE id=$1`,
            [connection],
          ),
        ).rejects.toMatchObject({ code: "23503" });
        await addGrant("grant-mine", 1);
        await expect(
          pool.query(
            `UPDATE community.agent_connections SET current_grant_id='grant-mine' WHERE id=$1`,
            [connection],
          ),
        ).resolves.toEqual(expect.objectContaining({ rowCount: 1 }));
      });

      it("refuses a grant for a connection that does not exist", async () => {
        await expect(
          addGrant("grant-orphan", 1, connectionId()),
        ).rejects.toMatchObject({ code: "23503" });
      });

      it("does not cascade a connection delete over its history", async () => {
        await addGrant("grant-r1", 1);
        await expect(
          pool.query("DELETE FROM community.agent_connections WHERE id=$1", [
            connection,
          ]),
        ).rejects.toMatchObject({ code: "23503" });
      });
    });

    describe("the wrapper cannot disagree with its grant", () => {
      it("accepts a wrapper carrying the grant's frozen generation", async () => {
        await addGrant("grant-r1", 1);
        await expect(addWrapper("grant-r1", connection, 1)).resolves.toEqual(
          expect.objectContaining({ rowCount: 1 }),
        );
      });

      it("refuses a wrapper claiming the CURRENT generation on an OLD grant", async () => {
        // This is the resurrection attempt, and the database refuses it. The
        // connection has moved to generation 3; a token minted from the old
        // grant may not be recorded as if it belonged to the new one.
        await addGrant("grant-r1", 1);
        await addGrant("grant-r2", 3);
        await pool.query(
          `UPDATE community.agent_connections SET generation=3 WHERE id=$1`,
          [connection],
        );
        await expect(
          addWrapper("grant-r1", connection, 3),
        ).rejects.toMatchObject({ code: "23503" });
      });

      it("refuses a wrapper pointing at another connection", async () => {
        await addGrant("grant-r1", 1);
        const other = await openConnection({
          humanAccountId: anotherHuman(),
        });
        await expect(addWrapper("grant-r1", other, 1)).rejects.toMatchObject({
          code: "23503",
        });
      });

      it("refuses a wrapper for a grant that does not exist", async () => {
        await expect(
          addWrapper("grant-missing", connection, 1),
        ).rejects.toMatchObject({ code: "23503" });
      });

      it("refuses a second wrapper with the same lookup digest", async () => {
        await addGrant("grant-r1", 1);
        const shared = digest();
        const insert = () =>
          pool.query(
            `INSERT INTO community.agent_connection_wrappers
               (lookup_digest, sealed_jti, grant_id, connection_id, generation,
                expires_at)
             VALUES ($1,$2,'grant-r1',$3,1, CURRENT_TIMESTAMP + interval '5 minutes')`,
            [shared, sealed(), connection],
          );
        await insert();
        await expect(insert()).rejects.toMatchObject({ code: "23505" });
      });

      it("stores neither the wrapper value nor the provider identifier it stands for", async () => {
        // The r13 review caught the previous version of this test asserting
        // that `randomBytes(45)` does not contain a prefix — it could not
        // fail, while being the headline privacy claim for this table. This
        // seals a REAL identifier with the real primitives and then searches
        // the whole row, in three renderings, for either secret.
        const wrapperValue = `artvenn_ct_${randomBytes(32).toString("base64url")}`;
        const providerJti = `jti-${randomBytes(16).toString("hex")}`;
        const lookup = createHash("sha256").update(wrapperValue).digest("hex");
        const key = createHash("sha256")
          .update(`artvenn-wrap|${wrapperValue}`)
          .digest();
        const nonce = randomBytes(12);
        const cipher = createCipheriv("aes-256-gcm", key, nonce);
        const body = Buffer.concat([
          cipher.update(providerJti, "utf8"),
          cipher.final(),
        ]);
        const sealedJti = Buffer.concat([nonce, cipher.getAuthTag(), body]);

        await addGrant("grant-r1", 1);
        await pool.query(
          `INSERT INTO community.agent_connection_wrappers
             (lookup_digest, sealed_jti, grant_id, connection_id, generation,
              expires_at)
           VALUES ($1,$2,'grant-r1',$3,1, CURRENT_TIMESTAMP + interval '5 minutes')`,
          [lookup, sealedJti, connection],
        );

        const { rows } = await pool.query(
          `SELECT lookup_digest,
                  encode(sealed_jti, 'escape') AS sealed_text,
                  encode(sealed_jti, 'hex') AS sealed_hex
             FROM community.agent_connection_wrappers`,
        );
        const row = rows[0];
        const haystack = `${row.lookup_digest}|${row.sealed_text}|${row.sealed_hex}`;
        expect(haystack).not.toContain(wrapperValue);
        expect(haystack).not.toContain(providerJti);
        expect(haystack).not.toContain(
          Buffer.from(providerJti, "utf8").toString("hex"),
        );
        // And the digest really is of the wrapper, so the row stays findable.
        expect(row.lookup_digest).toBe(lookup);
      });
    });

    describe("the consent snapshot is genuinely immutable", () => {
      it("refuses to rewrite the frozen generation, even before any wrapper exists", async () => {
        // The composite foreign key only restricts once a wrapper references
        // the tuple, and a grant exists from consent while the first wrapper
        // exists only once a token is minted. In that window this rewrote
        // 1 -> 99. Measured, then fixed with a trigger.
        await addGrant("grant-r1", 1);
        await expect(
          pool.query(
            `UPDATE community.agent_connection_grants
                SET generation_at_consent=99 WHERE grant_id='grant-r1'`,
          ),
        ).rejects.toMatchObject({ code: "23001" });
        const { rows } = await pool.query(
          `SELECT generation_at_consent FROM community.agent_connection_grants
            WHERE grant_id='grant-r1'`,
        );
        expect(rows[0].generation_at_consent).toBe("1");
      });

      it("refuses to move a grant to another connection, or to rewrite what was consented to", async () => {
        await addGrant("grant-r1", 1);
        const other = await openConnection({
          humanAccountId: anotherHuman(),
        });
        for (const sql of [
          `UPDATE community.agent_connection_grants SET connection_id='${other}' WHERE grant_id='grant-r1'`,
          "UPDATE community.agent_connection_grants SET oauth_client_id='other' WHERE grant_id='grant-r1'",
          "UPDATE community.agent_connection_grants SET human_subject='someone-else' WHERE grant_id='grant-r1'",
          "UPDATE community.agent_connection_grants SET capability_scopes='{artvenn:manage}' WHERE grant_id='grant-r1'",
          "UPDATE community.agent_connection_grants SET preset_at_consent='management' WHERE grant_id='grant-r1'",
          "UPDATE community.agent_connection_grants SET issuer='https://elsewhere' WHERE grant_id='grant-r1'",
        ])
          await expect(pool.query(sql), sql).rejects.toMatchObject({
            code: "23001",
          });
      });

      it("still lets the destruction columns move, which is the only mutable part", async () => {
        await addGrant("grant-r1", 1);
        await expect(
          pool.query(
            `UPDATE community.agent_connection_grants
                SET destroy_status='pending' WHERE grant_id='grant-r1'`,
          ),
        ).resolves.toEqual(expect.objectContaining({ rowCount: 1 }));
        await expect(
          pool.query(
            `UPDATE community.agent_connection_grants
                SET destroy_status='failed', destroyed_at=CURRENT_TIMESTAMP
              WHERE grant_id='grant-r1'`,
          ),
        ).resolves.toEqual(expect.objectContaining({ rowCount: 1 }));
      });

      it("freezes the two wrapper columns the first freeze predicate missed", async () => {
        // The r13 re-review measured both of these as ACCEPTED while the
        // migration that added the trigger said "rows are immutable except
        // invalidation". `format_version` selects the AEAD layout a sealed
        // value is opened with, so it is the column an attacker would most
        // want to move; `issued_at` is the audit record.
        await addGrant("grant-r1", 1);
        await addWrapper("grant-r1", connection, 1);
        await expect(
          pool.query(
            `UPDATE community.agent_connection_wrappers SET format_version=99`,
          ),
        ).rejects.toMatchObject({ code: "23001" });
        await expect(
          pool.query(
            `UPDATE community.agent_connection_wrappers
                SET issued_at = issued_at + interval '100 years'`,
          ),
        ).rejects.toMatchObject({ code: "23001" });
        // Invalidation is still the one thing that may move.
        await expect(
          pool.query(
            `UPDATE community.agent_connection_wrappers
                SET invalidated_at=CURRENT_TIMESTAMP`,
          ),
        ).resolves.toEqual(expect.objectContaining({ rowCount: 1 }));
      });

      it("refuses to walk a completed destruction back into looking un-attempted", async () => {
        // `app_role` holds UPDATE on exactly these two columns, and the first
        // CHECK constrained only one direction. Forging 'done' or erasing it
        // lets an operator believe provider-side cleanup happened while the
        // refresh token still redeems.
        await addGrant("grant-r1", 1);
        await pool.query(
          `UPDATE community.agent_connection_grants
              SET destroy_status='done', destroyed_at=CURRENT_TIMESTAMP
            WHERE grant_id='grant-r1'`,
        );
        await expect(
          pool.query(
            `UPDATE community.agent_connection_grants
                SET destroy_status='not-requested', destroyed_at=NULL
              WHERE grant_id='grant-r1'`,
          ),
        ).rejects.toMatchObject({ code: "23001" });
      });

      it("refuses to backdate a destruction that already happened", async () => {
        // The fact of destruction was terminal; WHEN it happened was not.
        // Measured before the fix: `destroyed_at` moved ten years while
        // `destroy_status` stayed 'done' -- and the App role holds that column,
        // so the one field an auditor reads could be rewritten by the resource
        // server.
        await addGrant("grant-r1", 1);
        await pool.query(
          `UPDATE community.agent_connection_grants
              SET destroy_status='done', destroyed_at=CURRENT_TIMESTAMP
            WHERE grant_id='grant-r1'`,
        );
        await expect(
          pool.query(
            `UPDATE community.agent_connection_grants
                SET destroyed_at = destroyed_at - interval '10 years'
              WHERE grant_id='grant-r1'`,
          ),
        ).rejects.toMatchObject({ code: "23001" });
      });

      it("refuses a destruction timestamp on a grant nobody asked to destroy", async () => {
        await addGrant("grant-r1", 1);
        await expect(
          pool.query(
            `UPDATE community.agent_connection_grants
                SET destroyed_at=CURRENT_TIMESTAMP WHERE grant_id='grant-r1'`,
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("refuses to relocate a wrapper onto another grant", async () => {
        // The composite FK validates only the NEW tuple, so without a freeze a
        // wrapper could be moved from an old grant onto the current one and
        // thereby acquire the current generation.
        await addGrant("grant-r1", 1);
        await addGrant("grant-r2", 3);
        await addWrapper("grant-r1", connection, 1);
        await expect(
          pool.query(
            `UPDATE community.agent_connection_wrappers
                SET grant_id='grant-r2', generation=3`,
          ),
        ).rejects.toMatchObject({ code: "23001" });
      });
    });

    describe("column constraints refuse a credential-shaped value", () => {
      it("bounds the cleanup error to a bare code, so a message cannot carry data", async () => {
        await expect(
          pool.query(
            `UPDATE community.agent_connections
                SET provider_cleanup_error=$2 WHERE id=$1`,
            [connection, "failed talking to https://provider/token?x=secret"],
          ),
        ).rejects.toMatchObject({ code: "23514" });
        await expect(
          pool.query(
            `UPDATE community.agent_connections
                SET provider_cleanup_error='CONNECTION_CLEANUP_FAILED' WHERE id=$1`,
            [connection],
          ),
        ).resolves.toEqual(expect.objectContaining({ rowCount: 1 }));
      });

      it("refuses a negative generation or a zero version — now via the monotonic trigger, which fires first", async () => {
        // Both are refused, but by the BEFORE UPDATE trigger (23001) rather
        // than the column CHECK (23514), because a decrease is caught before
        // the row is written. The column CHECK remains the floor for INSERT.
        await expect(
          pool.query(
            `UPDATE community.agent_connections SET generation=-1 WHERE id=$1`,
            [connection],
          ),
        ).rejects.toMatchObject({ code: "23001" });
        await expect(
          pool.query(
            `UPDATE community.agent_connections SET version=0 WHERE id=$1`,
            [connection],
          ),
        ).rejects.toMatchObject({ code: "23001" });
        // The INSERT floor is still the CHECK.
        await expect(openConnection({ generation: -1 })).rejects.toMatchObject({
          code: "23514",
        });
      });

      it("refuses an unknown preset or status", async () => {
        // `client_family` left this list in r15 for the same reason
        // `principal_label` left it in r14: the column is frozen now, so an
        // UPDATE meets the trigger FIRST and never reaches the CHECK. The
        // INSERT case below keeps the CHECK witnessed on the only path that
        // can still set it.
        for (const [column, value] of [
          ["preset", "superuser"],
          ["status", "half-authorized"],
        ] as const)
          await expect(
            pool.query(
              `UPDATE community.agent_connections SET ${column}=$2 WHERE id=$1`,
              [connection, value],
            ),
            `${column} accepted ${value}`,
          ).rejects.toMatchObject({ code: "23514" });
      });

      it("freezes the four identity columns, and still refuses an unknown family on INSERT", async () => {
        // r15: closing the provider's forged-consent path meant giving the
        // control plane a column grant wide enough for `compareAndSet`, which
        // round-trips the whole consented shape. These four are held and
        // frozen rather than withheld, so the refusal is 23001 and not 42501.
        //
        // `human_account_id` is the one that matters most: authentication
        // reads identity from the FROZEN grant, so moving it would break no
        // request at all — it would simply take a live, authenticating
        // connection out of its owner's disconnect scope.
        for (const [column, value] of [
          ["human_account_id", "user-somebody-else"],
          ["oauth_client_id", "a-different-client"],
          ["client_family", "codex"],
          ["environment", "production"],
        ] as const)
          await expect(
            pool.query(
              `UPDATE community.agent_connections SET ${column}=$2 WHERE id=$1`,
              [connection, value],
            ),
            `${column} accepted ${value}`,
          ).rejects.toMatchObject({ code: "23001" });

        // The CHECK still guards the path that can set the column — but it
        // guards a SHAPE now, not a list of three vendors. A family nobody
        // enumerated is accepted, because adding a client is a registration;
        // a family that would not fit inside `principal_label` is not.
        await expect(
          pool.query(
            `INSERT INTO community.agent_connections
               (id, human_account_id, client_family, oauth_client_id,
                environment, principal_label, preset, status)
             VALUES ($1,'user-owner','some-other-vendor','c1','development',
                     'agent-family','read-only','awaiting-consent')`,
            [`conn-${"b".repeat(32)}`],
          ),
        ).resolves.toMatchObject({ rowCount: 1 });

        for (const family of ["", "Upper", "under_score", "-leading"])
          await expect(
            pool.query(
              `INSERT INTO community.agent_connections
                 (id, human_account_id, client_family, oauth_client_id,
                  environment, principal_label, preset, status)
               VALUES ($1,'user-owner',$2,'c1','development',
                       'agent-family','read-only','awaiting-consent')`,
              [`conn-${"c".repeat(32)}`, family],
            ),
            `client_family accepted ${JSON.stringify(family)}`,
          ).rejects.toMatchObject({ code: "23514" });
      });

      it("refuses a bad principal shape on INSERT, and any principal change at all on UPDATE", async () => {
        // `principal_label` used to sit in the list above, checked by its
        // CHECK constraint on UPDATE. r14 froze the column, so an UPDATE now
        // meets the trigger FIRST and never reaches the CHECK — a different
        // SQLSTATE for a strictly stronger refusal. The CHECK still guards the
        // only path that can still set the column, which is the INSERT.
        await expect(
          pool.query(
            `INSERT INTO community.agent_connections
               (id, human_account_id, client_family, oauth_client_id,
                environment, principal_label, preset, status)
             VALUES ($1,'user-owner','claude','c1','development',
                     'not-an-agent-label','read-only','awaiting-consent')`,
            [connectionId()],
          ),
        ).rejects.toMatchObject({ code: "23514" });

        // And a WELL-shaped rename is refused too, which is the point: this is
        // not shape validation, it is identity.
        await expect(
          pool.query(
            `UPDATE community.agent_connections SET principal_label=$2 WHERE id=$1`,
            [connection, "agent-somebody-else"],
          ),
        ).rejects.toMatchObject({ code: "23001" });
      });
    });

    describe("optimistic concurrency", () => {
      it("lets exactly one of two racing transitions win at the same version", async () => {
        const { rows } = await pool.query(
          `SELECT version FROM community.agent_connections WHERE id=$1`,
          [connection],
        );
        const seen = Number(rows[0].version);
        const attempt = (generation: number) =>
          pool.query(
            `UPDATE community.agent_connections
                SET generation=$3, version=version+1
              WHERE id=$1 AND version=$2`,
            [connection, seen, generation],
          );
        const [a, b] = await Promise.all([attempt(2), attempt(3)]);
        expect((a.rowCount ?? 0) + (b.rowCount ?? 0)).toBe(1);
      });

      it("refuses a generation that moves backwards, not merely one below zero", async () => {
        // The previous version of this test set -1 and passed on the `>= 0`
        // column CHECK, while 7 -> 1 was accepted. That is the move that would
        // undo a revocation, and it is what this now pins.
        await pool.query(
          `UPDATE community.agent_connections
              SET generation=7, version=version+1 WHERE id=$1`,
          [connection],
        );
        await expect(
          pool.query(
            `UPDATE community.agent_connections SET generation=1 WHERE id=$1`,
            [connection],
          ),
        ).rejects.toMatchObject({ code: "23001" });
        await expect(
          pool.query(
            `UPDATE community.agent_connections SET version=1 WHERE id=$1`,
            [connection],
          ),
        ).rejects.toMatchObject({ code: "23001" });
        const { rows } = await pool.query(
          `SELECT generation FROM community.agent_connections WHERE id=$1`,
          [connection],
        );
        expect(rows[0].generation).toBe("7");
      });

      it("refuses un-revoking a connection at the same generation", async () => {
        await pool.query(
          `UPDATE community.agent_connections
              SET status='revoked', revoked_at=CURRENT_TIMESTAMP WHERE id=$1`,
          [connection],
        );
        await expect(
          pool.query(
            `UPDATE community.agent_connections
                SET status='authorized', revoked_at=NULL WHERE id=$1`,
            [connection],
          ),
        ).rejects.toMatchObject({ code: "23001" });
      });

      it("lets an abandoned consent be revoked, which the first CHECK forbade", async () => {
        const pending = await openConnection({
          status: "awaiting-consent",
          generation: 0,
          consentedAt: null,
          humanAccountId: anotherHuman(),
        });
        await expect(
          pool.query(
            `UPDATE community.agent_connections
                SET status='revoked', revoked_at=CURRENT_TIMESTAMP WHERE id=$1`,
            [pending],
          ),
        ).resolves.toEqual(expect.objectContaining({ rowCount: 1 }));
      });
    });
  });
};
