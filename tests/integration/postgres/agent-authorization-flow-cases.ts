import { createHash, randomBytes } from "node:crypto";

import { createConsentStore } from "@moya/community-postgres";
import {
  mintConsentTicket,
  describeConsent,
  ConsentError,
} from "admin/agent-connections-consent";
import { decideConsent } from "admin/agent-connections-decide";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { createPostgresPool } from "@moya/catalog-postgres";

/**
 * Agent Connections V1 (Issue #141 r15 §5, §8) — the real consent flow, over
 * the real protocol.
 *
 * What this drives, stated plainly so nobody has to infer it:
 *
 *   * the REAL authorization service (`startAuthorizationServer`), listening
 *     on loopback, with the real provider, the real PostgreSQL adapter, the
 *     real Design B wrapper and the real resume route;
 *   * a real authorization-code + PKCE exchange by a synthetic public client;
 *   * the REAL Admin decision function (`decideConsent`), not a re-typed copy
 *     of its write ordering — a test that reimplemented that order would pass
 *     whatever the product did.
 *
 * What it does NOT drive, equally plainly: there is no browser here and no
 * running Next server. The two-step landing is exercised as the redirect the
 * provider actually emits and the uid it actually carries; the Owner's Payload
 * session, the CSRF ticket in a rendered form and the human's click are the
 * browser harness's job, not this file's. Nothing here should be read as
 * evidence that the Admin page works.
 */
export const registerAgentAuthorizationFlowTests = (
  pool: ReturnType<typeof createPostgresPool>,
) => {
  describe("r15 §5 — consent, PKCE and resume against the real service", () => {
    const PORT = 34621;
    const ISSUER = `http://127.0.0.1:${PORT}`;
    // A DIFFERENT host from the issuer. `config` refuses to start otherwise,
    // because cookies are host-scoped and not port-scoped: an issuer and a
    // consent page sharing a host would share a cookie jar.
    const CONSENT_BASE = "http://admin.localhost:3442";
    const RESOURCE = "http://admin.localhost:3442/api/mcp";
    const CLIENT_ID = "artvenn-r15-flow-client";
    const REDIRECT = "http://127.0.0.1:34622/callback";
    /**
     * One Owner per case. `resolveConnection` finds the connection a human
     * holds for an exact client, so cases sharing an Owner would share a
     * connection and a grant one of them created would still be there for the
     * next — which is how an isolation bug reads as a product bug.
     */
    const owner = (name: string) => `payload-user-${name}`;

    const clients = JSON.stringify([
      {
        clientId: CLIENT_ID,
        family: "claude",
        label: "Synthetic flow client",
        redirectUris: [REDIRECT],
      },
    ]);

    // Task-private synthetic keys, generated per run and never printed.
    const environment = {
      NODE_ENV: "development",
      AGENT_CONNECTIONS_ENABLED: "true",
      AGENT_AUTHORIZATION_ENABLED: "true",
      AGENT_AUTHORIZATION_ISSUER: ISSUER,
      AGENT_AUTHORIZATION_RESOURCE: RESOURCE,
      AGENT_AUTHORIZATION_CONSENT_URL: CONSENT_BASE,
      AGENT_AUTHORIZATION_PORT: String(PORT),
      AGENT_AUTHORIZATION_CLIENTS: clients,
      AGENT_AUTHORIZATION_ENVIRONMENT: "development",
      AGENT_AUTHORIZATION_DATABASE_URL: "unused-by-this-harness",
      AGENT_CONNECTION_PROVIDER_INDEX_KEY: randomBytes(32).toString("base64"),
      AGENT_CONNECTION_PROVIDER_SEAL_KEY: randomBytes(32).toString("base64"),
      AGENT_CONNECTION_WRAPPER_INDEX_KEY: randomBytes(32).toString("base64"),
      AGENT_CONNECTION_WRAPPER_SEAL_KEY: randomBytes(32).toString("base64"),
    } as unknown as NodeJS.ProcessEnv;

    const consents = createConsentStore({ pool });

    let server: { close: () => Promise<void> };
    let runtime: Awaited<
      ReturnType<typeof import("admin/agent-connections").createConsentRuntime>
    >;

    beforeAll(async () => {
      const { authorizationConfigFrom } =
        await import("@moya/agent-authorization");
      const { startAuthorizationServer } =
        await import("@moya/agent-authorization");
      const { createConsentRuntime } = await import("admin/agent-connections");
      server = await startAuthorizationServer({
        config: authorizationConfigFrom(environment),
        pool: pool as never,
        environment,
        buildId: "r15-flow-cases",
      });
      runtime = createConsentRuntime({
        ...environment,
        AGENT_CONSENT_DATABASE_URL: process.env.TEST_DATABASE_URL,
        AGENT_AUTHORIZATION_ISSUER: ISSUER,
        AGENT_AUTHORIZATION_RESOURCE: RESOURCE,
        AGENT_AUTHORIZATION_CLIENTS: clients,
      } as unknown as NodeJS.ProcessEnv);
      expect(runtime).not.toBeNull();
    }, 30000);

    afterAll(async () => {
      await server?.close();
      await runtime?.close();
      await pool.query(
        "DELETE FROM community.agent_connection_provider_artifacts",
      );
      await pool.query("DELETE FROM community.agent_connection_consents");
      await pool.query("DELETE FROM community.agent_connection_wrappers");
      await pool.query(
        "UPDATE community.agent_connections SET current_grant_id=NULL",
      );
      await pool.query("DELETE FROM community.agent_connection_grants");
      await pool.query("DELETE FROM community.agent_connections");
    });

    /** A cookie jar, because the provider resumes an interaction from ITS own. */
    const newJar = () => {
      const jar = new Map<string, string>();
      return {
        header: () => [...jar].map(([n, v]) => `${n}=${v}`).join("; "),
        remember: (response: Response) => {
          for (const raw of response.headers.getSetCookie?.() ?? []) {
            const pair = raw.split(";")[0] ?? "";
            const at = pair.indexOf("=");
            if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
          }
        },
      };
    };

    /**
     * The client's half: an authorization request with PKCE, followed until
     * the provider hands the browser to the CONSENT host. The chain stops
     * there because that host is the Admin, which this harness is not running
     * — which is itself the point: the provider really does send the browser
     * off its own origin.
     */
    const startAuthorization = async (scope: string) => {
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      const url =
        `${ISSUER}/auth?client_id=${encodeURIComponent(CLIENT_ID)}` +
        `&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT)}` +
        `&scope=${encodeURIComponent(scope)}` +
        `&resource=${encodeURIComponent(RESOURCE)}` +
        `&code_challenge=${challenge}&code_challenge_method=S256` +
        // Without an explicit consent prompt `offline_access` does not
        // survive and no refresh token is issued at all.
        `&state=${randomBytes(8).toString("base64url")}&prompt=consent`;

      const jar = newJar();
      let response = await fetch(url, { redirect: "manual" });
      jar.remember(response);
      let landing: URL | null = null;
      for (let hop = 0; hop < 6 && landing === null; hop += 1) {
        const location = response.headers.get("location");
        if (location === null) break;
        const next = new URL(location, ISSUER);
        if (next.origin === CONSENT_BASE) {
          landing = next;
          break;
        }
        response = await fetch(next, {
          redirect: "manual",
          headers: { cookie: jar.header() },
        });
        jar.remember(response);
      }
      expect(landing).not.toBeNull();
      const uid = landing?.pathname.split("/").pop() ?? "";
      return { jar, uid, verifier, landing: landing as URL };
    };

    /** The Admin's half, through the REAL decision function. */
    const approve = async (uid: string, OWNER: string) => {
      const { resolveConnection } = await import("admin/agent-connections");
      const consent = await consents.read(uid);
      expect(consent).not.toBeNull();
      const connection = await resolveConnection(
        runtime!,
        OWNER,
        consent!.oauthClientId,
      );
      const { ticket, digest } = mintConsentTicket();
      expect(
        await consents.arm({
          interactionUid: uid,
          ticketDigest: digest,
          connectionId: connection.id,
          humanAccountId: OWNER,
        }),
      ).not.toBeNull();
      const outcome = await decideConsent(runtime!, OWNER, {
        interaction: uid,
        ticket,
        decision: "approve",
      });
      return { outcome, connection };
    };

    /** The browser's return trip, which only the provider's cookie makes real. */
    const resume = async (
      jar: ReturnType<typeof newJar>,
      resumeUrl: string,
    ): Promise<URL | null> => {
      let response = await fetch(resumeUrl, {
        redirect: "manual",
        headers: { cookie: jar.header() },
      });
      jar.remember(response);
      for (let hop = 0; hop < 6; hop += 1) {
        const location = response.headers.get("location");
        if (location === null) return null;
        const next = new URL(location, ISSUER);
        if (next.origin === new URL(REDIRECT).origin) return next;
        response = await fetch(next, {
          redirect: "manual",
          headers: { cookie: jar.header() },
        });
        jar.remember(response);
      }
      return null;
    };

    const exchange = async (code: string, verifier: string) =>
      (await (
        await fetch(`${ISSUER}/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: REDIRECT,
            client_id: CLIENT_ID,
            code_verifier: verifier,
            resource: RESOURCE,
          }),
        })
      ).json()) as {
        access_token?: string;
        refresh_token?: string;
        error?: string;
      };

    it("opens an interaction carrying only what the provider will enforce", async () => {
      const { uid } = await startAuthorization("artvenn:read offline_access");
      const consent = await consents.read(uid);
      expect(consent).toMatchObject({
        oauthClientId: CLIENT_ID,
        resource: RESOURCE,
        capabilityScopes: ["artvenn:read"],
        protocolScopes: ["offline_access"],
        preset: "read-only",
        // The provider authenticates nobody, so it says nothing about who.
        humanAccountId: null,
        connectionId: null,
        ticketArmed: false,
        decision: null,
      });
    });

    it("completes consent, PKCE and the token exchange, and the client never sees a provider token", async () => {
      const { jar, uid, verifier } = await startAuthorization(
        "artvenn:read offline_access",
      );
      const account = owner("flow");
      const { outcome, connection } = await approve(uid, account);
      expect(outcome.decision).toBe("approved");
      expect(outcome.resume).toBe(`${ISSUER}/interaction/${uid}/resume`);

      const back = await resume(jar, outcome.resume);
      expect(back?.searchParams.get("error")).toBeNull();
      const code = back?.searchParams.get("code");
      expect(code).toBeTruthy();

      const tokens = await exchange(code ?? "", verifier);
      expect(tokens.error).toBeUndefined();
      // Design B: the client receives OUR opaque value, never the provider's.
      expect(tokens.access_token).toMatch(/^artvenn_ct_/u);
      expect(tokens.refresh_token).toBeTruthy();

      // The snapshot froze the generation the CONSENT recorded, and the
      // connection is pointed at it.
      const stored = await runtime!.connections.readForAuthorization(
        connection.id,
      );
      expect(stored?.connection.status).toBe("authorized");
      expect(stored?.connection.generation).toBe(1);
      expect(stored?.grant).toMatchObject({
        connectionId: connection.id,
        generationAtConsent: 1,
        oauthClientId: CLIENT_ID,
        humanSubject: account,
        issuer: ISSUER,
        resource: RESOURCE,
        capabilityScopes: ["artvenn:read"],
        presetAtConsent: "read-only",
      });

      // Spent. A replayed resume cannot produce a second grant.
      const replay = await resume(newJar(), outcome.resume);
      expect(replay?.searchParams.get("code") ?? null).toBeNull();
    });

    it("refuses a management request instead of narrowing it to read-only", async () => {
      const { jar, uid } = await startAuthorization(
        "artvenn:read artvenn:manage offline_access",
      );
      const consent = await consents.read(uid);
      // Recorded as ASKED FOR. Silently dropping it here is what would let a
      // client believe it had management.
      expect(consent?.capabilityScopes).toEqual([
        "artvenn:read",
        "artvenn:manage",
      ]);
      // The review page refuses to render it, so no human is ever offered it.
      expect(() =>
        describeConsent({
          interactionUid: consent!.interactionUid,
          oauthClientId: consent!.oauthClientId,
          resource: consent!.resource,
          capabilityScopes: consent!.capabilityScopes,
          protocolScopes: consent!.protocolScopes,
          preset: consent!.preset,
          expiresAt: consent!.expiresAt,
          environment: "development",
          now: new Date(),
        }),
      ).toThrow(ConsentError);
      // And an undecided interaction resumes to a denial, so the client gets
      // an answer rather than a browser parked on a dead page.
      const back = await resume(jar, `${ISSUER}/interaction/${uid}/resume`);
      expect(back?.searchParams.get("error")).toBe("access_denied");
      expect(back?.searchParams.get("code") ?? null).toBeNull();
    });

    it("refuses a resume that carries no interaction cookie of its own", async () => {
      const { uid } = await startAuthorization("artvenn:read offline_access");
      await approve(uid, owner("no-cookie"));
      // A uid is a name. Without the provider's own cookie it resumes nothing,
      // and nothing is granted.
      const response = await fetch(`${ISSUER}/interaction/${uid}/resume`, {
        redirect: "manual",
      });
      expect(response.status).toBe(400);
      const { rows } = await pool.query(
        "SELECT grant_id FROM community.agent_connection_consents WHERE interaction_uid=$1",
        [uid],
      );
      expect((rows[0] as { grant_id: string | null }).grant_id).toBeNull();
    });

    it("denies a decision whose connection moved while the browser was away", async () => {
      const { jar, uid } = await startAuthorization(
        "artvenn:read offline_access",
      );
      const { outcome, connection } = await approve(uid, owner("moved"));
      // A disconnect between the decision and the return trip. The consent
      // recorded generation 1; the connection is now at 2.
      await runtime!.authority.revoke(connection.id, new Date().toISOString());

      const back = await resume(jar, outcome.resume);
      expect(back?.searchParams.get("error")).toBe("access_denied");
      const stored = await runtime!.connections.readForAuthorization(
        connection.id,
      );
      expect(stored?.connection.status).toBe("revoked");
      expect(stored?.grant).toBeNull();
    });
  });
};
