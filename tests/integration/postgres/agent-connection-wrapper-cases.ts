import { randomBytes } from "node:crypto";

import {
  WRAPPER_PREFIX,
  WrapperGrantMissingError,
  createWrapperStore,
  wrapperKeysFrom,
} from "@moya/community-postgres";
import { afterEach, describe, expect, it } from "vitest";

import type { createPostgresPool } from "@moya/catalog-postgres";

/**
 * Agent Connections V1 (Issue #141 r14 §5) — the external token and the
 * consent it is anchored to.
 *
 * The r12 review's finding was that a refresh is redeemed AT THE PROVIDER,
 * which knows nothing about ArtVenn's generation, so anything that stamped
 * "the current generation" when a token was minted would hand a disconnected
 * client a token that looks freshly consented. The fix was to anchor the
 * generation to the GRANT and freeze it at consent.
 *
 * These cases exercise the part of that fix which is code rather than schema:
 * `mint` has no generation parameter at all, so a caller cannot supply the
 * wrong one, and the provenance is sealed INTO the ciphertext so an edited
 * row will not open.
 */
export const registerAgentConnectionWrapperTests = (
  pool: ReturnType<typeof createPostgresPool>,
) => {
  describe("Agent connection wrappers on PostgreSQL", () => {
    // Task-private synthetic keys, generated per run and never printed.
    const keys = wrapperKeysFrom({
      AGENT_CONNECTION_WRAPPER_INDEX_KEY: randomBytes(32).toString("base64"),
      AGENT_CONNECTION_WRAPPER_SEAL_KEY: randomBytes(32).toString("base64"),
    } as unknown as NodeJS.ProcessEnv);

    const alarms: { reason: string; digest: string }[] = [];
    const store = createWrapperStore({
      pool,
      keys,
      onResolveFailure: (reason, digest) => alarms.push({ reason, digest }),
    });

    const newConnection = async (generation: number) => {
      const id = `conn-${randomBytes(16).toString("hex")}`;
      await pool.query(
        `INSERT INTO community.agent_connections
           (id, human_account_id, client_family, oauth_client_id, environment,
            principal_label, preset, status, generation, consented_at)
         VALUES ($1,'user-owner','claude','artvenn-claude-01','development',
                 'agent-phone','read-only','authorized',$2,CURRENT_TIMESTAMP)`,
        [id, generation],
      );
      return id;
    };

    const newGrant = async (
      grantId: string,
      connectionId: string,
      generationAtConsent: number,
    ) => {
      await pool.query(
        `INSERT INTO community.agent_connection_grants
           (grant_id, connection_id, generation_at_consent, oauth_client_id,
            human_subject, issuer, resource, capability_scopes,
            protocol_scopes, preset_at_consent)
         VALUES ($1,$2,$3,'artvenn-claude-01','user-owner',
                 'https://auth.invalid','https://resource.invalid',
                 '{artvenn:read}','{offline_access}','read-only')`,
        [grantId, connectionId, generationAtConsent],
      );
    };

    const inAnHour = () => new Date(Date.now() + 3_600_000);

    afterEach(async () => {
      alarms.length = 0;
      await pool.query("DELETE FROM community.agent_connection_wrappers");
      await pool.query(
        "UPDATE community.agent_connections SET current_grant_id=NULL",
      );
      await pool.query("DELETE FROM community.agent_connection_grants");
      await pool.query("DELETE FROM community.agent_connections");
    });

    describe("the generation comes off the grant, because a caller cannot supply one", () => {
      it("anchors a new wrapper to the consent the grant froze", async () => {
        const connectionId = await newConnection(1);
        await newGrant("g-mint-1", connectionId, 1);
        const minted = await store.mint({
          grantId: "g-mint-1",
          jti: "provider-token-1",
          expiresAt: inAnHour(),
        });
        expect(minted.presented.startsWith(WRAPPER_PREFIX)).toBe(true);
        expect(minted.connectionId).toBe(connectionId);
        expect(minted.generation).toBe(1);

        const resolved = await store.resolve(minted.presented);
        expect(resolved).toMatchObject({
          jti: "provider-token-1",
          grantId: "g-mint-1",
          connectionId,
          generation: 1,
          invalidatedAt: null,
        });
      });

      it("carries the OLD consent generation after a reconnect has moved the connection on", async () => {
        // The r12 property, at the layer where it is decided. The connection
        // is now at generation 3; the old grant still says 1; a token minted
        // against that old grant must still say 1, or a disconnected client
        // gets re-admitted with no new consent.
        const connectionId = await newConnection(1);
        await newGrant("g-old", connectionId, 1);
        await pool.query(
          "UPDATE community.agent_connections SET generation=3 WHERE id=$1",
          [connectionId],
        );
        await newGrant("g-new", connectionId, 3);

        const stale = await store.mint({
          grantId: "g-old",
          jti: "provider-token-old",
          expiresAt: inAnHour(),
        });
        expect(stale.generation).toBe(1);
        const fresh = await store.mint({
          grantId: "g-new",
          jti: "provider-token-new",
          expiresAt: inAnHour(),
        });
        expect(fresh.generation).toBe(3);
      });

      it("refuses to mint a wrapper bound to nothing", async () => {
        await expect(
          store.mint({
            grantId: "g-absent",
            jti: "provider-token-x",
            expiresAt: inAnHour(),
          }),
        ).rejects.toBeInstanceOf(WrapperGrantMissingError);
        const { rows } = await pool.query(
          "SELECT count(*)::int AS n FROM community.agent_connection_wrappers",
        );
        expect((rows[0] as { n: number }).n).toBe(0);
      });
    });

    describe("the provenance is sealed in, so an edited row will not open", () => {
      it("refuses a row whose generation was rewritten in place", async () => {
        const connectionId = await newConnection(1);
        await newGrant("g-seal-1", connectionId, 1);
        await newGrant("g-seal-2", connectionId, 5);
        const minted = await store.mint({
          grantId: "g-seal-1",
          jti: "provider-token-1",
          expiresAt: inAnHour(),
        });

        // The freeze trigger refuses this outright, which is the first line of
        // defence. Proving that is worth its own assertion, because it means
        // the AEAD binding below is defence in depth rather than the only
        // thing standing between an edit and a re-admitted token.
        await expect(
          pool.query(
            `UPDATE community.agent_connection_wrappers
                SET generation=5, grant_id='g-seal-2' WHERE lookup_digest=$1`,
            [minted.lookupDigest],
          ),
        ).rejects.toMatchObject({ code: "23001" });

        // And with the trigger out of the way, the seal still refuses it.
        await pool.query(
          "ALTER TABLE community.agent_connection_wrappers DISABLE TRIGGER agent_connection_wrappers_freeze_trigger",
        );
        try {
          await pool.query(
            `UPDATE community.agent_connection_wrappers
                SET generation=5, grant_id='g-seal-2' WHERE lookup_digest=$1`,
            [minted.lookupDigest],
          );
          expect(await store.resolve(minted.presented)).toBeUndefined();
          expect(alarms).toEqual([
            { reason: "unseal-failed", digest: minted.lookupDigest },
          ]);
        } finally {
          await pool.query(
            "ALTER TABLE community.agent_connection_wrappers ENABLE TRIGGER agent_connection_wrappers_freeze_trigger",
          );
        }
      });

      it("treats an unknown value as a plain miss, with no alarm", async () => {
        // A client presenting a value we never minted is ordinary. Raising the
        // integrity alarm for it would bury the events that matter.
        expect(
          await store.resolve(
            `${WRAPPER_PREFIX}${randomBytes(32).toString("base64url")}`,
          ),
        ).toBeUndefined();
        expect(alarms).toEqual([]);
      });

      it("refuses a value outside the reserved namespace without touching the database", async () => {
        expect(await store.resolve("some-legacy-api-key")).toBeUndefined();
        expect(alarms).toEqual([]);
      });

      it("stores neither the presented value nor the provider token in the clear", async () => {
        const connectionId = await newConnection(1);
        await newGrant("g-privacy", connectionId, 1);
        const minted = await store.mint({
          grantId: "g-privacy",
          jti: "provider-token-secret",
          expiresAt: inAnHour(),
        });
        const { rows } = await pool.query(
          `SELECT lookup_digest,
                  encode(sealed_jti,'escape') AS sealed_text,
                  encode(sealed_jti,'hex') AS sealed_hex
             FROM community.agent_connection_wrappers`,
        );
        const row = rows[0] as Record<string, string>;
        const haystack = `${row.lookup_digest}|${row.sealed_text}|${row.sealed_hex}`;
        for (const secret of [minted.presented, "provider-token-secret"]) {
          expect(haystack).not.toContain(secret);
          expect(haystack).not.toContain(
            Buffer.from(secret, "utf8").toString("hex"),
          );
        }
      });
    });

    describe("withdrawal is recorded, not hidden", () => {
      it("invalidates every wrapper of one grant and leaves others alone", async () => {
        const connectionId = await newConnection(1);
        await newGrant("g-live", connectionId, 1);
        await newGrant("g-other", connectionId, 1);
        const doomed = await store.mint({
          grantId: "g-live",
          jti: "t1",
          expiresAt: inAnHour(),
        });
        const spared = await store.mint({
          grantId: "g-other",
          jti: "t2",
          expiresAt: inAnHour(),
        });

        const at = new Date();
        expect(await store.invalidateByGrant("g-live", at)).toBe(1);
        // Reported, not hidden: the boundary above decides what an
        // invalidated wrapper means, and a store that dropped the row would
        // make a revoked token look like a typo.
        expect((await store.resolve(doomed.presented))?.invalidatedAt).toEqual(
          expect.any(String),
        );
        expect(
          (await store.resolve(spared.presented))?.invalidatedAt,
        ).toBeNull();
      });

      it("does not move the timestamp on a second invalidation", async () => {
        const connectionId = await newConnection(1);
        await newGrant("g-twice", connectionId, 1);
        const minted = await store.mint({
          grantId: "g-twice",
          jti: "t1",
          expiresAt: inAnHour(),
        });
        await store.invalidateByGrant("g-twice", new Date(Date.now() - 60_000));
        const first = (await store.resolve(minted.presented))?.invalidatedAt;
        // Second sweep matches nothing: when access was withdrawn is a fact,
        // and a later sweep must not quietly restate it.
        expect(await store.invalidateByGrant("g-twice", new Date())).toBe(0);
        expect((await store.resolve(minted.presented))?.invalidatedAt).toBe(
          first,
        );
      });

      it("reaps only past-expiry wrappers, and bounds how many", async () => {
        const connectionId = await newConnection(1);
        await newGrant("g-reap", connectionId, 1);
        for (const jti of ["r1", "r2", "r3"])
          await store.mint({
            grantId: "g-reap",
            jti,
            expiresAt: new Date(Date.now() - 1000),
          });
        const live = await store.mint({
          grantId: "g-reap",
          jti: "keep",
          expiresAt: inAnHour(),
        });
        expect(await store.deleteExpired(new Date(), 2)).toBe(2);
        expect(await store.deleteExpired(new Date(), 10)).toBe(1);
        expect(await store.deleteExpired(new Date(), 10)).toBe(0);
        expect(await store.resolve(live.presented)).toMatchObject({
          jti: "keep",
        });
      });
    });
  });
};
