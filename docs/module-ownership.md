# Module ownership

This file records stable ownership and approval boundaries only. Dynamic task,
milestone, and completion status belongs exclusively in
[project status](project-status.md).

## Path ownership

| Path or responsibility                                                                                                                          | Implementation responsibility                                               | Required approval and merge |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| Root governance and configuration, including `AGENTS.md`, root `package.json`, workspace, TypeScript, lint, format, and framework configuration | Owner, or a task implementer with an explicit Owner-approved path scope     | `@nontwo`                   |
| `.github/**`, CI, and deployment configuration                                                                                                  | Owner, or an explicitly authorized task implementer                         | `@nontwo`                   |
| `docs/governance/**`, `docs/architecture.md`, and `docs/adr/**`                                                                                 | Owner, or an explicitly authorized governance/architecture task implementer | `@nontwo`                   |
| `packages/contracts/**` and Public Contract/API boundaries                                                                                      | Owner, or an explicitly authorized contract task implementer                | `@nontwo`                   |
| `database/**`, migration numbering, and database schema                                                                                         | Scoped database task implementer                                            | `@nontwo`                   |
| `infra/**` and environment-variable names                                                                                                       | Scoped infrastructure task implementer                                      | `@nontwo`                   |
| `packages/ui/**`, `packages/design-tokens/**`, and shared semantic design assets                                                                | Scoped design-system task implementer                                       | `@nontwo`                   |
| `apps/**`, `services/**`, and other `packages/**` business modules                                                                              | Task implementer for the exact approved module scope                        | `@nontwo`                   |
| Other `docs/**`, tests, fixtures, and scripts                                                                                                   | Task implementer for the exact approved supporting scope                    | `@nontwo`                   |
| Final merge to `main` or `integration/mvp`                                                                                                      | Owner only                                                                  | `@nontwo`                   |

Protected Owner-local instruction files, including `apps/web/AGENTS.md` and
`apps/web/CLAUDE.md`, must not be modified without explicit authorization.

## Scope-bound modification

Implementation responsibility does not grant general write authority. The
implementer may change only paths required by the frozen task scope and any
explicit Owner allowlist. Public Contracts, dependencies and lockfiles, database
schema or migrations, CI, deployment configuration, shared UI, design tokens,
architecture, and governance require explicit scope and Owner approval.

When a necessary change crosses a path or responsibility boundary, stop and
report the exact dependency, affected paths, and smallest options. Continue only
after the Owner approves an expanded scope, task split, handoff, and merge
order. No contributor becomes the sole authority for a protected or shared
boundary.
