import { ExecutionFenceLostError } from "@moya/api";

import type { ExecutionFence } from "@moya/api";

/**
 * The one statement that decides whether a mutation may still happen.
 *
 * It is a `SELECT ... FOR UPDATE` rather than a plain read because it has two
 * jobs: it answers "is this attempt still the one with the right to execute",
 * and it holds the operation row until the mutation's transaction ends, so a
 * cancellation or a take-over arriving mid-flight waits for the answer instead
 * of racing it. `claimExecution` and `cancelOperation` are single UPDATEs on
 * this same row, so both block on it.
 *
 * Lock order, one order everywhere: the content-operator advisory lock (when
 * the mutation takes one) is acquired BEFORE this row, and subject rows after
 * it. Nothing in the repository holds this row while waiting for the advisory
 * lock, so the order cannot invert.
 */
export const executionFenceSql = `
  SELECT 1 FROM community.agent_operations
   WHERE id = $1
     AND lease_owner = $2
     AND lease_expires_at > now()
     AND state = 'executing'
     AND cancel_requested_at IS NULL
   FOR UPDATE
`;

/**
 * Throws unless the fence still holds, which aborts the caller's transaction
 * and leaves no effect. Absence of the row is the only signal needed: a
 * cancelled, taken over, expired or finished operation all fail the same way.
 */
export const assertExecutionFence = async (
  rows: (
    sql: string,
    values: readonly unknown[],
  ) => Promise<{ length: number }>,
  fence: ExecutionFence,
): Promise<void> => {
  // `now()`, not the caller's clock: an executor that stalled would otherwise
  // present a stale reading of its own lease and be judged more leniently the
  // longer it was gone.
  const held = await rows(executionFenceSql, [
    fence.operationId,
    fence.leaseOwner,
  ]);
  if (held.length === 0) throw new ExecutionFenceLostError();
};
