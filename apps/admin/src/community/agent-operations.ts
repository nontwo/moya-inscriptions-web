import { z } from "zod";
import {
  agentDelegationCreateSchema,
  agentDelegationPageSchema,
  agentDelegationQuerySchema,
  agentDelegationRevokeSchema,
  agentDelegationSchema,
  agentOperationCommandSchema,
  agentOperationDetailSchema,
  agentOperationPageSchema,
  agentOperationQuerySchema,
  agentOperationReadSchema,
  agentOperationSchema,
  agentPrincipalMutationSchema,
  agentPrincipalPageSchema,
  agentPrincipalRevokeSchema,
  agentPrincipalSchema,
} from "@moya/contracts/internal/community-operator";

import { CommunityOperatorError } from "./backend";

import type { OperatorCall, CommunityOperation } from "./endpoints";

/**
 * The Owner's side of Agent Administration V1 (Issue #141 r3, Phase B):
 * the principal registry, bounded delegations, and approval, cancellation
 * or execution of a prepared operation. Owner-only and Development-only like
 * every phase 4 operation; the Backend answers every call with the shared
 * business rules the MCP tools use, so the Admin and an agent never disagree.
 */
const parse = <Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.infer<Schema> => {
  const result = schema.safeParse(input);
  if (!result.success) throw new CommunityOperatorError("COMMAND_INVALID", 400);
  return result.data;
};

const checked = <Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.infer<Schema> => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new CommunityOperatorError("OPERATOR_RESPONSE_INVALID", 502);
  return result.data;
};

const query = (
  values: Readonly<Record<string, string | number | boolean | undefined>>,
): string => {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(values))
    if (value !== undefined) search.set(name, String(value));
  return search.size === 0 ? "" : `?${search.toString()}`;
};

const segment = (id: string): string => encodeURIComponent(id);

export const agentAdminOperationNames = [
  "agent-principals-read",
  "agent-principal-write",
  "agent-principal-revoke",
  "agent-delegations-read",
  "agent-delegation-create",
  "agent-delegation-revoke",
  "agent-operations-read",
  "agent-operation-read",
  "agent-operation-approve",
  "agent-operation-cancel",
  "agent-operation-execute",
] as const;

export const agentAdminOperations = (
  call: OperatorCall,
): Readonly<
  Record<(typeof agentAdminOperationNames)[number], CommunityOperation>
> => ({
  "agent-principals-read": async (_req, input) => {
    parse(z.strictObject({}), input ?? {});
    return checked(
      agentPrincipalPageSchema,
      await call("GET", "agent/principals"),
    );
  },
  "agent-principal-write": async (_req, input) =>
    checked(
      agentPrincipalSchema,
      await call(
        "PUT",
        "agent/principals",
        parse(agentPrincipalMutationSchema, input),
      ),
    ),
  "agent-principal-revoke": async (_req, input) =>
    checked(
      agentPrincipalSchema,
      await call(
        "POST",
        "agent/principals/revoke",
        parse(agentPrincipalRevokeSchema, input),
      ),
    ),
  "agent-delegations-read": async (_req, input) => {
    const parsed = parse(agentDelegationQuerySchema, input ?? {});
    return checked(
      agentDelegationPageSchema,
      await call(
        "GET",
        `agent/delegations${query({
          principal: parsed.principal,
          includeInactive: parsed.includeInactive ? true : undefined,
        })}`,
      ),
    );
  },
  "agent-delegation-create": async (_req, input) =>
    checked(
      agentDelegationSchema,
      await call(
        "POST",
        "agent/delegations",
        parse(agentDelegationCreateSchema, input),
      ),
    ),
  "agent-delegation-revoke": async (_req, input) => {
    const { id, requestId } = parse(agentDelegationRevokeSchema, input);
    return checked(
      agentDelegationSchema,
      await call("POST", `agent/delegations/${segment(id)}/revoke`, {
        requestId,
      }),
    );
  },
  "agent-operations-read": async (_req, input) => {
    const parsed = parse(agentOperationQuerySchema, input ?? {});
    return checked(
      agentOperationPageSchema,
      await call(
        "GET",
        `agent/operations${query({
          state: parsed.state,
          principal: parsed.principal,
          page: parsed.page,
          pageSize: parsed.pageSize,
        })}`,
      ),
    );
  },
  "agent-operation-read": async (_req, input) => {
    const { operationId } = parse(agentOperationReadSchema, input);
    return checked(
      agentOperationDetailSchema,
      await call("GET", `agent/operations/${segment(operationId)}`),
    );
  },
  "agent-operation-approve": async (_req, input) => {
    const { operationId, requestId } = parse(
      agentOperationCommandSchema,
      input,
    );
    return checked(
      agentOperationSchema,
      await call("POST", `agent/operations/${segment(operationId)}/approve`, {
        requestId,
      }),
    );
  },
  "agent-operation-cancel": async (_req, input) => {
    const { operationId, requestId } = parse(
      agentOperationCommandSchema,
      input,
    );
    return checked(
      agentOperationSchema,
      await call("POST", `agent/operations/${segment(operationId)}/cancel`, {
        requestId,
      }),
    );
  },
  "agent-operation-execute": async (_req, input) => {
    const { operationId, requestId } = parse(
      agentOperationCommandSchema,
      input,
    );
    return checked(
      agentOperationDetailSchema,
      await call("POST", `agent/operations/${segment(operationId)}/execute`, {
        requestId,
      }),
    );
  },
});
