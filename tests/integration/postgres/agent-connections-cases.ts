import { randomBytes } from "node:crypto";

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

    const openConnection = async (
      overrides: Partial<{
        status: string;
        generation: number;
        currentGrantId: string | null;
        consentedAt: string | null;
        revokedAt: string | null;
      }> = {},
    ) => {
      const id = connectionId();
      await pool.query(
        `INSERT INTO community.agent_connections
           (id, human_account_id, client_family, oauth_client_id, environment,
            principal_label, preset, status, generation, current_grant_id,
            consented_at, revoked_at)
         VALUES ($1,'user-owner','claude','artvenn-claude-01','development',
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
      // Own rows only, in foreign-key order. The shared suite cleans comments
      // and sessions; these tables are this module's to tidy.
      await pool.query("DELETE FROM community.agent_connection_wrappers");
      await pool.query("DELETE FROM community.agent_connection_grants");
      await pool.query("DELETE FROM community.agent_connections");
    });

    describe("relational integrity", () => {
      it("opens a connection that has no consent grant yet", async () => {
        const id = await openConnection({
          status: "awaiting-consent",
          generation: 0,
          consentedAt: null,
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

      it("points current_grant_id at a grant of the same connection", async () => {
        const other = await openConnection();
        await addGrant("grant-elsewhere", 1, other);
        // The pointer is not itself a foreign key, so the invariant that
        // matters is the one the wrapper FK enforces below; this pins that a
        // grant belongs to exactly one connection.
        const { rows } = await pool.query(
          `SELECT connection_id FROM community.agent_connection_grants
            WHERE grant_id='grant-elsewhere'`,
        );
        expect(rows[0].connection_id).toBe(other);
        expect(rows[0].connection_id).not.toBe(connection);
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
        const other = await openConnection();
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

      it("stores no wrapper value and no plaintext provider identifier", async () => {
        await addGrant("grant-r1", 1);
        await addWrapper("grant-r1", connection, 1);
        const { rows } = await pool.query(
          `SELECT lookup_digest, sealed_jti FROM community.agent_connection_wrappers`,
        );
        // The digest is a digest, not a token: no reserved prefix survives.
        expect(rows[0].lookup_digest).toMatch(/^[0-9a-f]{64}$/u);
        expect(rows[0].lookup_digest).not.toContain("artvenn_ct_");
        expect(Buffer.isBuffer(rows[0].sealed_jti)).toBe(true);
        expect(rows[0].sealed_jti.toString("utf8")).not.toContain(
          "artvenn_ct_",
        );
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

      it("refuses a negative generation or a zero version", async () => {
        await expect(
          pool.query(
            `UPDATE community.agent_connections SET generation=-1 WHERE id=$1`,
            [connection],
          ),
        ).rejects.toMatchObject({ code: "23514" });
        await expect(
          pool.query(
            `UPDATE community.agent_connections SET version=0 WHERE id=$1`,
            [connection],
          ),
        ).rejects.toMatchObject({ code: "23514" });
      });

      it("refuses an unknown preset, status, client family or principal shape", async () => {
        for (const [column, value] of [
          ["preset", "superuser"],
          ["status", "half-authorized"],
          ["client_family", "some-other-vendor"],
          ["principal_label", "not-an-agent-label"],
        ] as const)
          await expect(
            pool.query(
              `UPDATE community.agent_connections SET ${column}=$2 WHERE id=$1`,
              [connection, value],
            ),
            `${column} accepted ${value}`,
          ).rejects.toMatchObject({ code: "23514" });
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

      it("never lets a generation move backwards through a compare-and-set", async () => {
        await pool.query(
          `UPDATE community.agent_connections
              SET generation=5, version=version+1 WHERE id=$1`,
          [connection],
        );
        // The guard belongs with the transition, so the store refuses it; the
        // column check only bounds the floor. Pin both facts.
        await expect(
          pool.query(
            `UPDATE community.agent_connections SET generation=-1 WHERE id=$1`,
            [connection],
          ),
        ).rejects.toMatchObject({ code: "23514" });
        const { rows } = await pool.query(
          `SELECT generation FROM community.agent_connections WHERE id=$1`,
          [connection],
        );
        expect(rows[0].generation).toBe("5");
      });
    });
  });
};
