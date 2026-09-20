import { createHash, randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  AgentConnectionInvariantError,
  createAgentConnectionStore,
  createConsentStore,
} from "@moya/community-postgres";
import { beforeAll, describe, expect, it } from "vitest";

import type { StoredConnection } from "@moya/community-postgres";
import type { createPostgresPool } from "@moya/catalog-postgres";

/**
 * Agent Connections V1 (Issue #141 r15 §5) — the browser consent transaction.
 *
 * The property under test is not "a form posts". It is that an interaction
 * uid, which travels in a URL and proves nothing, only becomes a grant after
 * an authenticated human produced a secret this server rendered to THEM.
 *
 * The row has two writers and they are deliberately incapable of each other's
 * half: the provider states what it will enforce, the control plane states who
 * decided. The role cases at the end apply the REAL grant file rather than a
 * re-typed copy, because a grant plan only ever tested in paraphrase is a
 * grant plan nobody has tested.
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

    const openConnection = async (): Promise<StoredConnection> => {
      const fields: StoredConnection = {
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
      };
      await connections.create(fields);
      return fields;
    };

    /** What the PROVIDER writes: the facts it will enforce, and no human. */
    const providerFacts = (overrides: Record<string, unknown> = {}) => ({
      interactionUid: uid(),
      oauthClientId: "artvenn-consent-case",
      resource: "https://resource.invalid/mcp",
      capabilityScopes: ["artvenn:read"],
      protocolScopes: ["offline_access"],
      preset: "read-only" as const,
      expiresAt: later(5 * 60_000),
      ...overrides,
    });

    /**
     * The whole pre-decision sequence: the provider opens an interaction, then
     * the review page arms it with the human it authenticated, the connection,
     * and the digest of the ticket it handed that browser.
     */
    const armed = async (overrides: Record<string, unknown> = {}) => {
      const secret = ticket();
      const facts = providerFacts(overrides);
      const connection = await openConnection();
      expect(await consents.open(facts)).not.toBeNull();
      const row = await consents.arm({
        interactionUid: facts.interactionUid,
        ticketDigest: digestOf(secret),
        connectionId: connection.id,
        humanAccountId: "user-owner",
      });
      return { secret, facts, connection, row };
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

    it("opens an interaction that names nobody, because the provider knows nobody", async () => {
      const facts = providerFacts();
      const opened = await consents.open(facts);
      expect(opened).toMatchObject({
        interactionUid: facts.interactionUid,
        oauthClientId: facts.oauthClientId,
        resource: facts.resource,
        // The provider cannot say who is consenting or about what, and the
        // row starts unable to express it.
        humanAccountId: null,
        connectionId: null,
        ticketArmed: false,
        decision: null,
      });
      // One set of enforced facts per uid: a second open changes nothing.
      expect(
        await consents.open({ ...facts, resource: "https://other.invalid" }),
      ).toBeNull();
      expect((await consents.read(facts.interactionUid))?.resource).toBe(
        facts.resource,
      );
    });

    it("turns an interaction into a decision only for the secret it rendered", async () => {
      const { secret, facts } = await armed();

      // A POST that cannot produce the ticket writes nothing at all.
      expect(
        await consents.decide({
          interactionUid: facts.interactionUid,
          ticketDigest: digestOf(ticket()),
          humanAccountId: "user-owner",
          decision: "approved",
          grantedGeneration: 1,
        }),
      ).toBeNull();

      // Nor does the right ticket in somebody else's hands.
      expect(
        await consents.decide({
          interactionUid: facts.interactionUid,
          ticketDigest: digestOf(secret),
          humanAccountId: "user-someone-else",
          decision: "approved",
          grantedGeneration: 1,
        }),
      ).toBeNull();

      const decided = await consents.decide({
        interactionUid: facts.interactionUid,
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
          interactionUid: facts.interactionUid,
          ticketDigest: digestOf(secret),
          humanAccountId: "user-owner",
          decision: "approved",
          grantedGeneration: 2,
        }),
      ).toBeNull();
      expect(
        (await consents.read(facts.interactionUid))?.grantedGeneration,
      ).toBe(1);
    });

    it("cannot be decided at all while it is unarmed", async () => {
      const facts = providerFacts();
      await consents.open(facts);
      expect(
        await consents.decide({
          interactionUid: facts.interactionUid,
          ticketDigest: digestOf(ticket()),
          humanAccountId: "user-owner",
          decision: "approved",
          grantedGeneration: 1,
        }),
      ).toBeNull();
      expect((await consents.read(facts.interactionUid))?.decision).toBeNull();
    });

    it("re-arms an undecided interaction, which kills the ticket it replaced", async () => {
      const { secret, facts, connection } = await armed();
      const second = ticket();
      expect(
        await consents.arm({
          interactionUid: facts.interactionUid,
          ticketDigest: digestOf(second),
          connectionId: connection.id,
          humanAccountId: "user-owner",
        }),
      ).not.toBeNull();

      // The page that was open first can no longer decide anything.
      expect(
        await consents.decide({
          interactionUid: facts.interactionUid,
          ticketDigest: digestOf(secret),
          humanAccountId: "user-owner",
          decision: "approved",
          grantedGeneration: 1,
        }),
      ).toBeNull();
      expect(
        await consents.decide({
          interactionUid: facts.interactionUid,
          ticketDigest: digestOf(second),
          humanAccountId: "user-owner",
          decision: "approved",
          grantedGeneration: 1,
        }),
      ).not.toBeNull();

      // And a decided interaction can never be re-armed.
      expect(
        await consents.arm({
          interactionUid: facts.interactionUid,
          ticketDigest: digestOf(ticket()),
          connectionId: connection.id,
          humanAccountId: "user-owner",
        }),
      ).toBeNull();
    });

    it("refuses an expired interaction, so an abandoned tab is not a standing permission", async () => {
      // Expiry is measured against the DATABASE clock, so the deadline is read
      // from it rather than from this process: a host whose clocks disagree
      // would otherwise make this pass or fail for the wrong reason. The
      // `expires_at > issued_at` CHECK also refuses an already-dead row, so
      // the interaction has to be opened alive and then actually expire.
      const { rows } = await pool.query(
        "SELECT CURRENT_TIMESTAMP + interval '300 milliseconds' AS deadline",
      );
      const { secret, facts } = await armed({
        expiresAt: (rows[0] as { deadline: Date }).deadline.toISOString(),
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      expect(
        await consents.decide({
          interactionUid: facts.interactionUid,
          ticketDigest: digestOf(secret),
          humanAccountId: "user-owner",
          decision: "approved",
          grantedGeneration: 1,
        }),
      ).toBeNull();
      // Nor can it be re-armed back to life.
      expect(
        await consents.arm({
          interactionUid: facts.interactionUid,
          ticketDigest: digestOf(ticket()),
          connectionId: (await openConnection()).id,
          humanAccountId: "user-owner",
        }),
      ).toBeNull();
    });

    it("spends an approved interaction exactly once and never resumes a denial", async () => {
      const approved = await armed();
      await consents.decide({
        interactionUid: approved.facts.interactionUid,
        ticketDigest: digestOf(approved.secret),
        humanAccountId: "user-owner",
        decision: "approved",
        grantedGeneration: 1,
      });
      const grantId = `grant-${randomBytes(8).toString("hex")}`;
      await pool.query(
        `INSERT INTO community.agent_connection_grants
           (grant_id, connection_id, generation_at_consent, oauth_client_id,
            human_subject, issuer, resource, preset_at_consent)
         VALUES ($1,$2,1,$3,'user-owner','https://auth.invalid',
                 'https://resource.invalid/mcp','read-only')`,
        [grantId, approved.connection.id, approved.facts.oauthClientId],
      );

      const resumed = await consents.resume({
        interactionUid: approved.facts.interactionUid,
        grantId,
      });
      expect(resumed?.grantId).toBe(grantId);
      expect(resumed?.resumedAt).not.toBeNull();
      // A replayed resume cannot produce a second grant from one consent.
      expect(
        await consents.resume({
          interactionUid: approved.facts.interactionUid,
          grantId,
        }),
      ).toBeNull();

      const denied = await armed();
      await consents.decide({
        interactionUid: denied.facts.interactionUid,
        ticketDigest: digestOf(denied.secret),
        humanAccountId: "user-owner",
        decision: "denied",
        grantedGeneration: null,
      });
      expect(
        await consents.resume({
          interactionUid: denied.facts.interactionUid,
          grantId,
        }),
      ).toBeNull();
    });

    it("refuses a management consent at the database, not in a branch a UI could skip", async () => {
      await expect(
        consents.open(providerFacts({ preset: "management" })),
      ).rejects.toBeInstanceOf(AgentConnectionInvariantError);
    });

    it("freezes what the provider will enforce, even against the table owner", async () => {
      const facts = providerFacts();
      await consents.open(facts);
      await expect(
        pool.query(
          `UPDATE community.agent_connection_consents
              SET oauth_client_id='a-different-client'
            WHERE interaction_uid=$1`,
          [facts.interactionUid],
        ),
      ).rejects.toMatchObject({ code: "23001" });
    });

    it("keeps a decided consent attributed to the identity it was decided under", async () => {
      const { secret, facts } = await armed();
      await consents.decide({
        interactionUid: facts.interactionUid,
        ticketDigest: digestOf(secret),
        humanAccountId: "user-owner",
        decision: "approved",
        grantedGeneration: 1,
      });
      await expect(
        pool.query(
          `UPDATE community.agent_connection_consents
              SET human_account_id='user-somebody-else'
            WHERE interaction_uid=$1`,
          [facts.interactionUid],
        ),
      ).rejects.toMatchObject({ code: "23001" });
    });

    describe("the grant file's own role split", () => {
      // 42501 is insufficient_privilege: PostgreSQL refusing, not this code.
      const denied = { ok: false, sqlState: "42501" };

      it("denies the provider role any way to say who consented", async () => {
        for (const statement of [
          `UPDATE community.agent_connection_consents
              SET decision='approved', decided_at=CURRENT_TIMESTAMP,
                  granted_generation=1`,
          `UPDATE community.agent_connection_consents
              SET human_account_id='user-owner'`,
          `UPDATE community.agent_connection_consents SET connection_id=NULL`,
          `UPDATE community.agent_connection_consents SET ticket_digest=NULL`,
        ])
          expect(await asRole(providerRole, statement)).toEqual(denied);
      });

      it("denies the consent role any way to mint a grant, a token or an interaction", async () => {
        for (const statement of [
          `UPDATE community.agent_connections SET current_grant_id='forged'`,
          `INSERT INTO community.agent_connection_grants
             (grant_id, connection_id, generation_at_consent, oauth_client_id,
              human_subject, issuer, resource, preset_at_consent)
           VALUES ('forged','conn-x',1,'c','user-owner','https://a.invalid',
                   'https://r.invalid','read-only')`,
          `SELECT lookup_digest FROM community.agent_connection_wrappers LIMIT 1`,
          `UPDATE community.agent_connection_consents
              SET resumed_at=CURRENT_TIMESTAMP`,
          // It cannot conjure an authorization request nobody made.
          `INSERT INTO community.agent_connection_consents
             (interaction_uid, oauth_client_id, resource, preset, expires_at)
           VALUES ('forged','c','https://r.invalid','read-only',
                   CURRENT_TIMESTAMP + interval '5 min')`,
        ])
          expect(await asRole(consentRole, statement)).toEqual(denied);
      });

      it("grants each role exactly the half it needs, so neither is merely locked out", async () => {
        // The negative controls above are only meaningful if the positives
        // work: a role denied everything would pass all of them.
        const connection = await openConnection();
        const facts = providerFacts();
        expect(
          await asRole(
            providerRole,
            `INSERT INTO community.agent_connection_consents
               (interaction_uid, oauth_client_id, resource, preset, expires_at)
             VALUES ($1,$2,$3,'read-only',
                     CURRENT_TIMESTAMP + interval '5 min')`,
            [facts.interactionUid, facts.oauthClientId, facts.resource],
          ),
        ).toEqual({ ok: true });

        await consents.open(facts);
        expect(
          await asRole(
            consentRole,
            `UPDATE community.agent_connection_consents
                SET ticket_digest=$2, human_account_id='user-owner',
                    connection_id=$3
              WHERE interaction_uid=$1`,
            [facts.interactionUid, digestOf(ticket()), connection.id],
          ),
        ).toEqual({ ok: true });
        expect(
          await asRole(
            providerRole,
            `SELECT interaction_uid FROM community.agent_connection_consents
              WHERE interaction_uid=$1`,
            [facts.interactionUid],
          ),
        ).toEqual({ ok: true });
        expect(
          await asRole(
            providerRole,
            `UPDATE community.agent_connections SET current_grant_id=NULL
              WHERE id=$1`,
            [connection.id],
          ),
        ).toEqual({ ok: true });
      });
    });
  });
};
