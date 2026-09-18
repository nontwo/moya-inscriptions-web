import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import http from "node:http";

import {
  createProviderAdapter,
  providerAdapterKeysFrom,
} from "@moya/community-postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import type { createPostgresPool } from "@moya/catalog-postgres";

/**
 * Agent Connections V1 (Issue #141 r13): the provider adapter, exercised by the
 * REAL `oidc-provider`.
 *
 * An earlier round wrote a throwaway adapter that the provider rejected while
 * the adapter itself reported a hit, so nothing here is asserted by calling the
 * adapter directly and hoping the contract matches. A real provider runs a real
 * authorization-code + PKCE flow and a real refresh against these tables, and
 * the assertions are about what ends up in PostgreSQL.
 */
export const registerAgentConnectionProviderTests = (
  pool: ReturnType<typeof createPostgresPool>,
) => {
  describe("Agent connection provider adapter on PostgreSQL", () => {
    const ISSUER = "http://127.0.0.1:34613";
    const RESOURCE = "http://127.0.0.1:3442/api/mcp";
    const CLIENT_ID = "artvenn-r13-contract-client";
    const REDIRECT = "http://127.0.0.1:34614/callback";

    // Task-private synthetic keys. They exist only inside this process.
    const keys = providerAdapterKeysFrom({
      AGENT_CONNECTION_PROVIDER_INDEX_KEY: randomBytes(32).toString("base64"),
      AGENT_CONNECTION_PROVIDER_SEAL_KEY: randomBytes(32).toString("base64"),
    } as unknown as NodeJS.ProcessEnv);

    /** Every (model, method) the provider actually asked for, in order. */
    const calls: { model: string; method: string }[] = [];

    let server: http.Server;
    let provider: {
      callback: () => http.RequestListener;
      interactionDetails: (req: unknown, res: unknown) => Promise<never>;
      interactionFinished: (...args: unknown[]) => Promise<void>;
      Grant: new (options: unknown) => {
        addOIDCScope: (scope: string) => void;
        addResourceScope: (resource: string, scope: string) => void;
        save: () => Promise<string>;
      };
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

      const Base = createProviderAdapter({ pool, keys });
      // A thin recording wrapper, so the suite can assert WHICH contract the
      // provider exercised rather than assume the documented one.
      class Recording extends Base {
        constructor(name: string) {
          super(name);
          calls.push({ model: name, method: "constructor" });
        }
      }
      for (const method of [
        "upsert",
        "find",
        "findByUid",
        "consume",
        "destroy",
        "revokeByGrantId",
      ] as const) {
        const original = (Base.prototype as unknown as Record<string, unknown>)[
          method
        ];
        (Recording.prototype as unknown as Record<string, unknown>)[method] =
          function (this: { model: string }, ...args: unknown[]) {
            calls.push({ model: this.model, method });
            return (original as (...a: unknown[]) => unknown).apply(this, args);
          };
      }

      provider = new Provider(ISSUER, {
        adapter: Recording,
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
          devInteractions: { enabled: false },
        },
        ttl: { AccessToken: 300, AuthorizationCode: 60, Grant: 2592000 },
        findAccount: async (_ctx: unknown, id: string) => ({
          accountId: id,
          claims: async () => ({ sub: id }),
        }),
        interactions: {
          url: (_ctx: unknown, interaction: { uid: string }) =>
            `/r13-interaction/${interaction.uid}`,
        },
      } as unknown) as unknown as typeof provider;

      const callback = provider.callback();
      server = http.createServer((req, res) => {
        if (req.url?.startsWith("/r13-interaction/")) {
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
        server.listen(34613, "127.0.0.1", resolve),
      );
    }, 30000);

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    afterEach(async () => {
      await pool.query(
        "DELETE FROM community.agent_connection_provider_artifacts",
      );
      calls.length = 0;
    });

    /** Drives a full authorize + code exchange, returning the token response. */
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
          headers: {
            cookie: [...jar].map(([n, v]) => `${n}=${v}`).join("; "),
          },
        });
        remember(response);
      }
      expect(code).not.toBeNull();
      const tokens = (await (
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
      return { tokens, verifier };
    };

    it("completes a real authorization-code + PKCE flow against the PostgreSQL adapter", async () => {
      const { tokens } = await authorizeAndExchange();
      expect(tokens.error).toBeUndefined();
      expect(typeof tokens.access_token).toBe("string");
      expect(typeof tokens.refresh_token).toBe("string");
    }, 30000);

    it("exercises exactly the models the configuration enables, and never one outside the allowlist", async () => {
      await authorizeAndExchange();
      const models = [...new Set(calls.map(({ model }) => model))].sort();
      // All six, because `offline_access` means the code exchange issues a
      // refresh token too. The point of the assertion is the second half: the
      // provider asked for nothing the migration does not bound.
      expect(models).toEqual([
        "AccessToken",
        "AuthorizationCode",
        "Grant",
        "Interaction",
        "RefreshToken",
        "Session",
      ]);
    }, 30000);

    it("upserts the same interaction id twice, so upsert must be a real upsert", async () => {
      await authorizeAndExchange();
      const interactionUpserts = calls.filter(
        ({ model, method }) => model === "Interaction" && method === "upsert",
      );
      expect(interactionUpserts.length).toBeGreaterThanOrEqual(2);
    }, 30000);

    it("consumes the authorization code, so a replay is a replay and not a miss", async () => {
      await authorizeAndExchange();
      expect(
        calls.some(
          ({ model, method }) =>
            model === "AuthorizationCode" && method === "consume",
        ),
      ).toBe(true);
      const { rows } = await pool.query(
        `SELECT consumed_at FROM community.agent_connection_provider_artifacts
          WHERE model='AuthorizationCode'`,
      );
      expect(rows[0]?.consumed_at).not.toBeNull();
    }, 30000);

    it("refuses a code replay after consumption", async () => {
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
        `&state=${randomBytes(8).toString("base64url")}&prompt=consent`;
      const jar = new Map<string, string>();
      let response = await fetch(url, { redirect: "manual" });
      for (const raw of response.headers.getSetCookie?.() ?? []) {
        const pair = raw.split(";")[0] ?? "";
        const at = pair.indexOf("=");
        if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
      }
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
        for (const raw of response.headers.getSetCookie?.() ?? []) {
          const pair = raw.split(";")[0] ?? "";
          const at = pair.indexOf("=");
          if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
        }
      }
      const exchange = () =>
        fetch(`${ISSUER}/token`, {
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
        }).then((r) => r.json() as Promise<{ error?: string }>);
      expect((await exchange()).error).toBeUndefined();
      expect((await exchange()).error).toBe("invalid_grant");
    }, 30000);

    it("stores no plaintext credential: not the id, not the payload", async () => {
      const { tokens } = await authorizeAndExchange();
      const { rows } = await pool.query(
        `SELECT lookup_digest, sealed_payload, grant_id, uid_digest
           FROM community.agent_connection_provider_artifacts`,
      );
      expect(rows.length).toBeGreaterThan(0);
      const accessToken = tokens.access_token ?? "";
      for (const row of rows) {
        // The row key is a digest, never the credential it stands for.
        expect(row.lookup_digest).toMatch(/^[0-9a-f]{64}$/u);
        expect(row.lookup_digest).not.toBe(accessToken);
        // The payload is ciphertext: the account id is a claim inside it and
        // must not be readable from the row.
        const sealed = (row.sealed_payload as Buffer).toString("utf8");
        expect(sealed).not.toContain("user-owner");
        expect(sealed).not.toContain(accessToken);
      }
    }, 30000);

    it("refuses a model outside the allowlist rather than inventing a row type", () => {
      const Adapter = createProviderAdapter({ pool, keys });
      expect(() => new Adapter("DeviceCode")).toThrow(
        /unsupported provider model/u,
      );
    });

    it("treats a tampered payload as a miss, not as authority", async () => {
      const Adapter = createProviderAdapter({ pool, keys });
      const store = new Adapter("AccessToken");
      await store.upsert("token-abc", { jti: "token-abc", scope: "x" }, 300);
      expect(await store.find("token-abc")).toMatchObject({ scope: "x" });
      await pool.query(
        `UPDATE community.agent_connection_provider_artifacts
            SET sealed_payload = sealed_payload || '\\x00'::bytea`,
      );
      // Fails CLOSED: an altered row resolves to nothing rather than throwing
      // or, worse, being believed.
      expect(await store.find("token-abc")).toBeUndefined();
    });

    // This test asserted the opposite until the r13 review: that an expired row
    // is a miss. That inference from "the provider does not forward
    // {ignoreExpiration}" was backwards, and a stale `dist` let it keep
    // passing after the adapter was corrected. The provider applies its own
    // clockTolerance, and `refresh_token.js` revokes a whole grant family only
    // when `find` RETURNS a re-presented consumed token -- so hiding past-exp
    // rows here fails OPEN for reuse detection.
    it("still returns a past-expiry row, because reuse detection has to read one", async () => {
      const Adapter = createProviderAdapter({ pool, keys });
      const store = new Adapter("RefreshToken");
      await store.upsert("token-exp", { jti: "token-exp", grantId: "g-e" }, 300);
      await store.consume("token-exp");
      await pool.query(
        `UPDATE community.agent_connection_provider_artifacts
            SET expires_at = CURRENT_TIMESTAMP - interval '1 second'`,
      );
      // Expired AND consumed: precisely the row the provider must see to know
      // a revoked token was replayed.
      const replayed = await store.find("token-exp");
      expect(replayed).toMatchObject({ jti: "token-exp" });
      // `consumed` is what tells the provider a replay from a miss.
      expect(typeof replayed?.consumed).toBe("number");
    });

    it("reaps expired rows only when asked, and bounds how many", async () => {
      const Adapter = createProviderAdapter({ pool, keys });
      const store = new Adapter("AccessToken");
      for (const id of ["reap-1", "reap-2", "reap-3"])
        await store.upsert(id, { jti: id }, 300);
      await pool.query(
        `UPDATE community.agent_connection_provider_artifacts
            SET expires_at = CURRENT_TIMESTAMP - interval '1 second'`,
      );
      // Written after the sweep-back, so this is the only live row.
      await store.upsert("keep-1", { jti: "keep-1" }, 300);

      expect(await store.deleteExpired(2)).toBe(2);
      expect(await store.deleteExpired(10)).toBe(1);
      expect(await store.deleteExpired(10)).toBe(0);
      // The unexpired row is untouched: reaping is not revocation.
      expect(await store.find("keep-1")).toMatchObject({ jti: "keep-1" });
    });

    it("sweeps every artifact of one grant, idempotently", async () => {
      const Adapter = createProviderAdapter({ pool, keys });
      const access = new Adapter("AccessToken");
      await access.upsert("t1", { jti: "t1", grantId: "g-1" }, 300);
      await access.upsert("t2", { jti: "t2", grantId: "g-2" }, 300);
      await access.revokeByGrantId("g-1");
      expect(await access.find("t1")).toBeUndefined();
      expect(await access.find("t2")).toMatchObject({ jti: "t2" });
      // A second sweep deletes nothing and creates no authority.
      await access.revokeByGrantId("g-1");
      expect(await access.find("t2")).toMatchObject({ jti: "t2" });
    });

    it("tolerates destroying an id that is already gone, which session rotation does", async () => {
      const Adapter = createProviderAdapter({ pool, keys });
      const session = new Adapter("Session");
      await expect(session.destroy("never-existed")).resolves.toBeUndefined();
    });

    it("does not let one model read another's row", async () => {
      const Adapter = createProviderAdapter({ pool, keys });
      const access = new Adapter("AccessToken");
      const refresh = new Adapter("RefreshToken");
      await access.upsert("shared-id", { jti: "shared-id" }, 300);
      // The same id under a different model digests differently, so there is
      // nothing to find.
      expect(await refresh.find("shared-id")).toBeUndefined();
      expect(await access.find("shared-id")).toMatchObject({
        jti: "shared-id",
      });
    });

    it("refuses to start without its keys rather than inventing one", () => {
      expect(() => providerAdapterKeysFrom({} as NodeJS.ProcessEnv)).toThrow(
        /required/u,
      );
      expect(() =>
        providerAdapterKeysFrom({
          AGENT_CONNECTION_PROVIDER_INDEX_KEY: "dG9vLXNob3J0",
          AGENT_CONNECTION_PROVIDER_SEAL_KEY: "dG9vLXNob3J0",
        } as unknown as NodeJS.ProcessEnv),
      ).toThrow(/32 bytes/u);
    });
  });
};
