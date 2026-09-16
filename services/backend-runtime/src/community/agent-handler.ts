import {
  isAgentForbiddenError,
  isAgentManifestError,
  isCommunityConflictError,
  isCommunityInputError,
  isCommunityNotFoundError,
  isCommunityStoreUnavailableError,
} from "@moya/api";

import { JsonBodyError, readJsonBody } from "../http/json-body.js";
import { sendJson } from "../http/json-response.js";
import { collectTransportQuery } from "../http/transport-query.js";

import type { AgentAdministrationService } from "@moya/api";
import type { IncomingMessage, ServerResponse } from "node:http";

/**
 * The agent administration boundary, mounted under the operator credential
 * (Issue #141 r3, Phase B). Two callers share it:
 *
 * - a machine principal, asserted by the Admin's MCP adapter through the
 *   `x-agent-principal` header (scopes are checked here, per call, against
 *   the Backend's own principal registry);
 * - the Owner's operations view, with no principal header, for the registry,
 *   delegations, approvals and cancellations.
 *
 * Routes (principal mode):
 *   GET  agent/users?…                         users:read
 *   GET  agent/content?…                       content:read
 *   GET  agent/comments?…                      comments:read
 *   GET  agent/comments/{id}                   comments:read
 *   POST agent/operations/prepare-comments     comments:moderate
 *   POST agent/operations/prepare-featured     featured:write
 *   POST agent/operations/{id}/execute         operations:execute
 *   GET  agent/operations/{id}                 operations:execute
 *   POST agent/operations/{id}/cancel          operations:execute
 *   POST agent/operations/{id}/prepare-undo    operations:undo
 * Routes (Owner mode):
 *   GET  agent/principals · PUT agent/principals · POST agent/principals/revoke
 *   GET  agent/delegations?… · POST agent/delegations · POST agent/delegations/{id}/revoke
 *   GET  agent/operations?… · GET agent/operations/{id}
 *   POST agent/operations/{id}/approve · /cancel · /execute
 */
const prefix = "/internal/community/agent/";
const principalHeader = "x-agent-principal";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

const sendError = (
  response: ServerResponse,
  status: 400 | 403 | 404 | 405 | 409 | 422 | 500 | 503,
  code: string,
): void => sendJson(response, status, { error: { status, code } });

const sendFailure = (response: ServerResponse, error: unknown): void => {
  if (error instanceof JsonBodyError)
    sendError(response, 400, "INVALID_COMMAND");
  // A manifest refusal carries its own code: an exceeded cap, a planning
  // timeout, zero matches or an unresolved author are all explicit and final,
  // never a silently truncated or empty selection.
  else if (isAgentManifestError(error)) sendError(response, 422, error.code);
  else if (isAgentForbiddenError(error))
    sendError(response, 403, "AGENT_FORBIDDEN");
  else if (isCommunityNotFoundError(error))
    sendError(response, 404, "NOT_FOUND");
  else if (isCommunityConflictError(error))
    sendError(response, 409, "STATE_CONFLICT");
  else if (isCommunityInputError(error))
    sendError(response, 400, "INVALID_COMMAND");
  else if (isCommunityStoreUnavailableError(error))
    sendError(response, 503, "STORE_UNAVAILABLE");
  else sendError(response, 500, "INTERNAL_ERROR");
};

const principalOf = (request: IncomingMessage): string | null => {
  const header = request.headers[principalHeader];
  return typeof header === "string" && header !== "" ? header : null;
};

const queryOf = (request: IncomingMessage) =>
  collectTransportQuery(
    new URL(request.url ?? "/", "http://request.invalid").searchParams,
  );

const numeric = (value: unknown): number | undefined =>
  typeof value === "string" && /^\d{1,6}$/u.test(value)
    ? Number(value)
    : undefined;

const boolean = (value: unknown): boolean | undefined =>
  value === "true" ? true : value === "false" ? false : undefined;

const defined = (
  entries: readonly (readonly [string, unknown])[],
): Record<string, unknown> =>
  Object.fromEntries(entries.filter((entry) => entry[1] !== undefined));

/** True when the path belonged to this boundary (handled, whatever the answer). */
export const handleAgentRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  service: AgentAdministrationService,
): Promise<boolean> => {
  if (!pathname.startsWith(prefix)) return false;
  const route = pathname.slice(prefix.length);
  const method = request.method ?? "GET";
  const principal = principalOf(request);
  const body = () => readJsonBody(request, 100_000);
  try {
    if (principal !== null) {
      if (route === "users" && method === "GET") {
        sendJson(
          response,
          200,
          await service.usersFind(principal, queryOf(request)),
        );
        return true;
      }
      if (route === "content" && method === "GET") {
        sendJson(
          response,
          200,
          await service.contentSearch(principal, queryOf(request)),
        );
        return true;
      }
      if (route === "comments" && method === "GET") {
        const query = queryOf(request);
        sendJson(
          response,
          200,
          await service.commentsQuery(principal, {
            ...defined([
              ["moderation", query.moderation],
              ["kind", query.kind],
              ["catalogId", query.catalogId],
              ["search", query.search],
              ["order", query.order],
              ["page", numeric(query.page)],
              ["pageSize", numeric(query.pageSize)],
            ]),
          }),
        );
        return true;
      }
      const comment = /^comments\/(comment-[0-9a-f]{32})$/u.exec(route);
      if (comment && method === "GET") {
        sendJson(
          response,
          200,
          await service.commentsRead(principal, comment[1]!),
        );
        return true;
      }
      if (route === "operations/prepare-comments" && method === "POST") {
        sendJson(
          response,
          200,
          await service.prepareComments(principal, await body()),
        );
        return true;
      }
      if (route === "operations/prepare-featured" && method === "POST") {
        sendJson(
          response,
          200,
          await service.prepareFeatured(principal, await body()),
        );
        return true;
      }
      const targets = new RegExp(`^operations/(${uuid})/targets$`, "u").exec(
        route,
      );
      if (targets && method === "GET") {
        const query = queryOf(request);
        sendJson(
          response,
          200,
          await service.getTargets(principal, {
            operationId: targets[1],
            ...defined([
              ["targetsPage", numeric(query.page)],
              ["targetsPageSize", numeric(query.pageSize)],
            ]),
          }),
        );
        return true;
      }
      const operation = new RegExp(
        `^operations/(${uuid})(?:/(execute|cancel|prepare-undo))?$`,
        "u",
      ).exec(route);
      if (operation) {
        const id = operation[1]!;
        const action = operation[2];
        if (action === undefined && method === "GET") {
          sendJson(
            response,
            200,
            await service.get(principal, { operationId: id }),
          );
          return true;
        }
        if (action !== undefined && method === "POST") {
          const command = { ...((await body()) as object), operationId: id };
          sendJson(
            response,
            200,
            action === "execute"
              ? await service.execute(principal, command)
              : action === "cancel"
                ? await service.cancel(principal, command)
                : await service.prepareUndo(principal, command),
          );
          return true;
        }
        sendError(response, 405, "METHOD_NOT_ALLOWED");
        return true;
      }
      sendError(response, 404, "NOT_FOUND");
      return true;
    }

    // Owner mode: the Admin's own session reached the Payload endpoint first.
    if (route === "principals") {
      if (method === "GET") {
        sendJson(response, 200, await service.readPrincipals());
        return true;
      }
      if (method === "PUT") {
        sendJson(response, 200, await service.writePrincipal(await body()));
        return true;
      }
      sendError(response, 405, "METHOD_NOT_ALLOWED");
      return true;
    }
    if (route === "principals/revoke" && method === "POST") {
      sendJson(response, 200, await service.revokePrincipal(await body()));
      return true;
    }
    if (route === "delegations") {
      if (method === "GET") {
        const query = queryOf(request);
        sendJson(
          response,
          200,
          await service.readDelegations(
            defined([
              ["principal", query.principal],
              ["includeInactive", boolean(query.includeInactive)],
            ]),
          ),
        );
        return true;
      }
      if (method === "POST") {
        sendJson(response, 200, await service.createDelegation(await body()));
        return true;
      }
      sendError(response, 405, "METHOD_NOT_ALLOWED");
      return true;
    }
    const revoke = new RegExp(`^delegations/(${uuid})/revoke$`, "u").exec(
      route,
    );
    if (revoke && method === "POST") {
      sendJson(
        response,
        200,
        await service.revokeDelegation({
          ...((await body()) as object),
          id: revoke[1],
        }),
      );
      return true;
    }
    if (route === "operations" && method === "GET") {
      const query = queryOf(request);
      sendJson(
        response,
        200,
        await service.readOperations(
          defined([
            ["state", query.state],
            ["principal", query.principal],
            ["page", numeric(query.page)],
            ["pageSize", numeric(query.pageSize)],
          ]),
        ),
      );
      return true;
    }
    const ownerTargets = new RegExp(`^operations/(${uuid})/targets$`, "u").exec(
      route,
    );
    if (ownerTargets && method === "GET") {
      const query = queryOf(request);
      sendJson(
        response,
        200,
        await service.readOperationTargets({
          operationId: ownerTargets[1],
          ...defined([
            ["targetsPage", numeric(query.page)],
            ["targetsPageSize", numeric(query.pageSize)],
          ]),
        }),
      );
      return true;
    }
    const operation = new RegExp(
      `^operations/(${uuid})(?:/(approve|cancel|execute))?$`,
      "u",
    ).exec(route);
    if (operation) {
      const id = operation[1]!;
      const action = operation[2];
      if (action === undefined && method === "GET") {
        sendJson(
          response,
          200,
          await service.readOperation({ operationId: id }),
        );
        return true;
      }
      if (action !== undefined && method === "POST") {
        const command = { ...((await body()) as object), operationId: id };
        sendJson(
          response,
          200,
          action === "approve"
            ? await service.approve(command)
            : action === "cancel"
              ? await service.cancelAsOwner(command)
              : await service.executeAsOwner(command),
        );
        return true;
      }
      sendError(response, 405, "METHOD_NOT_ALLOWED");
      return true;
    }
    sendError(response, 404, "NOT_FOUND");
    return true;
  } catch (error) {
    sendFailure(response, error);
    return true;
  }
};
