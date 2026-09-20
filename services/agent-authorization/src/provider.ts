import { createRequire } from "node:module";

import {
  createAgentConnectionStore,
  createConsentStore,
  createProviderAdapter,
  createWrapperStore,
  providerAdapterKeysFrom,
  wrapperKeysFrom,
} from "@moya/community-postgres";

import type { AuthorizationConfig } from "./config.js";
import type { Pool } from "pg";

/**
 * Agent Connections V1 (Issue #141 r15 §5) — the provider, configured from
 * what r11 chose and r12 proved rather than from a fresh reading of the docs.
 *
 * Three settings here are load-bearing and each was learned the hard way, so
 * they are stated with their consequence rather than left as options:
 *
 *  - `devInteractions: { enabled: false }`. Without it the provider IGNORES
 *    `interactions.url` entirely and only warns, so consent silently goes to
 *    the quick-start screens instead of the Owner's Admin.
 *  - `prompt=consent` on the authorize request (the client's job, asserted in
 *    the tests). Without it `offline_access` does not survive consent and NO
 *    refresh token is issued — which would make the whole revocation story
 *    untestable.
 *  - The audience is on `token.aud`, NOT `token.resourceServer.audience`.
 *
 * Design B lives in `wrapAccessToken`: the provider cannot be made to emit a
 * prefixed token, so the token endpoint's successful responses are
 * post-processed and the access token replaced with an ArtVenn-minted opaque
 * value whose mapping is bound to the consent grant.
 */

export interface ProviderBundle {
  readonly provider: OidcProvider;
  readonly connections: ReturnType<typeof createAgentConnectionStore>;
  readonly wrappers: ReturnType<typeof createWrapperStore>;
  readonly consents: ReturnType<typeof createConsentStore>;
  readonly config: AuthorizationConfig;
}

/**
 * The provider's surface this service uses. Deliberately NOT `any`: a public
 * security interface typed as unrestricted `any` is how a contract change
 * becomes a runtime surprise instead of a compile error.
 */
export interface OidcProvider {
  callback: () => (
    request: import("node:http").IncomingMessage,
    response: import("node:http").ServerResponse,
  ) => void;
  use: (
    middleware: (
      ctx: ProviderContext,
      next: () => Promise<void>,
    ) => Promise<void>,
  ) => void;
  interactionDetails: (
    request: unknown,
    response: unknown,
  ) => Promise<ProviderInteraction>;
  interactionFinished: (
    request: unknown,
    response: unknown,
    result: unknown,
    options: { mergeWithLastSubmission: boolean },
  ) => Promise<void>;
  Grant: new (options: { accountId: string; clientId: string }) => {
    addOIDCScope: (scope: string) => void;
    addResourceScope: (resource: string, scope: string) => void;
    save: () => Promise<string>;
  };
  AccessToken: {
    find: (jti: string) => Promise<ProviderAccessToken | undefined>;
    revokeByGrantId?: (grantId: string) => Promise<void>;
  };
  RefreshToken: { revokeByGrantId?: (grantId: string) => Promise<void> };
}

export interface ProviderAccessToken {
  readonly jti?: string;
  readonly accountId?: string;
  readonly clientId?: string;
  readonly aud?: string;
  readonly scope?: string;
  readonly exp?: number;
  readonly grantId?: string;
}

export interface ProviderInteraction {
  readonly uid: string;
  readonly params: Record<string, string>;
}

export interface ProviderContext {
  readonly oidc?: { route?: string };
  status?: number;
  body?: { access_token?: string; expires_in?: number } | undefined;
}

/**
 * How long a human has to decide. Short, because an abandoned tab is not a
 * standing permission, and long enough that reading the screen is not a race.
 */
export const INTERACTION_TTL_MS = 10 * 60 * 1000;

/** Loaded through the workspace's own dependency, never a deep import. */
const loadProvider = async (): Promise<
  new (issuer: string, configuration: unknown) => OidcProvider
> => {
  const require_ = createRequire(import.meta.url);
  const entry = require_.resolve("oidc-provider");
  const loaded = (await import(entry)) as {
    default: new (issuer: string, configuration: unknown) => OidcProvider;
  };
  return loaded.default;
};

export const createAuthorizationProvider = async (options: {
  readonly config: AuthorizationConfig;
  readonly pool: Pool;
  readonly environment: NodeJS.ProcessEnv;
}): Promise<ProviderBundle> => {
  const { config, pool, environment } = options;
  const Provider = await loadProvider();

  // Keys are read before anything listens. A missing key fails startup rather
  // than silently generating a new one — which would make every previously
  // sealed row unreadable and look exactly like everyone being logged out.
  const providerKeys = providerAdapterKeysFrom(environment);
  const wrapperKeys = wrapperKeysFrom(environment);

  const connections = createAgentConnectionStore({ pool });
  const wrappers = createWrapperStore({ pool, keys: wrapperKeys });
  const consents = createConsentStore({ pool });

  const provider = new Provider(config.issuer, {
    adapter: createProviderAdapter({ pool, keys: providerKeys }),
    clients: [...config.clients.values()].map((client) => ({
      client_id: client.clientId,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      redirect_uris: [...client.redirectUris],
      application_type: "native",
    })),
    pkce: { required: () => true, methods: ["S256"] },
    scopes: ["artvenn:read", "artvenn:manage", "offline_access"],
    features: {
      resourceIndicators: {
        enabled: true,
        defaultResource: () => config.resource,
        getResourceServerInfo: () => ({
          scope: "artvenn:read artvenn:manage",
          audience: config.resource,
          accessTokenTTL: 300,
          accessTokenFormat: "opaque",
        }),
      },
      revocation: { enabled: true },
      // Or `interactions.url` is ignored entirely and consent never reaches
      // the Owner's Admin. The provider only warns.
      devInteractions: { enabled: false },
    },
    ttl: { AccessToken: 300, AuthorizationCode: 60, Grant: 2592000 },
    findAccount: async (_ctx: unknown, id: string) => ({
      accountId: id,
      claims: async () => ({ sub: id }),
    }),
    interactions: {
      /**
       * Where the browser goes, and where this interaction becomes a row the
       * Admin can decide from.
       *
       * The target is the LANDING page, which lives outside `/admin`: on this
       * navigation the browser withholds the Owner's `SameSite=Strict`
       * session, so anything inside the admin shell would bounce a signed-in
       * Owner to a login they do not need. The landing authenticates nobody
       * and offers one same-origin step, which is the navigation the cookie
       * does survive.
       *
       * The row written here carries ONLY what this provider will enforce.
       * There is deliberately no field for who is consenting: this service
       * never authenticates a human, and it holds no privilege on the decision
       * columns, so it could not record one even if it tried.
       */
      url: async (_ctx: unknown, interaction: ProviderInteraction) => {
        const requested = (interaction.params.scope ?? "")
          .split(" ")
          .filter((scope) => scope.length > 0);
        await consents.open({
          interactionUid: interaction.uid,
          oauthClientId: interaction.params.client_id ?? "",
          resource: interaction.params.resource ?? config.resource,
          // Recorded as ASKED FOR, not as narrowed. The Admin refuses a
          // management request rather than quietly handing back a read-only
          // token the client never asked for.
          capabilityScopes: requested.filter((scope) =>
            scope.startsWith("artvenn:"),
          ),
          protocolScopes: requested.filter(
            (scope) => scope === "offline_access",
          ),
          preset: "read-only",
          expiresAt: new Date(Date.now() + INTERACTION_TTL_MS).toISOString(),
        });
        return `${config.consentBaseUrl}/agent-connections/consent/${encodeURIComponent(interaction.uid)}`;
      },
    },
  });

  return { provider, connections, wrappers, consents, config };
};
