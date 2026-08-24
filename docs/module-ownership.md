# Module ownership

This file records stable ownership, implementation authority, and decision gates
only. Dynamic task, milestone, and completion status belongs exclusively in
[project status](project-status.md).

The active machine-verified review and merge amendment is recorded under
`governance/amendments/`. It controls routine Ready, merge, and merged-head
operations.

## Path groups

### Root governance and configuration

This group includes:

- `AGENTS.md`;
- the root `package.json`;
- workspace configuration;
- TypeScript, lint, and formatting configuration;
- framework-wide configuration.

Implementation requires explicit frozen task scope. Independent actual-diff
review is mandatory. Ask the Owner only when the task changes an unfrozen
governance rule or major architectural direction.

### GitHub, CI, and deployment configuration

This group includes `.github/**`, CI, and deployment configuration.

Implementation requires explicit frozen task scope. Independent review is
mandatory. Ask the Owner only for a new production authority, unresolved
security direction, or unresolved delivery direction.

### Governance and architecture

This group includes:

- `docs/governance/**`;
- `docs/architecture.md`;
- `docs/adr/**`.

An explicitly scoped governance or architecture task may modify these paths.
Independent review is mandatory. Ask the Owner only when the task changes an
unfrozen major direction.

### Public Contracts and API boundaries

This group includes `packages/contracts/**` and Public Contract or API
boundaries.

An explicitly scoped Contract task may modify these paths. It requires
independent review and applicable validation. Ask the Owner for an unapproved
domain or Contract expansion.

### Database schema and migrations

This group includes `database/**`, migration numbering, and database schema.

An explicitly scoped database task may modify these paths. It requires
independent review and PostgreSQL validation. Ask the Owner for an unapproved
schema or data-governance direction.

### Infrastructure and environment-variable names

This group includes `infra/**` and environment-variable names.

An explicitly scoped infrastructure task may modify these paths. It requires
independent review. Ask the Owner for provider choice, production resources,
credentials, material cost, or security direction.

### Shared UI and design system

This group includes:

- `packages/ui/**`;
- `packages/design-tokens/**`;
- shared semantic design assets.

An explicitly scoped design-system task may modify these paths. It requires
independent review and applicable validation. User-visible presentation changes
also require Owner visual or real-device acceptance.

### Applications, services, and other business packages

This group includes `apps/**`, `services/**`, and other `packages/**` business
modules.

The task implementer may modify only the exact frozen module scope. Independent
review and applicable validation are mandatory. Ask the Owner only for an
applicable visual, directional, production, or unresolved STOP gate.

### Supporting documentation, tests, fixtures, and scripts

The task implementer may modify only the exact approved supporting scope.
Independent review and proportionate validation are mandatory.

## Merge authority

### Short-lived task pull requests into `integration/mvp`

An authorized independent review agent executes the merge after all applicable
gates pass. Routine Owner action is not required. The agent must pin the
expected head SHA and complete merged-head verification.

### Promotion from `integration/mvp` to `main`

An explicit Owner milestone decision is required because the promotion creates a
stable baseline. After approval, an authorized independent review agent executes
the promotion merge and merged-head verification.

## Protected Owner-local files

Protected Owner-local instruction files include:

- `apps/web/AGENTS.md`;
- `apps/web/CLAUDE.md`.

Do not modify them without explicit authorization.

## Scope-bound modification

Implementation authority does not grant general write authority. An implementer
may change only paths required by the frozen task scope and any explicit file
allowlist. Public Contracts, dependencies and lockfiles, database schema or
migrations, CI, deployment configuration, shared UI, design tokens,
architecture, and governance require explicit task scope and applicable
validation.

When a necessary change crosses an unfrozen path, responsibility, domain, or
major-direction boundary, stop and report the exact dependency, affected paths,
and smallest options. Continue after the Owner freezes the required direction or
expanded scope. Once that judgment is recorded, routine implementation, review,
merge, and merged-head verification return to the machine-managed workflow.

No contributor or implementation agent may be the sole reviewer of its own
protected or shared-boundary change. Independent review remains mandatory.
