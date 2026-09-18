import {
  createBackendApplication,
  createBackendServer,
  startServer,
  stopServer,
} from "@moya/backend-runtime";
import { afterEach, describe, expect, it } from "vitest";

import { InMemoryCommunityCommentPort } from "./community-comment-fixture.js";
import { InMemoryCommunityIdentityPort } from "./community-identity-fixture.js";

import type {
  AgentAdministrationPort,
  AuthorCommunityPort,
  CatalogPublicationPort,
} from "@moya/api";
import type { Server } from "node:http";

/**
 * The agent boundary over real HTTP. Nothing drove these routes before, and
 * `GET agent/users` shipped for a revision refusing every request the MCP tool
 * actually makes: the tool always sends `page` and `pageSize`, a query string
 * carries them as text, and the lookup command took only numbers. The service
 * tests pass already-typed objects, so they cannot see it; only the wire can.
 */
const credential = "synthetic-operator-credential-for-unit-tests";
const principal = {
  label: "agent-reviewer",
  displayName: "Reviewer",
  scopes: ["users:read"],
  enabled: true,
  revokedAt: null,
  version: 1,
  createdAt: new Date("2026-09-17T00:00:00.000Z"),
  updatedAt: new Date("2026-09-17T00:00:00.000Z"),
};
const resolved = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  resolution: {
    status: "none" as const,
    uniqueIdentity: false,
    matchKind: null,
    userId: null,
    ambiguous: false,
  },
};

const servers = new Set<Server>();
afterEach(async () => {
  for (const server of servers) await stopServer(server);
  servers.clear();
});

const boundary = async (seen: unknown[]) => {
  const port = {
    findPrincipal: async (label: string) =>
      label === principal.label ? principal : null,
    resolveUsers: async (query: unknown) => {
      seen.push(query);
      return resolved;
    },
  } as unknown as AgentAdministrationPort;
  const server = createBackendServer(
    createBackendApplication({
      nodeEnv: "development",
      communityIdentityPort: new InMemoryCommunityIdentityPort(),
      communityCommentPort: new InMemoryCommunityCommentPort(),
      catalogPublicationPort: {
        isPublished: async () => true,
        readTitle: async () => null,
      } as unknown as CatalogPublicationPort,
      communityOperatorCredential: credential,
      authorCommunityPort: {} as AuthorCommunityPort,
      agentAdministrationPort: port,
    }),
  );
  servers.add(server);
  const address = await startServer(server, { host: "127.0.0.1", port: 0 });
  return `http://${address.address}:${address.port}/internal/community/agent`;
};

const ask = (origin: string, query: string) =>
  fetch(`${origin}/users${query}`, {
    headers: {
      authorization: `Bearer ${credential}`,
      "x-agent-principal": principal.label,
      accept: "application/json",
    },
  });

describe("agent boundary over HTTP", () => {
  it("answers a paged user lookup, the shape the MCP tool always sends", async () => {
    const seen: unknown[] = [];
    const origin = await boundary(seen);
    const answer = await ask(origin, "?handle=someone&page=1&pageSize=20");
    expect(answer.status).toBe(200);
    expect(await answer.json()).toMatchObject({ total: 0 });
    // The command converts the textual paging; nothing else is invented.
    expect(seen[0]).toMatchObject({ handle: "someone", page: 1, pageSize: 20 });
  });

  it("still refuses a malformed page, a repeated key and an unknown parameter", async () => {
    const seen: unknown[] = [];
    const origin = await boundary(seen);
    for (const query of [
      "?handle=someone&page=abc",
      "?handle=someone&page=0",
      "?handle=someone&page=1&page=2",
      "?handle=someone&pageSize=51",
      "?userid=someone",
    ]) {
      const answer = await ask(origin, query);
      expect(answer.status).toBe(400);
      expect(await answer.json()).toMatchObject({
        error: { status: 400, code: "INVALID_COMMAND" },
      });
    }
    expect(seen).toHaveLength(0);
  });

  it("refuses a principal without the scope, whatever the paging says", async () => {
    const seen: unknown[] = [];
    const origin = await boundary(seen);
    const answer = await fetch(`${origin}/users?handle=someone&page=1`, {
      headers: {
        authorization: `Bearer ${credential}`,
        "x-agent-principal": "agent-stranger",
      },
    });
    expect(answer.status).toBe(403);
    expect(seen).toHaveLength(0);
  });
});
