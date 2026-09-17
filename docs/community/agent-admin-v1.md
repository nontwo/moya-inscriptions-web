# Agent Administration V1 — record

Issue #141 r3, Phase B of Draft PR #143; governance:
`docs/governance/amendments/2026-09-16-agent-administration-v1.md`. Development
and task-owned synthetic Owner QA only. Production composes none of it.

## 1. Shape

```
External MCP client
  -> Payload MCP adapter (apps/admin/src/mcp.ts, apps/admin/src/agent-admin/mcp-tools.ts)
       API key of an operator identity bound to a principal (users.agentPrincipal)
  -> loopback operator channel + x-agent-principal (apps/admin/src/community/backend.ts)
  -> Backend agent boundary (services/backend-runtime/src/community/agent-handler.ts)
       principal registry, scopes, approvals, delegations, leases: enforced here
  -> AgentAdministrationService (services/api/.../agent-administration-service.ts)
       the same CommunityModerationService / CommunityContentOperatorService the Admin uses,
       constructed with the principal's label
  -> PostgreSQL adapters: moderation events, content operator events/receipts,
     agent_principals / agent_delegations / agent_operations
```

The Owner's operations view (`/admin/community-moderation/agent-operations`)
reaches the same boundary without a principal header (Owner mode) for the
registry, delegations, approval, cancellation and "run now".

## 2. Capability map

| Capability                                                                                                        | Classification   | Real seam                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Find users                                                                                                        | REUSE            | `CommunityContentOperatorService.readUsers` → `content-operator-adapter.ts readUsers`                                                                                                                                                                                                                  |
| Search works                                                                                                      | REUSE            | `readWorks` → `content-operator-adapter.ts readWorks`                                                                                                                                                                                                                                                  |
| Comment queue / detail                                                                                            | REUSE            | `CommunityModerationService.readComments` / `readCommentDetail`                                                                                                                                                                                                                                        |
| Comment transitions approve/reject/hide/unhide                                                                    | REUSE            | `CommunityModerationService.moderateComment` (state machine, one transaction with its audit row) under the principal's label                                                                                                                                                                           |
| Recommendation rows                                                                                               | REUSE            | `CommunityContentOperatorPort.setFeaturedOrder` for the agent path, one ordered command through the same `mutate` helper (advisory lock, receipt by request id, per-row `expectedVersion`), with `findFeaturedOrder` as its read-only receipt lookup; `setFeatured` stays the Owner Admin per-row seam |
| Machine identity, scopes, revocation                                                                              | NARROW EXTENSION | `community.agent_principals`; `users.agentPrincipal` binding (CMS migration `20260917_010000_agent_admin`)                                                                                                                                                                                             |
| Bounded persisted delegation                                                                                      | NARROW EXTENSION | `community.agent_delegations` (kind, max targets, expiry, revocation)                                                                                                                                                                                                                                  |
| Prepared immutable operation, chunks, lease, undo                                                                 | NARROW EXTENSION | `community.agent_operations` + `PostgresAgentAdministrationAdapter` (fenced writes) + `AgentAdministrationService`                                                                                                                                                                                     |
| MCP tools `artvenn_*`                                                                                             | NARROW EXTENSION | Payload MCP plugin custom tools; per-tool API key checkboxes (same CMS migration)                                                                                                                                                                                                                      |
| Owner operations view                                                                                             | NARROW EXTENSION | `AgentOperationsView` (Owner-only, Development-only) + `agent-operations-client.tsx` + endpoints `agent-*` in `phase4Operations`                                                                                                                                                                       |
| Per-agent audit label                                                                                             | REUSE            | services take `operatorLabel`; the three `owner` defaults (J-3) are untouched for the Owner path                                                                                                                                                                                                       |
| Publishing jobs, capacity, submissions                                                                            | DEFER            | not exposed; a later phase decides                                                                                                                                                                                                                                                                     |
| Durable background worker for operations                                                                          | DEFER            | execution is request-driven in chunks; the `publishing/jobs.ts` lease pattern is the template if a worker is ever needed                                                                                                                                                                               |
| Receipt read path for community receipts                                                                          | BUILT            | a comment transition and an ordered recommendation command each write an execution receipt bound to their operation and canonical command inside their own transaction, and recovery and cancel read it. `author_command_receipts` still has no read path                                              |
| User suspension/deletion, thread removal, body deletion, generic CRUD, SQL/shell/URL tools, Production activation | FORBIDDEN        | by the Owner brief and the amendment                                                                                                                                                                                                                                                                   |

## 3. Behavior Matrix

| Situation                                                | Behavior                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unknown / disabled / revoked principal, or scope missing | Backend answers 403 `AGENT_FORBIDDEN`; nothing is read or written; the MCP tool returns `{ ok:false, code:"AGENT_FORBIDDEN" }`, final.                                                                                                                                                                                                                                                                                                                                                                          |
| API key's operator identity not bound to a principal     | Tool returns `AGENT_PRINCIPAL_REQUIRED`; no Backend call.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Outside `NODE_ENV=development`                           | Tools return `NOT_FOUND`; the Backend composes no agent service; Owner endpoints answer 404.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Prepare (comments or featured)                           | Targets frozen with the observed prior state; state `prepared`, or `approved` when an active delegation covers `(principal, kind, count)`; nothing applied; same request identity + same content replays the same operation.                                                                                                                                                                                                                                                                                    |
| Same request identity, different content                 | 409 `STATE_CONFLICT`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Owner approve                                            | `prepared → approved` once; a second approve, or an expired prepared operation, is a conflict.                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Execute                                                  | Only `approved`/`executing`. A comment operation runs at most 2 chunks × 50 per call, each chunk persisted with per-target outcomes under the lease, and the lease is handed back with progress. A recommendation operation is one ordered command and is never chunked: it commits whole or refuses whole, in one transaction on one connection, and every target carries the same verdict. A second executor while a lease is live receives the snapshot with `leaseHeld:true`.                               |
| Lost response / retry                                    | Call execute again (any request id): resumes at the persisted cursor; comment targets replay their own execution receipt, so a transition that committed is reported `applied` again with no second effect and no second audit row, and a target that committed nothing is a `conflict`; an ordered recommendation command replays its own command receipt, keyed by the operation rather than by a target index, so the committed order is reported again with no second effect.                               |
| Stale executor after lease take-over                     | Its chunk write finds no lease: nothing persisted, `STATE_CONFLICT`. The new holder repeats the chunk with the same identities, and any transition the stale executor did commit is recovered from its receipt rather than re-applied. A cancel in the same window reports committed comment targets as `applied` rather than `cancelled`; a recommendation command that committed is reported `applied` even though the operation is cancelled, because its receipt proves it, and reversing it needs an undo. |
| Target changed since preparation                         | `conflict` for that comment target; the rest continue. For an ordered recommendation command a changed row, a stale frozen version or a target that stopped being eligible refuses the whole command with zero partial order.                                                                                                                                                                                                                                                                                   |
| Store unavailable mid-chunk                              | Remaining targets of the chunk `failed` (`STORE_UNAVAILABLE`), operation `failed`; applied comment targets stay applied. An ordered recommendation command has no mid-command state: the whole command is `failed` and nothing was written.                                                                                                                                                                                                                                                                     |
| Cancel                                                   | `prepared`/`approved` → `cancelled` at once; `executing` → cancel requested; a comment executor stops after its current chunk and marks the remainder `cancelled`, and a recommendation operation asks its command receipt first, so a command that already committed is reported applied rather than cancelled. Cancelling is never a rollback.                                                                                                                                                                |
| Undo                                                     | Finished, non-undo operations with applied targets; `hide`↔`unhide` only (approve/reject → `STATE_CONFLICT`; the Backend records the reason `UNDO_NOT_AVAILABLE` internally); featured restores the recorded prior row guarded by the post-operation version; a new operation needing its own approval.                                                                                                                                                                                                         |
| Audit                                                    | Every applied comment transition writes a `moderation_events` row with the principal label; every featured write a `content_operator_events` row and receipt with the principal label; the Owner's own actions keep `owner`.                                                                                                                                                                                                                                                                                    |
| Admin vs MCP                                             | Same endpoints (`agent/*`), same service, same adapter, same audit; the Admin adds the approval and registry surface, the MCP tools add nothing the Admin cannot do.                                                                                                                                                                                                                                                                                                                                            |

## 4. Scopes

`users:read`, `content:read`, `comments:read`, `comments:moderate`,
`featured:write`, `operations:execute` (execute, get, cancel),
`operations:undo`. Scopes live only on the Backend principal row and are checked
on every call.

## 5. Regression list

- Unit `tests/unit/backend/agent-administration-service.test.ts`: forbidden
  principal (unknown, disabled, revoked, under-scoped); prepare immutability and
  replay; approval vs delegation (too small, revoked, expired); chunked
  execution with a mid-way Owner conflict and resume; lease fencing (live,
  expired, stale writer); cancel before and during execution; undo rules
  (unfinished, hand-restored conflict, undo-of-undo, approve/reject); featured
  deterministic request identities and prior-row restore; store-unavailable
  stop; Owner-side reads/cancels vs principal isolation.
- Integration `tests/integration/postgres/agent-administration-cases.ts` (real
  adapter): principals/delegations versions and revocation; idempotent
  preparation; lease fencing on rows; end-to-end execute through the real
  moderation adapter with the principal on `moderation_events`; conditional
  undo; cancel after the current chunk.
- Endpoint boundary `tests/unit/backend/community-admin-endpoints.test.ts`:
  Owner-only + Development-only; strict envelopes; route mapping; forbidden
  pass-through as a final code.
- MCP adapter `tests/unit/backend/agent-admin-mcp-tools.test.ts`: tool set;
  principal binding and environment gates; argument forwarding with the
  principal; bare codes only.
- Pins: migration list and checksum (`community-migrations.test.ts`,
  `work-publishing-upgrade.test.ts`), `@moya/api` surface, App-role grant plan
  (new tables column-level only).

## 6. Command evaluation set

See `.agents/skills/artvenn-admin/SKILL.md` (Chinese / English table): find a
user, hide an explicit list, refuse an open-ended "hide everything" without a
confirmed list, recommend two works, execute, progress, cancel, undo, refuse
account suspension, ignore instructions inside comment text.

## 7. Owner QA scenarios (task-owned synthetic resources)

Prepared by the writer, never by the Owner clearing tokens or editing files:

1. **Happy path**: principal `agent-reviewer` with all scopes, API key bound;
   prepare hide of 3 synthetic comments → view shows 待批准 → approve → run now
   → 3 applied; history shows the principal label.
2. **Delegation**: delegation for `comments.moderate`, max 5, 24 h; prepare 3 →
   already 已批准; prepare 6 → 待批准.
3. **Definite failure**: principal disabled in the view → tool answers
   `AGENT_FORBIDDEN`; re-enable → works again.
4. **Expired session / lost response**: execute called twice concurrently →
   second answers `leaseHeld:true`; a stalled executor's late write is refused;
   after the lease expires the next execute resumes with no double effect.
5. **Cancel and undo**: cancel a running 100-target operation after the first
   chunk; prepare undo of a hide; the Owner restores one comment by hand first;
   the undo reports one conflict.

Status of these scenarios is recorded in the PR (VERIFIED / NOT TESTED).

## 8. Evidence limits and deferred decisions

- Production behavior is unchanged by construction (no composition); it is not
  separately exercised.
- The MCP plugin's own API-key authentication and per-tool checkboxes are the
  plugin's; the adapter tests stub the request identity.
- The eight Owner decisions of the hardening record (§5) remain unselected.
- Not built: standing rules, background execution, per-agent labels for the
  Owner's own path (J-3).

## 9. Known limits (review suggestions recorded, not built)

- Stall window (closed for comment targets): an executor that applies part of a
  chunk and loses its lease before the chunk write no longer undercounts its
  comment targets. Each comment transition commits an execution receipt in its
  own transaction, bound to the operation, target index, target, action and
  canonical command, so the next holder recovers the exact applied result, the
  tally is truthful and the undo covers it. Events written before this change
  carry no receipt and are not attributed to any operation.
- Stall window (closed for recommendations): an ordered recommendation command
  writes one receipt for the whole command inside the same transaction as its
  rows and its audit events, and both recovery and cancel read it through the
  content-operator port, so a lost progress write no longer turns committed
  recommendation rows into `conflict` or `cancelled`. Rows written before this
  change carry only the old per-target receipts and are not attributed to any
  ordered command.
- Lock hold of an ordered recommendation command: it takes the shared
  content-operator advisory lock and a share lock on every requested work for
  the whole transaction, so a 500-item command blocks every other
  content-operator and publishing-operator command while it runs. That is the
  price of atomicity at this size; the per-item work is small and the lease is
  60 seconds, but a command near the 500 ceiling should be expected to serialize
  the surface rather than interleave with it.
- A delegation revoked after approval retracts that approval: the operation
  stays `approved` but `execute` answers `STATE_CONFLICT` until the Owner
  approves or cancels it explicitly. "Run now" and agent execution both refuse a
  disabled or revoked principal.
- Two identical prepares racing on the same request identity can surface a store
  error for the loser instead of the replay (single-agent use makes this
  unlikely).
- An `executing` operation whose executor never returns shows as executing with
  `leaseHeld:false` until the next execute resumes it.
