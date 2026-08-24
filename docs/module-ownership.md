# Module ownership

This file records stable ownership, implementation authority, and decision gates
only. Dynamic task, milestone, and completion status belongs exclusively in
[project status](project-status.md).

The active
[machine-verified review and merge amendment](governance/amendments/2026-08-24-machine-verified-review-and-merge.md)
controls routine Ready, merge, and merged-head operations.

## Path ownership

| Path or responsibility                                                                                                                          | Implementation authority                                                     | Review or decision gate                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Root governance and configuration, including `AGENTS.md`, root `package.json`, workspace, TypeScript, lint, format, and framework configuration | Implementer explicitly authorized by the frozen task scope                    | Independent actual-diff review; Owner decision only for unfrozen governance or major architectural direction    |
| `.github/**`, CI, and deployment configuration                                                                                                  | Explicitly scoped task implementer                                            | Independent review; Owner decision for new production authority or unresolved security/delivery direction       |
| `docs/governance/**`, `docs/architecture.md`, and `docs/adr/**`                                                                                 | Explicitly scoped governance or architecture task implementer                 | Independent review; Owner decision only when the task changes an unfrozen major direction                        |
| `packages/contracts/**` and Public Contract/API boundaries                                                                                      | Explicitly scoped Contract task implementer                                   | Independent review and applicable tests; Owner decision for unapproved domain or Contract expansion              |
| `database/**`, migration numbering, and database schema                                                                                         | Explicitly scoped database task implementer                                   | Independent review and PostgreSQL validation; Owner decision for unapproved schema/data-governance direction     |
| `infra/**` and environment-variable names                                                                                                       | Explicitly scoped infrastructure task implementer                             | Independent review; Owner decision for provider choice, production resources, credentials, cost, or security     |
| `packages/ui/**`, `packages/design-tokens/**`, and shared semantic design assets                                                                | Explicitly scoped design-system task implementer                              | Independent review plus Owner visual/real-device acceptance when user-visible presentation changes               |
| `apps/**`, `services/**`, and other `packages/**` business modules                                                                              | Task implementer for the exact frozen module scope                            | Independent review and applicable validation; Owner only for visual, directional, production, or STOP gates      |
| Other `docs/**`, tests, fixtures, and scripts                                                                                                   | Task implementer for the exact approved supporting scope                      | Independent review and proportionate validation                                                                  |
| Merge of a short-lived task PR into `integration/mvp`                                                                                           | Authorized independent review agent after all applicable gates pass           | No routine Owner operation; pin expected head SHA and complete merged-head verification                           |
| Promotion from `integration/mvp` to `main`                                                                                                      | Authorized independent review agent executes the approved promotion PR        | Explicit Owner milestone decision is required before execution                                                     |

Protected Owner-local instruction files, including `apps/web/AGENTS.md` and
`apps/web/CLAUDE.md`, must not be modified without explicit authorization.

## Scope-bound modification

Implementation authority does not grant general write authority. An implementer
may change only paths required by the frozen task scope and any explicit file
allowlist. Public Contracts, dependencies and lockfiles, database schema or
migrations, CI, deployment configuration, shared UI, design tokens,
architecture, and governance require explicit task scope and the applicable
validation.

When a necessary change crosses an unfrozen path, responsibility, domain, or
major-direction boundary, stop and report the exact dependency, affected paths,
and smallest options. Continue after the Owner freezes the required direction or
expanded scope. Once that judgment is recorded, routine implementation, review,
merge, and merged-head verification return to the machine-managed workflow.

No contributor or implementation agent becomes the sole reviewer of its own
protected or shared-boundary change. Independent review remains mandatory.
