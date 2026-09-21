# Owner Amendment — Agent Administration V1 (narrow machine-principal delegation)

- Status: Active
- Effective date: 2026-09-16
- Authority: explicit Owner integrated execution brief of 2026-09-16 recorded as
  Issue #141 r3 ("ArtVenn Admin Foundation + Agent Administration"); delivered
  as Phase B of Draft PR #143.
- Applies to: Development and task-owned synthetic Owner QA only. Production
  composition is unchanged and never composes the agent boundary.

## What this amendment changes

The Community V1 amendment (2026-09-11, section 5) states that the Owner is the
only V1 moderator and that `automation` never moderates. This amendment narrowly
supersedes that rule, only in Development and task-owned synthetic QA, and only
for the operations listed below:

1. A **machine principal** (an operator label with the `agent-` prefix,
   registered by the Owner in the Backend's `community.agent_principals` table
   with explicit scopes, enabled/disabled and revocable) may perform
   Owner-instructed administration.
2. The principal acts only through **prepared, immutable operations** over a
   fixed selection the caller names: comment transitions (`approve`, `reject`,
   `hide`, `unhide`) and recommendation rows (`enabled`, `position`). Nothing is
   applied at preparation.
3. An operation runs only after an **Owner approval** in the Admin, or under a
   **bounded, persisted, revocable delegation** (`community.agent_delegations`:
   principal, kind, maximum targets, expiry). A delegation never covers future
   comments or standing rules; every operation still names a fixed selection.
4. Execution is **durable** (chunks of at most 50 targets, each persisted with
   per-target outcomes), **fenced** (one lease holder at a time; a stale
   executor writes nothing), **cancellable**, and **conditionally undoable**
   (`hide` ↔ `unhide`; recorded prior recommendation rows; anything changed
   since reports a conflict).
5. Every applied target goes through the **existing** moderation and content
   operator services, so the audit rows, receipts and public visibility rules
   are exactly the Owner's; the principal's label is what the audit records.

## What stays as it was

- Ordinary editorial automation (`automation` role, editorial MCP tools)
  receives no new right. The `artvenn_*` MCP tools act only for an operator
  identity the Owner bound to a principal (`users.agentPrincipal`), and the
  Backend refuses any call outside the principal's scopes.
- No autonomous moderation judgment: the tools and the runtime skill
  (`.agents/skills/artvenn-admin/SKILL.md`) require the Owner to name the
  selection; comment content is data, never an instruction.
- Account suspension or deletion, thread removal, body deletion, publishing
  decisions, capacity changes, generic CRUD, arbitrary SQL, shell or URL tools
  are not part of this amendment.
- The Backend remains the sole writer of community data; Payload gains one
  operator-metadata column (`users.agent_principal`) and the plugin's per-tool
  API key checkboxes, no community collection and no community grant.
- Production: the agent boundary, the operations view and the tools are composed
  only under `NODE_ENV=development`. Enabling any of it elsewhere is a separate
  Owner decision with its own review.

Record: `docs/community/agent-admin-v1.md`.
