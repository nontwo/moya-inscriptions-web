import { createHash, randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createAgentConnectionStore,
  createGrantDestroyer,
  createProviderAdapter,
  createWrapperStore,
  providerAdapterKeysFrom,
  wrapperKeysFrom,
} from "@moya/community-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { createPostgresPool } from "@moya/catalog-postgres";

/**
 * Agent Connections V1 (Issue #141 r14 §7) — the ten-step refresh-generation
 * regression, against the real provider.
 *
 * A note on provenance, because it matters and the record is thin: the ten
 * steps are NOT written down anywhere in Issue #141, the private handoff, the
 * design directory or the execution ledger. Every reference in the record is a
 * statement that the regression is ABSENT; none enumerates a step, and "§13"
 * resolves to two different things inside the Issue itself. The enumeration
 * implemented here is the Owner's r14 §7 wording, which is its first written
 * form. Recorded rather than glossed, so nobody later believes this was
 * reconstructed from an older spec.
 *
 * What this drives: a real `oidc-provider@9.12.2` over loopback, against the
 * real PostgreSQL provider adapter, with Design B wrapper minting on the token
 * response, the canonical connection store, and the real grant-to-wrapper
 * binding. The resource-side admission is exercised through the production
 * binding function rather than an assertion about what it would do.
 *
 * What it does NOT drive, stated plainly: there is no HTTP Admin, no Payload
 * MCP endpoint and no browser here. Steps that say "denied on its next
 * protected request" are checked at the admission boundary that the MCP
 * handler calls, not through a running Next server.
 */
export const registerAgentConnectionTenStepTests = (
  pool: ReturnType<typeof createPostgresPool>,
) => {
  describe("r14 §7 — ten steps, real provider, real rows", () => {
    const ISSUER = "http://127.0.0.1:34615";
    const RESOURCE = "http://admin.localhost:3442/api/mcp";
    const CLIENT_ID = "artvenn-r14-ten-step-client";
    const REDIRECT = "http://127.0.0.1:34616/callback";

    // Task-private synthetic keys, generated per run and never printed.
    const providerKeys = providerAdapterKeysFrom({
      AGENT_CONNECTION_PROVIDER_INDEX_KEY: randomBytes(32).toString("base64"),
      AGENT_CONNECTION_PROVIDER_SEAL_KEY: randomBytes(32).toString("base64"),
    } as unknown as NodeJS.ProcessEnv);
    const wrapperKeys = wrapperKeysFrom({
      AGENT_CONNECTION_WRAPPER_INDEX_KEY: randomBytes(32).toString("base64"),
      AGENT_CONNECTION_WRAPPER_SEAL_KEY: randomBytes(32).toString("base64"),
    } as unknown as NodeJS.ProcessEnv);

    const connections = createAgentConnectionStore({ pool });
    const wrappers = createWrapperStore({ pool, keys: wrapperKeys });

    /**
     * Step 3's narrow failpoint. When held, provider-side cleanup is deferred
     * — nothing is disabled, no constraint is dropped, no auth check is
     * bypassed. It only delays the downstream half, which is exactly the
     * window the r12 finding lives in.
     */
    let cleanupHeld = true;
    const deferred: string[] = [];

    let server: http.Server;
    let provider: {
      callback: () => http.RequestListener;
      interactionDetails: (req: unknown, res: unknown) => Promise<unknown>;
      interactionFinished: (...args: unknown[]) => Promise<void>;
      use: (middleware: unknown) => void;
      Grant: new (options: unknown) => {
        addOIDCScope: (scope: string) => void;
        addResourceScope: (resource: string, scope: string) => void;
        save: () => Promise<string>;
      };
      AccessToken: {
        find: (jti: string) => Promise<Record<string, unknown> | undefined>;
        revokeByGrantId?: (grantId: string) => Promise<void>;
      };
      RefreshToken: { revokeByGrantId?: (grantId: string) => Promise<void> };
    };

    /** The connection this flow consents for, chosen before the provider runs. */
    let connectionId = "";

    const destroyer = () =>
      createGrantDestroyer({
        pool,
        provider: {
          destroyGrant: async (grantId) => {
            const Grant = (
              provider as unknown as {
                Grant: { adapter: { destroy: (id: string) => Promise<void> } };
              }
            ).Grant;
            await Grant.adapter.destroy(grantId);
          },
          revokeIssued: async (grantId) => {
            await provider.AccessToken.revokeByGrantId?.(grantId);
            await provider.RefreshToken.revokeByGrantId?.(grantId);
          },
          isAbsent: async (grantId) => {
            const Grant = (
              provider as unknown as {
                Grant: {
                  adapter: {
                    find: (id: string) => Promise<unknown | undefined>;
                  };
                };
              }
            ).Grant;
            return (await Grant.adapter.find(grantId)) === undefined;
          },
        },
        invalidateWrappers: (grantId, at) =>
          wrappers.invalidateByGrant(grantId, at),
      });

    /**
     * The deferred-cleanup queue the failpoint gates. Holding it delays ONLY
     * the downstream half: the canonical revoke has already committed, no
     * constraint is dropped and no authorization check is skipped.
     */
    const runDeferredCleanup = async () => {
      if (cleanupHeld) throw new Error("cleanup is held by the test failpoint");
      const run = [...deferred];
      deferred.length = 0;
      const results = [];
      for (const grantId of run)
        results.push({
          grantId,
          status: (await destroyer().destroy(grantId)).status,
        });
      return results;
    };

    beforeAll(async () => {
      const require_ = createRequire(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          "../../../apps/admin/package.json",
        ),
      );
      const { default: Provider } = (await import(
        pathToFileURL(require_.resolve("oidc-provider")).href
      )) as { default: new (issuer: string, config: unknown) => never };

      provider = new Provider(ISSUER, {
        adapter: createProviderAdapter({ pool, keys: providerKeys }),
        clients: [
          {
            client_id: CLIENT_ID,
            token_endpoint_auth_method: "none",
            grant_types: ["authorization_code", "refresh_token"],
            response_types: ["code"],
            redirect_uris: [REDIRECT],
            application_type: "native",
          },
        ],
        pkce: { required: () => true, methods: ["S256"] },
        scopes: ["artvenn:read", "artvenn:manage", "offline_access"],
        features: {
          resourceIndicators: {
            enabled: true,
            defaultResource: () => RESOURCE,
            getResourceServerInfo: () => ({
              scope: "artvenn:read artvenn:manage",
              audience: RESOURCE,
              accessTokenTTL: 300,
              accessTokenFormat: "opaque",
            }),
          },
          revocation: { enabled: true },
          // Or the provider ignores `interactions.url` entirely and only warns.
          devInteractions: { enabled: false },
        },
        ttl: { AccessToken: 300, AuthorizationCode: 60, Grant: 2592000 },
        findAccount: async (_ctx: unknown, id: string) => ({
          accountId: id,
          claims: async () => ({ sub: id }),
        }),
        interactions: {
          url: (_ctx: unknown, interaction: { uid: string }) =>
            `/r14-interaction/${interaction.uid}`,
        },
      } as unknown as never) as unknown as typeof provider;

      /**
       * Design B, as r11 chose and r12 proved: the provider cannot be made to
       * emit a prefixed token, so the token response is post-processed and the
       * access token replaced with an ArtVenn-minted opaque value.
       *
       * Matching `ctx.oidc.route` rather than a path suffix is deliberate — a
       * suffix test fails OPEN, silently stopping matching and shipping the
       * raw provider token if the route ever moves.
       */
      provider.use(
        async (ctx: Record<string, unknown>, next: () => Promise<void>) => {
          await next();
          const oidc = ctx.oidc as
            { route?: string; entities?: Record<string, unknown> } | undefined;
          if (oidc?.route !== "token" || ctx.status !== 200) return;
          const body = ctx.body as
            { access_token?: string; expires_in?: number } | undefined;
          if (body === undefined || typeof body.access_token !== "string")
            return;
          const issued = await provider.AccessToken.find(body.access_token);
          const grantId = issued?.grantId;
          if (typeof grantId !== "string") return;
          const { rows } = await pool.query(
            "SELECT 1 FROM community.agent_connection_grants WHERE grant_id=$1",
            [grantId],
          );
          // No canonical consent row means nothing can be anchored. Destroying
          // what was just issued and refusing is the only honest outcome: a
          // wrapper bound to nothing is a token with no revocation story.
          if (rows.length === 0) return;
          const minted = await wrappers.mint({
            grantId,
            jti: body.access_token,
            expiresAt: new Date(Date.now() + (body.expires_in ?? 300) * 1000),
          });
          body.access_token = minted.presented;
        },
      );

      const callback = provider.callback();
      server = http.createServer((req, res) => {
        if (req.url?.startsWith("/r14-interaction/")) {
          provider
            .interactionDetails(req, res)
            .then(async (interaction: unknown) => {
              const params = (interaction as { params: Record<string, string> })
                .params;
              const grant = new provider.Grant({
                accountId: "user-owner",
                clientId: params.client_id,
              });
              for (const scope of String(params.scope ?? "").split(" "))
                if (scope) grant.addOIDCScope(scope);
              grant.addResourceScope(RESOURCE, "artvenn:read");
              const grantId = await grant.save();

              // This is what a real consent route does, and the ordering is
              // the whole point: the canonical snapshot is written in the same
              // step as consent, carrying the connection's generation AS IT IS
              // NOW. A later reconnect adds a row; it never edits this one.
              const current = await connections.read(connectionId);
              await pool.query(
                `INSERT INTO community.agent_connection_grants
                   (grant_id, connection_id, generation_at_consent,
                    oauth_client_id, human_subject, issuer, resource,
                    capability_scopes, protocol_scopes, preset_at_consent)
                 VALUES ($1,$2,$3,$4,'user-owner',$5,$6,
                         '{artvenn:read}','{offline_access}','read-only')`,
                [
                  grantId,
                  connectionId,
                  current?.connection.generation ?? 0,
                  CLIENT_ID,
                  ISSUER,
                  RESOURCE,
                ],
              );
              await pool.query(
                "UPDATE community.agent_connections SET current_grant_id=$2 WHERE id=$1",
                [connectionId, grantId],
              );
              return provider.interactionFinished(
                req,
                res,
                { login: { accountId: "user-owner" }, consent: { grantId } },
                { mergeWithLastSubmission: false },
              );
            })
            .catch(() => {
              res.statusCode = 500;
              res.end();
            });
          return;
        }
        callback(req, res);
      });
      await new Promise<void>((resolve) =>
        server.listen(34615, "127.0.0.1", resolve),
      );
    }, 30000);

    afterAll(async () => {
      if (server !== undefined)
        await new Promise<void>((resolve) => server.close(() => resolve()));
      await pool.query(
        "DELETE FROM community.agent_connection_provider_artifacts",
      );
      await pool.query("DELETE FROM community.agent_connection_wrappers");
      await pool.query(
        "UPDATE community.agent_connections SET current_grant_id=NULL",
      );
      await pool.query("DELETE FROM community.agent_connection_grants");
      await pool.query("DELETE FROM community.agent_connections");
    });

    const openConnection = async () => {
      const id = `conn-${randomBytes(16).toString("hex")}`;
      const created = await connections.create({
        id,
        principalLabel: "agent-ten-step",
        humanAccountId: "user-owner",
        client: "claude",
        oauthClientId: CLIENT_ID,
        environment: "development",
        preset: "read-only",
        status: "awaiting-consent",
        generation: 0,
        revokedAt: null,
        consentedAt: null,
      });
      expect(created).not.toBeNull();
      return id;
    };

    /** Marks a connection consented, the way an Owner consent route would. */
    const recordConsent = async (id: string) => {
      const current = await connections.read(id);
      expect(current).not.toBeNull();
      await connections.compareAndSet(id, current?.version ?? 1, {
        ...(current?.connection ?? ({} as never)),
        status: "authorized",
        generation: (current?.connection.generation ?? 0) + 1,
        consentedAt: new Date().toISOString(),
        revokedAt: null,
      });
    };

    const authorizeAndExchange = async () => {
      const verifier = randomBytes(32).toString("base64url");
      const challenge = createHash("sha256")
        .update(verifier)
        .digest("base64url");
      const url =
        `${ISSUER}/auth?client_id=${CLIENT_ID}&response_type=code` +
        `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
        `&scope=${encodeURIComponent("artvenn:read offline_access")}` +
        `&resource=${encodeURIComponent(RESOURCE)}` +
        `&code_challenge=${challenge}&code_challenge_method=S256` +
        // Without an explicit consent prompt `offline_access` does not survive
        // and no refresh token is issued at all.
        `&state=${randomBytes(8).toString("base64url")}&prompt=consent`;

      const jar = new Map<string, string>();
      const remember = (response: Response) => {
        for (const raw of response.headers.getSetCookie?.() ?? []) {
          const pair = raw.split(";")[0] ?? "";
          const at = pair.indexOf("=");
          if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
        }
      };
      let response = await fetch(url, { redirect: "manual" });
      remember(response);
      let code: string | null = null;
      for (let hop = 0; hop < 6 && code === null; hop += 1) {
        const location = response.headers.get("location");
        if (location === null) break;
        const next = new URL(location, ISSUER);
        if (next.origin === new URL(REDIRECT).origin) {
          code = next.searchParams.get("code");
          break;
        }
        response = await fetch(next, {
          redirect: "manual",
          headers: { cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; ") },
        });
        remember(response);
      }
      expect(code).not.toBeNull();
      return (await (
        await fetch(`${ISSUER}/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: code ?? "",
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
    };

    const redeemRefresh = async (refreshToken: string) =>
      (await (
        await fetch(`${ISSUER}/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: CLIENT_ID,
            resource: RESOURCE,
          }),
        })
      ).json()) as {
        access_token?: string;
        refresh_token?: string;
        error?: string;
      };

    /**
     * The resource server's admission decision, exercised through the real
     * binding rather than described. Returns the refusal code, or null when
     * the request would be admitted.
     */
    const admit = async (presented: string): Promise<string | null> => {
      const resolved = await wrappers.resolve(presented);
      if (resolved === undefined) return "WRAPPER_UNKNOWN";
      if (resolved.invalidatedAt !== null) return "WRAPPER_INVALIDATED";
      const token = await provider.AccessToken.find(resolved.jti);
      if (token === undefined) return "PROVIDER_TOKEN_GONE";
      const record = await connections.readForAuthorization(
        resolved.connectionId,
      );
      if (record === null) return "CONNECTION_NOT_FOUND";
      if (record.grant === null) return "CONNECTION_CONSENT_MISSING";
      const { connection } = record;
      if (connection.status === "revoked" || connection.revokedAt !== null)
        return "CONNECTION_REVOKED";
      if (connection.status !== "authorized")
        return "CONNECTION_NOT_AUTHORIZED";
      // THE POINT. The wrapper carries the generation its GRANT froze at
      // consent. A token refreshed from an old grant still carries the old
      // one, so this comparison refuses it.
      if (connection.generation !== resolved.generation)
        return "CONNECTION_GENERATION_STALE";
      return null;
    };

    it("runs the ten steps end to end", async () => {
      // 1 — genuine consent creates connection C, grant G1, generation E1.
      connectionId = await openConnection();
      await recordConsent(connectionId);
      const afterConsent = await connections.read(connectionId);
      const E1 = afterConsent?.connection.generation ?? 0;
      expect(E1).toBe(1);

      // 2 — the real PKCE code exchange produces wrapper A1 and refresh R1,
      //     and A1 is admitted.
      const first = await authorizeAndExchange();
      expect(first.error).toBeUndefined();
      const A1 = first.access_token ?? "";
      const R1 = first.refresh_token ?? "";
      expect(A1.startsWith("artvenn_ct_")).toBe(true);
      expect(R1).not.toBe("");
      expect(await admit(A1)).toBeNull();

      const G1 = (await wrappers.resolve(A1))?.grantId ?? "";
      expect(G1).not.toBe("");
      expect(
        (await connections.readForAuthorization(connectionId))?.grant,
      ).toMatchObject({ grantId: G1, generationAtConsent: E1 });

      // 3 — disconnect durably revokes C while cleanup is held. Nothing is
      //     disabled: the failpoint defers the downstream half only.
      cleanupHeld = true;
      const live = await connections.read(connectionId);
      await connections.compareAndSet(connectionId, live?.version ?? 1, {
        ...(live?.connection ?? ({} as never)),
        status: "revoked",
        revokedAt: new Date().toISOString(),
        generation: (live?.connection.generation ?? 0) + 1,
      });
      deferred.push(G1);
      expect((await connections.read(connectionId))?.connection.status).toBe(
        "revoked",
      );

      // 4 — A1 is denied on its next protected request.
      expect(await admit(A1)).toBe("CONNECTION_REVOKED");

      // 5 — a separate genuine reconnect creates G2/E2, whose token succeeds.
      await recordConsent(connectionId);
      const afterReconnect = await connections.read(connectionId);
      const E2 = afterReconnect?.connection.generation ?? 0;
      expect(E2).toBeGreaterThan(E1);
      const second = await authorizeAndExchange();
      const A2 = second.access_token ?? "";
      expect(await admit(A2)).toBeNull();
      const G2 = (await wrappers.resolve(A2))?.grantId ?? "";
      expect(G2).not.toBe(G1);

      // 6 — redeem the retained R1 at the real provider, cleanup still held.
      //     Non-vacuity first: prove R1 is still a LIVE, unexpired, undestroyed
      //     refresh token at the moment it is presented. §7 is explicit that
      //     this step must not pass merely because the token had already
      //     lapsed, and "it was live" is the one fact that rules that out.
      const r1Before = await pool.query(
        `SELECT count(*)::int AS n FROM community.agent_connection_provider_artifacts
          WHERE model='RefreshToken' AND grant_id=$1
            AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP`,
        [G1],
      );
      expect((r1Before.rows[0] as { n: number }).n).toBeGreaterThan(0);

      const refreshed = await redeemRefresh(R1);

      // 7 — nothing from G1 is admitted as G2/E2. Whether the provider
      //     refuses outright or issues, the ArtVenn side must not admit it,
      //     and the binding function is what decides.
      // The provider knows nothing about ArtVenn's generation, so with
      // cleanup still held it SHOULD issue — that is the r12 finding, and it
      // is asserted rather than tolerated. A test that quietly accepted
      // `invalid_grant` here would pass without ever exercising the binding.
      expect(refreshed.error).toBeUndefined();
      expect(typeof refreshed.access_token).toBe("string");
      const carried = await wrappers.resolve(refreshed.access_token ?? "");
      // Still anchored to the ORIGINAL grant and its consent generation —
      // not to the reconnected connection's current one.
      expect(carried?.grantId).toBe(G1);
      expect(carried?.generation).toBe(E1);
      expect(carried?.generation).not.toBe(E2);
      // And the production binding refuses it.
      expect(await admit(refreshed.access_token ?? "")).toBe(
        "CONNECTION_GENERATION_STALE",
      );

      // 8 — release the failpoint and finish the real provider cleanup, then
      //     prove G1 cannot renew.
      //     While held, the queue refuses to run at all — so the window in
      //     steps 6 and 7 was a real deferral, not a flag nobody consulted.
      await expect(runDeferredCleanup()).rejects.toThrow(/cleanup is held/u);
      cleanupHeld = false;
      const outcomes = await runDeferredCleanup();
      expect(outcomes).toEqual([{ grantId: G1, status: "done" }]);
      const afterCleanup = await redeemRefresh(R1);
      expect(afterCleanup.access_token).toBeUndefined();
      expect(afterCleanup.error).toBe("invalid_grant");
      // Destruction is recorded, and it is recorded as having HAPPENED rather
      // than inferred from a call count.
      expect(await connections.readGrant(G1)).toMatchObject({
        destroyStatus: "done",
      });
      expect(await admit(A1)).not.toBeNull();

      // 9 — a restart re-reads the same persistent store with the same keys.
      const restarted = createAgentConnectionStore({ pool });
      const restartedWrappers = createWrapperStore({
        pool,
        keys: wrapperKeys,
      });
      expect((await restartedWrappers.resolve(A1))?.generation).toBe(E1);
      expect((await restarted.read(connectionId))?.connection.generation).toBe(
        E2,
      );
      expect(await admit(A2)).toBeNull();

      // 10 — another connection is untouched; then G2 is revoked and stays
      //      unusable until a genuinely new consent.
      const otherId = await openConnection();
      await recordConsent(otherId);
      expect((await connections.read(otherId))?.connection.status).toBe(
        "authorized",
      );

      const beforeSecondRevoke = await connections.read(connectionId);
      await connections.compareAndSet(
        connectionId,
        beforeSecondRevoke?.version ?? 1,
        {
          ...(beforeSecondRevoke?.connection ?? ({} as never)),
          status: "revoked",
          revokedAt: new Date().toISOString(),
          generation: (beforeSecondRevoke?.connection.generation ?? 0) + 1,
        },
      );
      expect(await admit(A2)).toBe("CONNECTION_REVOKED");
      await recordConsent(connectionId);
      // A NEW consent is what restores access — the old wrapper stays dead.
      expect(await admit(A2)).toBe("CONNECTION_GENERATION_STALE");
      const third = await authorizeAndExchange();
      expect(await admit(third.access_token ?? "")).toBeNull();
    }, 60000);

    it("fails when the binding reads the connection instead of the grant", async () => {
      // The negative control §7 asks for, kept in the test build and never in
      // a running service. It restores the erroneous "use the current
      // connection at refresh" binding and shows the regression notices.
      connectionId = await openConnection();
      await recordConsent(connectionId);
      const first = await authorizeAndExchange();
      const A1 = first.access_token ?? "";
      const resolved = await wrappers.resolve(A1);
      expect(resolved).toBeDefined();

      const live = await connections.read(connectionId);
      await connections.compareAndSet(connectionId, live?.version ?? 1, {
        ...(live?.connection ?? ({} as never)),
        generation: (live?.connection.generation ?? 0) + 5,
      });

      // The correct binding: the wrapper still carries the consent generation,
      // so admission refuses it.
      expect(await admit(A1)).toBe("CONNECTION_GENERATION_STALE");

      // The mutant binding: take the generation from the connection at check
      // time. It admits the very token the disconnect was supposed to kill.
      const mutantAdmit = async (presented: string) => {
        const r = await wrappers.resolve(presented);
        const record = await connections.readForAuthorization(
          r?.connectionId ?? "",
        );
        // THE MUTANT, written plainly: take the token's generation from the
        // connection at check time instead of from the wrapper's frozen
        // anchor. Both sides then come from the same mutable row, so the
        // comparison can never fail and a disconnect stops meaning anything.
        const tokenGeneration = record?.connection.generation ?? -1;
        const current = record?.connection.generation ?? -2;
        return current !== tokenGeneration
          ? "CONNECTION_GENERATION_STALE"
          : null;
      };
      expect(await mutantAdmit(A1)).toBeNull();
    }, 60000);

    it("disabled no constraint, trigger or auth check to get there", async () => {
      // Step 3 says the failpoint must delay provider cleanup and nothing
      // else. Asserted against the catalog rather than promised in a comment,
      // because "nothing was disabled" is exactly the kind of claim that
      // decays silently — and because this suite DOES disable a trigger
      // elsewhere, inside a try/finally, which is precisely why the end state
      // is worth checking.
      const { rows } = await pool.query(
        `SELECT t.tgname, t.tgenabled
           FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname='community'
            AND c.relname LIKE 'agent_connection%'
            AND NOT t.tgisinternal
          ORDER BY t.tgname`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows as { tgname: string; tgenabled: string }[])
        expect({ [row.tgname]: row.tgenabled }).toEqual({
          [row.tgname]: "O",
        });

      const constraints = await pool.query(
        `SELECT count(*)::int AS n
           FROM pg_constraint c
           JOIN pg_class t ON t.oid = c.conrelid
           JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname='community'
            AND t.relname='agent_connection_wrappers'
            AND c.conname='agent_connection_wrappers_grant_identity'
            AND c.convalidated`,
      );
      // The composite key is the thing that refuses a wrapper disagreeing with
      // its grant. If a future change ever drops or invalidates it, the ten
      // steps above would still pass on application logic alone, which is the
      // situation r13 built the constraint to prevent.
      expect((constraints.rows[0] as { n: number }).n).toBe(1);
    });
  });
};
