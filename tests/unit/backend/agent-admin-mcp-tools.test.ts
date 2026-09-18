import {
  agentAdminToolNames,
  agentAdminTools,
  agentPrincipalOf,
} from "admin/agent-admin-mcp";
import { CommunityOperatorError } from "admin/community-endpoints";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { OperatorCall } from "admin/community-endpoints";
import type { PayloadRequest } from "payload";

/**
 * The MCP adapter for Agent Administration V1: it identifies the bound
 * principal, forwards validated arguments over the loopback operator call
 * with the principal header, and returns bare codes. It never decides.
 */
const request = (user: unknown): PayloadRequest =>
  ({ user }) as unknown as PayloadRequest;

const recorder = (answer: unknown = { ok: true }) => {
  const calls: {
    principal: string;
    method: string;
    path: string;
    body?: unknown;
  }[] = [];
  const callFor = (principal: string): OperatorCall =>
    (async (method: string, path: string, body?: unknown) => {
      calls.push({
        principal,
        method,
        path,
        ...(body === undefined ? {} : { body }),
      });
      return answer;
    }) as unknown as OperatorCall;
  return { callFor, calls };
};

const toolNamed = (
  name: string,
  callFor: (principal: string) => OperatorCall,
) => {
  const tool = agentAdminTools(callFor).find(
    (candidate) => candidate.name === name,
  );
  if (tool === undefined) throw new Error(`no tool ${name}`);
  return tool;
};

type Tool = ReturnType<typeof agentAdminTools>[number];
const run = (tool: Tool, args: Record<string, unknown>, req: PayloadRequest) =>
  tool.handler(args, req, undefined);

const reply = async (result: unknown) =>
  JSON.parse((result as { content: { text: string }[] }).content[0]!.text) as {
    ok: boolean;
    code?: string;
    result?: unknown;
  };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Agent administration MCP tools", () => {
  it("exposes exactly the ten V1 tools", () => {
    expect(
      agentAdminTools(recorder().callFor).map((tool) => tool.name),
    ).toEqual([...agentAdminToolNames]);
  });

  it("acts only for an operator identity bound to a principal, and only in Development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { callFor, calls } = recorder();
    const tool = toolNamed("artvenn_operations_get", callFor);
    const args = { operationId: "10000000-0000-4000-8000-000000000001" };
    expect(await reply(await run(tool, args, request(null)))).toEqual({
      ok: false,
      code: "UNAUTHORIZED",
    });
    expect(
      await reply(
        await run(
          tool,
          args,
          request({ collection: "users", id: 1, role: "automation" }),
        ),
      ),
    ).toEqual({ ok: false, code: "AGENT_PRINCIPAL_REQUIRED" });
    expect(
      await reply(
        await run(
          tool,
          args,
          request({
            collection: "users",
            id: 1,
            role: "automation",
            agentPrincipal: "owner",
          }),
        ),
      ),
    ).toEqual({ ok: false, code: "AGENT_PRINCIPAL_REQUIRED" });
    expect(calls).toHaveLength(0);
    const bound = request({
      collection: "users",
      id: 1,
      role: "automation",
      agentPrincipal: "agent-reviewer",
    });
    expect(await reply(await run(tool, args, bound))).toEqual({
      ok: true,
      result: { ok: true },
    });
    expect(calls).toEqual([
      {
        principal: "agent-reviewer",
        method: "GET",
        path: `agent/operations/${args.operationId}`,
      },
    ]);
    vi.stubEnv("NODE_ENV", "production");
    expect(await reply(await run(tool, args, bound))).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(calls).toHaveLength(1);
    expect(() =>
      agentPrincipalOf(request({ collection: "payload-mcp-api-keys" })),
    ).toThrow("UNAUTHORIZED");
  });

  it("forwards each tool's validated arguments onto the agent routes with the principal", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { callFor, calls } = recorder();
    const bound = request({
      collection: "users",
      id: 2,
      role: "owner",
      agentPrincipal: "agent-curator",
    });
    const comment = "comment-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01";
    const work = "work-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01";
    const requestId = "10000000-0000-4000-8000-000000000002";
    const operationId = "10000000-0000-4000-8000-000000000003";
    await run(
      toolNamed("artvenn_users_find", callFor),
      { search: "墨客", page: 1, pageSize: 20 },
      bound,
    );
    await run(
      toolNamed("artvenn_content_search", callFor),
      {
        authorId: "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01",
        page: 2,
        pageSize: 10,
      },
      bound,
    );
    await run(
      toolNamed("artvenn_comments_query", callFor),
      { moderation: "pending", catalogId: "catalog-01", page: 1, pageSize: 50 },
      bound,
    );
    await run(
      toolNamed("artvenn_comments_read", callFor),
      { id: comment },
      bound,
    );
    await run(
      toolNamed("artvenn_comments_prepare", callFor),
      { requestId, action: "hide", ids: [comment] },
      bound,
    );
    await run(
      toolNamed("artvenn_featured_prepare", callFor),
      {
        requestId,
        items: [
          { target: { type: "work", id: work }, enabled: true, position: 0 },
        ],
      },
      bound,
    );
    await run(
      toolNamed("artvenn_operations_execute", callFor),
      { requestId, operationId },
      bound,
    );
    await run(
      toolNamed("artvenn_operations_cancel", callFor),
      { requestId, operationId },
      bound,
    );
    await run(
      toolNamed("artvenn_operations_prepare_undo", callFor),
      { requestId, operationId },
      bound,
    );
    expect(calls.every((call) => call.principal === "agent-curator")).toBe(
      true,
    );
    expect(
      calls.map(({ method, path, body }) => ({
        method,
        path,
        ...(body === undefined ? {} : { body }),
      })),
    ).toEqual([
      {
        method: "GET",
        path: "agent/users?search=%E5%A2%A8%E5%AE%A2&page=1&pageSize=20",
      },
      {
        method: "GET",
        path: "agent/content?authorId=user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01&page=2&pageSize=10",
      },
      {
        method: "GET",
        path: "agent/comments?moderation=pending&catalogId=catalog-01&page=1&pageSize=50",
      },
      { method: "GET", path: `agent/comments/${comment}` },
      {
        method: "POST",
        path: "agent/operations/prepare-comments",
        body: { requestId, action: "hide", ids: [comment] },
      },
      {
        method: "POST",
        path: "agent/operations/prepare-featured",
        body: {
          requestId,
          items: [
            { target: { type: "work", id: work }, enabled: true, position: 0 },
          ],
        },
      },
      {
        method: "POST",
        path: `agent/operations/${operationId}/execute`,
        body: { requestId },
      },
      {
        method: "POST",
        path: `agent/operations/${operationId}/cancel`,
        body: { requestId },
      },
      {
        method: "POST",
        path: `agent/operations/${operationId}/prepare-undo`,
        body: { requestId },
      },
    ]);
  });

  it("returns the boundary's bare codes and never a message, URL or stack", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const bound = request({
      collection: "users",
      id: 3,
      role: "automation",
      agentPrincipal: "agent-reviewer",
    });
    const forbidden = (async () => {
      throw new CommunityOperatorError("AGENT_FORBIDDEN", 403);
    }) as unknown as OperatorCall;
    expect(
      await reply(
        await run(
          toolNamed("artvenn_comments_query", () => forbidden),
          { page: 1, pageSize: 20 },
          bound,
        ),
      ),
    ).toEqual({ ok: false, code: "AGENT_FORBIDDEN" });
    const crashed = (async () => {
      throw new Error("ECONNREFUSED http://127.0.0.1:3001/secret?token=abc");
    }) as unknown as OperatorCall;
    expect(
      await reply(
        await run(
          toolNamed("artvenn_comments_query", () => crashed),
          { page: 1, pageSize: 20 },
          bound,
        ),
      ),
    ).toEqual({ ok: false, code: "AGENT_OPERATION_REJECTED" });
  });
});
