import {
  createBackendApplication,
  createBackendServer,
  createDevelopmentCatalogFixtureQueryPort,
  startServer,
  stopServer,
} from "@moya/backend-runtime";
import {
  apiErrorSchema,
  developmentSessionSchema,
  publicUserProfileSchema,
} from "@moya/contracts/schemas";
import { UnconfiguredStorageUrlResolver } from "@moya/image";
import { afterEach, describe, expect, it } from "vitest";

import {
  fixtureUsers,
  InMemoryCommunityIdentityPort,
} from "./community-identity-fixture.js";

import type { NodeEnvironment } from "@moya/backend-runtime";
import type { ApiErrorCode } from "@moya/contracts";
import type { Server } from "node:http";

const servers = new Set<Server>();

const startCommunityServer = async (
  nodeEnv: NodeEnvironment,
  port = new InMemoryCommunityIdentityPort(),
) => {
  const server = createBackendServer(
    createBackendApplication({
      nodeEnv,
      communityIdentityPort: port,
      ...(nodeEnv === "production"
        ? {
            catalogQueryPort: createDevelopmentCatalogFixtureQueryPort(),
            storageUrlResolver: new UnconfiguredStorageUrlResolver(),
          }
        : {}),
    }),
  );
  servers.add(server);
  const address = await startServer(server, { host: "127.0.0.1", port: 0 });
  return { baseUrl: `http://${address.address}:${address.port}`, port };
};

afterEach(async () => {
  await Promise.all(
    [...servers].map(async (server) => {
      await stopServer(server);
      servers.delete(server);
    }),
  );
});

const expectApiError = async (
  response: Response,
  status: number,
  code: ApiErrorCode,
) => {
  expect(response.status).toBe(status);
  const body = apiErrorSchema.parse(await response.json());
  expect(body.error.code).toBe(code);
  return body;
};

const signIn = async (baseUrl: string, handle: string) =>
  fetch(`${baseUrl}/v1/development/sign-in`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ handle }),
  });

describe("Community V1 HTTP surface", () => {
  it("runs the Development session lifecycle end to end", async () => {
    const { baseUrl } = await startCommunityServer("development");

    const signedIn = await signIn(baseUrl, "dev-user-01");
    expect(signedIn.status).toBe(201);
    expect(signedIn.headers.get("cache-control")).toBe("no-store");
    const session = developmentSessionSchema.parse(await signedIn.json());
    expect(session.profile.handle).toBe("dev-user-01");

    const me = await fetch(`${baseUrl}/v1/me`, {
      headers: { authorization: `Bearer ${session.token}` },
    });
    expect(me.status).toBe(200);
    expect(publicUserProfileSchema.parse(await me.json())).toEqual(
      session.profile,
    );

    const signedOut = await fetch(`${baseUrl}/v1/development/sign-out`, {
      method: "POST",
      headers: { authorization: `Bearer ${session.token}` },
    });
    expect(signedOut.status).toBe(204);
    expect(await signedOut.text()).toBe("");

    await expectApiError(
      await fetch(`${baseUrl}/v1/me`, {
        headers: { authorization: `Bearer ${session.token}` },
      }),
      401,
      "UNAUTHENTICATED",
    );
    await expectApiError(
      await fetch(`${baseUrl}/v1/development/sign-out`, {
        method: "POST",
        headers: { authorization: `Bearer ${session.token}` },
      }),
      401,
      "UNAUTHENTICATED",
    );
  });

  it("rejects missing, malformed and foreign credentials on /v1/me", async () => {
    const { baseUrl } = await startCommunityServer("development");
    await expectApiError(
      await fetch(`${baseUrl}/v1/me`),
      401,
      "UNAUTHENTICATED",
    );
    for (const authorization of [
      "Bearer",
      "Bearer short",
      "Basic abc",
      `Bearer ${"A".repeat(43)}`,
      `Bearer ${"A".repeat(43)} extra`,
    ])
      await expectApiError(
        await fetch(`${baseUrl}/v1/me`, { headers: { authorization } }),
        401,
        "UNAUTHENTICATED",
      );
    await expectApiError(
      await fetch(`${baseUrl}/v1/me?debug=1`),
      400,
      "INVALID_QUERY",
    );
    const other = await fetch(`${baseUrl}/v1/me`, { method: "POST" });
    expect(other.status).toBe(405);
    expect(other.headers.get("allow")).toBe("GET");
  });

  it("validates the sign-in request strictly and never echoes internals", async () => {
    const { baseUrl } = await startCommunityServer("development");
    const post = (body: string, contentType = "application/json") =>
      fetch(`${baseUrl}/v1/development/sign-in`, {
        method: "POST",
        headers: { "content-type": contentType },
        body,
      });
    for (const body of [
      "",
      "not json",
      JSON.stringify({}),
      JSON.stringify({ handle: "Dev-User-01" }),
      JSON.stringify({ handle: "dev-user-01", extra: true }),
      JSON.stringify({ handle: `x${"a".repeat(5_000)}` }),
    ])
      await expectApiError(await post(body), 400, "INVALID_QUERY");
    await expectApiError(
      await post(JSON.stringify({ handle: "dev-user-01" }), "text/plain"),
      400,
      "INVALID_QUERY",
    );
    await expectApiError(
      await fetch(`${baseUrl}/v1/development/sign-in?handle=dev-user-01`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ handle: "dev-user-01" }),
      }),
      400,
      "INVALID_QUERY",
    );
    const unknown = await expectApiError(
      await signIn(baseUrl, "nobody-99"),
      404,
      "ITEM_NOT_FOUND",
    );
    expect(JSON.stringify(unknown)).not.toMatch(/sql|pg|stack/iu);
    await expectApiError(
      await signIn(baseUrl, fixtureUsers.ordinary.handle),
      404,
      "ITEM_NOT_FOUND",
    );
    await expectApiError(
      await signIn(baseUrl, fixtureUsers.suspended.handle),
      404,
      "ITEM_NOT_FOUND",
    );
    const wrongMethod = await fetch(`${baseUrl}/v1/development/sign-in`);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
  });

  it("maps store unavailability to 503 without leaking the cause", async () => {
    const { baseUrl, port } = await startCommunityServer("development");
    const session = developmentSessionSchema.parse(
      await (await signIn(baseUrl, "dev-user-01")).json(),
    );
    port.unavailable = true;
    const me = await expectApiError(
      await fetch(`${baseUrl}/v1/me`, {
        headers: { authorization: `Bearer ${session.token}` },
      }),
      503,
      "SERVICE_UNAVAILABLE",
    );
    expect(JSON.stringify(me)).not.toContain("Community store");
    await expectApiError(
      await signIn(baseUrl, "dev-user-01"),
      503,
      "SERVICE_UNAVAILABLE",
    );
  });

  it.each(["test", "production"] as const)(
    "composes no Development entry under NODE_ENV=%s while /v1/me stays available",
    async (nodeEnv) => {
      const { baseUrl } = await startCommunityServer(nodeEnv);
      for (const route of ["sign-in", "sign-out"]) {
        const response = await fetch(`${baseUrl}/v1/development/${route}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ handle: "dev-user-01" }),
        });
        expect(response.status).toBe(404);
      }
      await expectApiError(
        await fetch(`${baseUrl}/v1/me`),
        401,
        "UNAUTHENTICATED",
      );
    },
  );

  it.each(["development", "production"] as const)(
    "treats every credential as unauthenticated and composes no entry without a session service (%s)",
    async (nodeEnv) => {
      const server = createBackendServer(
        createBackendApplication({
          nodeEnv,
          ...(nodeEnv === "production"
            ? {
                catalogQueryPort: createDevelopmentCatalogFixtureQueryPort(),
                storageUrlResolver: new UnconfiguredStorageUrlResolver(),
              }
            : {}),
        }),
      );
      servers.add(server);
      const address = await startServer(server, {
        host: "127.0.0.1",
        port: 0,
      });
      const baseUrl = `http://${address.address}:${address.port}`;
      await expectApiError(
        await fetch(`${baseUrl}/v1/me`, {
          headers: { authorization: `Bearer ${"A".repeat(43)}` },
        }),
        401,
        "UNAUTHENTICATED",
      );
      expect(
        (
          await fetch(`${baseUrl}/v1/development/sign-in`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ handle: "dev-user-01" }),
          })
        ).status,
      ).toBe(404);
    },
  );
});
