import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

import { handleAgentRequest } from "@moya/backend-runtime";
import { agentUserLookupQuerySchema } from "@moya/contracts/internal/community-operator";
import { describe, expect, it } from "vitest";

import type { AgentAdministrationService } from "@moya/api";

/**
 * The agent boundary's own HTTP seam. Nothing reached `handleAgentRequest`
 * before, and `GET agent/users` shipped for a whole revision refusing every
 * request the MCP tool actually makes: the tool always sends `page` and
 * `pageSize`, they arrive as text, and the lookup command took only numbers.
 * These cases run the route the way the wire runs it.
 */
const call = async (
  url: string,
  service: Partial<AgentAdministrationService>,
  headers: Record<string, string> = { "x-agent-principal": "agent-reviewer" },
) => {
  const request = new IncomingMessage(new Socket());
  request.url = url;
  request.method = "GET";
  Object.assign(request.headers, headers);
  const response = new ServerResponse(request);
  const chunks: Buffer[] = [];
  response.write = ((chunk: Buffer | string) => {
    chunks.push(Buffer.from(chunk));
    return true;
  }) as ServerResponse["write"];
  response.end = ((chunk?: Buffer | string) => {
    if (chunk !== undefined) chunks.push(Buffer.from(chunk));
    return response;
  }) as ServerResponse["end"];
  const handled = await handleAgentRequest(
    request,
    response,
    new URL(url, "http://request.invalid").pathname,
    service as AgentAdministrationService,
  );
  const body = Buffer.concat(chunks).toString("utf8");
  return {
    handled,
    status: response.statusCode,
    body: body === "" ? null : (JSON.parse(body) as Record<string, unknown>),
  };
};

const page = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  resolution: {
    status: "none",
    uniqueIdentity: false,
    matchKind: null,
    userId: null,
    ambiguous: false,
  },
};

describe("agent boundary over HTTP", () => {
  it("answers a paged user lookup, the shape the MCP tool always sends", async () => {
    const seen: unknown[] = [];
    const answer = await call(
      "/internal/community/agent/users?handle=someone&page=1&pageSize=20",
      {
        usersFind: async (_principal: string, query: unknown) => {
          seen.push(query);
          return page as never;
        },
      },
    );
    expect(answer.handled).toBe(true);
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({ total: 0 });
    // The command receives the query as it arrived; the contract converts it.
    expect(seen[0]).toEqual({
      handle: "someone",
      page: "1",
      pageSize: "20",
    });
  });

  it("refuses a malformed page, a repeated key and an unknown parameter", () => {
    // The command still carries the refusals; only the accepted wire form
    // widened. A query string that reaches it unparsed is still rejected.
    expect(
      agentUserLookupQuerySchema.parse({ handle: "someone", page: "2" }),
    ).toMatchObject({ page: 2, pageSize: 20 });
    for (const query of [
      { handle: "someone", page: "abc" },
      { handle: "someone", page: "0" },
      { handle: "someone", page: ["1", "2"] },
      { handle: "someone", pageSize: "51" },
      { userid: "someone" },
    ])
      expect(() => agentUserLookupQuerySchema.parse(query)).toThrow();
  });
});
