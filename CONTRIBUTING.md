# Contributing

Repository development is governed by the
[Owner Development Constitution](docs/governance/OWNER-DEVELOPMENT-CONSTITUTION.md).
Read it before planning or changing files. This guide supplies operational steps
only and cannot relax the Constitution, frozen task scope, or an explicit Owner
file allowlist.

## Start a task

1. Record an explicit work reference: a GitHub Issue, a formal task ID, or
   another Owner-approved reference.
2. Freeze the goal, non-goals, allowed paths, and preserved behavior. Freeze a
   Behavior Matrix before implementation whenever user-visible behavior is in
   scope.
3. Sync `integration/mvp`, record its exact base SHA, and create a short-lived
   task branch such as `feat/<reference>-<name>`, `fix/<reference>-<name>`, or
   `chore/<reference>-<name>`.
4. Check [module ownership](docs/module-ownership.md). Stop and obtain explicit
   Owner approval before crossing an ownership or frozen-scope boundary.

Never push directly to `main` or `integration/mvp`. Never force-push a shared
branch or rewrite another contributor's history.

## Local setup

Use the Node.js version in `.nvmrc` and the pnpm version pinned by the root
`package.json`:

```bash
corepack enable
corepack prepare pnpm@11.9.0 --activate
pnpm install --frozen-lockfile
```

Run `pnpm dev` only when the scoped work requires a local runtime.

## Validate the scoped change

Validation must be proportionate to the approved scope. Run formatting, lint,
typecheck, relevant automated tests, and a build whenever they apply to the
affected runtime, architecture, dependency, database, or user-visible surface.
Run PostgreSQL and E2E validation when those surfaces are affected. A
documentation-only change does not require unrelated runtime checks.

Do not hide, skip, or downgrade an applicable failure. Fix its cause and rerun
the affected validation. Record each applicable command and result in the PR.

## Pull request and review

- Open a Draft PR to `integration/mvp` and complete the repository PR template.
- Keep commits and the diff scoped and reviewable. List every modified file and
  disclose deviations, risks, and deferred work.
- Do not automatically mark the PR Ready or merge it. The Owner controls those
  transitions and the final squash merge.
- Reply to, fix, and resolve review findings in the PR. Any substantive new
  commit invalidates earlier review approval and requires review of the updated
  diff.
- Automated validation, independent diff/code review, and Owner visual or
  real-device acceptance are distinct gates. For user-visible work, provide
  evidence for the task's approved platform matrix rather than a universal pair
  of phone and desktop screenshots.
- Delete a merged task branch only through the approved post-merge workflow.

Never commit `.env` files, tokens, cloud keys, production database credentials,
or other secrets. Public Contracts, root dependencies, lockfiles, database
schema or migrations, CI, deployment configuration, and other protected files
require explicit task scope and Owner approval.

Contributor, local, CI, and PR/test environments must not use production
credentials or a production database. Any production deployment is a separate
Owner-approved operation performed by an authorized operator from an approved
`main` baseline; repository candidate deployment documents do not authorize it.
