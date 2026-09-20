import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  AgentConnectionInvariantError,
  createAgentConnectionStore,
  createConsentStore,
} from "@moya/community-postgres";
import { beforeAll, describe, expect, it } from "vitest";

import type {
  ConsentOpening,
  StoredConnection,
} from "@moya/community-postgres";
import type { createPostgresPool } from "@moya/catalog-postgres";

/**
 * Agent Connections V1 (Issue #141 r15 §5) — the browser consent transaction.
 *
 * The property under test is not "a form posts". It is that an interaction
 * uid, which travels in a URL and proves nothing, only becomes a grant after
 * an authenticated human produced a secret this server rendered to THEM.
 *
 * The role cases at the end are the ones worth reading twice. They apply the
 * REAL grant file rather than a re-typed copy of it, because a grant plan that
 * is only ever tested in a paraphrase is a grant plan nobody has tested.
 */
export const registerAgentConnectionConsentTests = (
  pool: ReturnType<typeof createPostgresPool>,
) => {
  describe("Agent connection consent transaction on PostgreSQL", () => {
    const connections = createAgentConnectionStore({ pool });
    const consents = createConsentStore({ pool });

    const providerRole = "moya_consent_case_provider";
    const consentRole = "moya_consent_case_consent";

    const ticket = () => randomBytes(32).toString("hex");
    const digestOf = (value: string) =>
      createHash("sha256").update(value, "utf8").digest("hex");
    const uid = () => `int-${randomBytes(12).toString("hex")}`;
    const later = (ms: number) => new Date(Date.now() + ms).toISOString();

    const connectionFields = (): StoredConnection => ({
      id: `conn-${randomBytes(16).toString("hex")}`,
      principalLabel: "agent-consent-case",
      humanAccountId: "user-owner",
      client: "claude",
      oauthClientId: "artvenn-consent-case",
      environment: "development",
      preset: "read-only",
      status: "awaiting-consent",
      generation: 0,
      revokedAt: null,
      consentedAt: null,
    });

    const openConnection = async (): Promise<StoredConnection> => {
      const fields = connectionFields();
      await connections.create(fields);
      return fields;
    };

    const opening = async (
      overrides: Partial<ConsentOpening> = {},
    ): Promise<ConsentOpening> => {
      const connection = overrides.connectionId ? null : await openConnection();
      return {
        interactionUid: uid(),
        ticketDigest: digestOf(ticket()),
        connectionId: overrides.connectionId ?? connection!.id,
        humanAccountId: "user-owner",
        oauthClientId: "artvenn-consent-case",
        resource: "https://resource.invalid/mcp",
        capabilityScopes: ["artvenn:read"],
        protocolScopes: ["offline_access"],
        preset: "read-only",
        expiresAt: later(5 * 60_000),
        ...overrides,
      };
    };

    beforeAll(async () => {
      const client = await pool.connect();
      try {
        await client.query("SELECT set_config($1,$2,false)", [
          "agent_connections.provider_role",
          providerRole,
        ]);
        await client.query("SELECT set_config($1,$2,false)", [
          "agent_connections.consent_role",
          consentRole,
        ]);
        await client.query(
          await readFile(
            new URL(
              "../../../infra/development/agent-connections/grant-authorization.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
      } finally {
        client.release();
      }
    });

    /** Runs one statement as `role`, transaction-scoped and always rolled back. */
    const asRole = async (
      role: string,
      statement: string,
      values: readonly unknown[] = [],
    ): Promise<{ ok: true } | { ok: false; sqlState: string }> => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL ROLE ${role}`);
        await client.query(statement, [...values]);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          sqlState: String((error as { code?: unknown }).code ?? ""),
        };
      } finally {
        // Nothing a role case does is ever kept, including the successes.
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    };

    it("turns an interaction into a decision only for the secret it rendered", async () => {
      const secret = ticket();
      const fields = await opening({ ticketDigest: digestOf(secret) });
      const opened = await consents.open(fields);
      expect(opened?.interactionUid).toBe(fields.interactionUid);
      expect(opened?.decision).toBeNull();
      expect(opened?.grantedGeneration).toBeNull();

      // A POST that cannot produce the ticket writes nothing at all.
      expect(
        await consents.decide({
          interactionUid: fields.interactionUid,
          ticketDigest: digestOf(ticket()),
          humanAccountId: "user-owner",
          decision: "approved",
          grantedGeneration: 1,
        }),
      ).toBeNull();

      // Nor does the right ticket in somebody else's hands.
      expect(
        await consents.decide({
          interactionUid: fields.interactionUid,
          ticketDigest: digestOf(secret),
          humanAccountId: "user-someone-else",
          decision: "approved",
          grantedGeneration: 1,
        }),
      ).toBeNull();

      const decided = await consents.decide({
        interactionUid: fields.interactionUid,
        ticketDigest: digestOf(secret),
        humanAccountId: "user-owner",
        decision: "approved",
        grantedGeneration: 1,
      });
      expect(decided?.decision).toBe("approved");
      expect(decided?.grantedGeneration).toBe(1);
      expect(decided?.decidedAt).not.toBeNull();

      // Single use. The second approval finds a decided row and writes nothing.
      expect(
        await consents.decide({
          interactionUid: fields.interactionUid,
          ticketDigest: digestOf(secret),
          humanAccountId: "user-owner",
          decision: "approved",
          grantedGeneration: 2,
        }),
      ).toBeNull();
      expect(
        (await consents.read(fields.interactionUid))?.grantedGeneration,
      ).toBe(1);
    });

    it("mints one ticket per interaction, so a second review cannot re-arm it", async () => {
      const fields = await opening();
      expect(await consents.open(fields)).not.toBeNull();
      const second = await consents.open({
        ...fields,
        ticketDigest: digestOf(ticket()),
      });
      expect(second).toBeNull();
    });

    it("refuses an expired interaction, so an abandoned tab is not a standing permission", async () => {
      const secret = ticket();
      // Expiry is measured against the DATABASE clock, so the deadline is read
      // from it rather than from this process: a host whose clocks disagree
      // would otherwise make this pass or fail for the wrong reason. The
      // `expires_at > issued_at` CHECK also refuses an already-dead row, so
      // the interaction has to be opened alive and then actually expire.
      const { rows } = await pool.query(
        "SELECT CURRENT_TIMESTAMP + interval '300 milliseconds' AS deadline",
      );
      const fields = await opening({
        ticketDigest: digestOf(secret),
        expiresAt: (rows[0] as { deadline: Date }).deadline.toISOString(),
      });
      expect(await consents.open(fields)).not.toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(
        await consents.decide({
          interactionUid: fields.interactionUid,
          ticketDigest: digestOf(secret),
          humanAccountId: "user-owner",
          decision: "approved",
          grantedGeneration: 1,
        }),
      ).toBeNull();
    });

    it("spends an approved interaction exactly once and never resumes a denial", async () => {
      const approvedSecret = ticket();
      const approved = await opening({
        ticketDigest: digestOf(approvedSecret),
      });
      await consents.open(approved);
      await consents.decide({
        interactionUid: approved.interactionUid,
        ticketDigest: digestOf(approvedSecret),
        humanAccountId: "user-owner",
        decision: "approved",
        grantedGeneration: 1,
      });
      await pool.query(
        `INSERT INTO community.agent_connection_grants
           (grant_id, connection_id, generation_at_consent, oauth_client_id,
            human_subject, issuer, resource, preset_at_consent)
         VALUES ($1,$2,1,$3,'user-owner','https://auth.invalid',
                 'https://resource.invalid/mcp','read-only')`,
        [
          `grant-${randomBytes(8).toString("hex")}`,
          approved.connectionId,
          approved.oauthClientId,
        ],
      );
      const { rows } = await pool.query(
        `SELECT grant_id FROM community.agent_connection_grants
          WHERE connection_id=$1`,
        [approved.connectionId],
      );
      const grantId = (rows[0] as { grant_id: string }).grant_id;

      const resumed = await consents.resume({
        interactionUid: approved.interactionUid,
        grantId,
      });
      expect(resumed?.grantId).toBe(grantId);
      expect(resumed?.resumedAt).not.toBeNull();
      // A replayed resume cannot produce a second grant from one consent.
      expect(
        await consents.resume({
          interactionUid: approved.interactionUid,
          grantId,
        }),
      ).toBeNull();

      const deniedSecret = ticket();
      const denied = await opening({ ticketDigest: digestOf(deniedSecret) });
      await consents.open(denied);
      await consents.decide({
        interactionUid: denied.interactionUid,
        ticketDigest: digestOf(deniedSecret),
        humanAccountId: "user-owner",
        decision: "denied",
        grantedGeneration: null,
      });
      expect(
        await consents.resume({
          interactionUid: denied.interactionUid,
          grantId,
        }),
      ).toBeNull();
    });

    it("refuses a management consent at the database, not in a branch a UI could skip", async () => {
      const fields = await opening({ preset: "management" });
      await expect(consents.open(fields)).rejects.toBeInstanceOf(
        AgentConnectionInvariantError,
      );
    });

    it("freezes what the human was shown, even against the table owner", async () => {
      const fields = await opening();
      await consents.open(fields);
      await expect(
        pool.query(
          `UPDATE community.agent_connection_consents
              SET oauth_client_id='a-different-client'
            WHERE interaction_uid=$1`,
          [fields.interactionUid],
        ),
      ).rejects.toMatchObject({ code: "23001" });
    });

    describe("the grant file's own role split", () => {
      // 42501 is insufficient_privilege: PostgreSQL refusing, not this code.
      const denied = { ok: false, sqlState: "42501" };

      it("denies the provider role any way to record a decision", async () => {
        expect(
          await asRole(
            providerRole,
            `UPDATE community.agent_connection_consents
                SET decision='approved', decided_at=CURRENT_TIMESTAMP,
                    granted_generation=1`,
          ),
        ).toEqual(denied);
        expect(
          await asRole(
            providerRole,
            `INSERT INTO community.agent_connection_consents
               (interaction_uid, ticket_digest, connection_id, human_account_id,
                oauth_client_id, resource, preset, expires_at)
             VALUES ('forged', $1, 'conn-x', 'user-owner', 'c',
                     'https://r.invalid', 'read-only',
                     CURRENT_TIMESTAMP + interval '5 min')`,
            [digestOf(ticket())],
          ),
        ).toEqual(denied);
      });

      it("denies the consent role any way to mint a grant or move a token", async () => {
        expect(
          await asRole(
            consentRole,
            `UPDATE community.agent_connections SET current_grant_id='forged'`,
          ),
        ).toEqual(denied);
        expect(
          await asRole(
            consentRole,
            `INSERT INTO community.agent_connection_grants
               (grant_id, connection_id, generation_at_consent, oauth_client_id,
                human_subject, issuer, resource, preset_at_consent)
             VALUES ('forged','conn-x',1,'c','user-owner','https://a.invalid',
                     'https://r.invalid','read-only')`,
          ),
        ).toEqual(denied);
        expect(
          await asRole(
            consentRole,
            `SELECT lookup_digest FROM community.agent_connection_wrappers LIMIT 1`,
          ),
        ).toEqual(denied);
        expect(
          await asRole(
            consentRole,
            `UPDATE community.agent_connection_consents
                SET resumed_at=CURRENT_TIMESTAMP`,
          ),
        ).toEqual(denied);
      });

      it("grants each role exactly the half it needs, so neither is merely locked out", async () => {
        // The negative controls above are only meaningful if the positives
        // work: a role denied everything would pass all of them.
        const secret = ticket();
        const fields = await opening({ ticketDigest: digestOf(secret) });
        await consents.open(fields);
        expect(
          await asRole(
            consentRole,
            `UPDATE community.agent_connection_consents
                SET decision='approved', decided_at=CURRENT_TIMESTAMP,
                    granted_generation=1
              WHERE interaction_uid=$1`,
            [fields.interactionUid],
          ),
        ).toEqual({ ok: true });
        expect(
          await asRole(
            providerRole,
            `SELECT interaction_uid FROM community.agent_connection_consents
              WHERE interaction_uid=$1`,
            [fields.interactionUid],
          ),
        ).toEqual({ ok: true });
        expect(
          await asRole(
            providerRole,
            `UPDATE community.agent_connections SET current_grant_id=NULL
              WHERE id=$1`,
            [fields.connectionId],
          ),
        ).toEqual({ ok: true });
      });
    });
  });
};
