# Contributing

Repository development is governed by the
[Owner Development Constitution](docs/governance/OWNER-DEVELOPMENT-CONSTITUTION.md)
and the active
[Owner amendments](docs/governance/amendments/). Read both before planning or
changing files. This guide supplies operational steps only and cannot relax the
Constitution, an active amendment, frozen task scope, or an explicit Owner file
allowlist.

## Start a task

1. Record an explicit work reference: a GitHub Issue, a formal task ID, or
   another Owner-approved reference.
2. Freeze the goal, non-goals, allowed paths, and preserved behavior. Freeze a
   Behavior Matrix before implementation whenever user-visible behavior is in
   scope.
3. Sync `integration/mvp`, record its exact base SHA, and create a short-lived
   task branch such as `feat/<reference>-<name>`, `fix/<reference>-<name>`, or
   `chore/<reference>-<name>`.
4. Check [module ownership](docs/module-ownership.md). Stop for an Owner decision
   only when the task would cross an unfrozen ownership/scope boundary or trigger
   another active Owner-decision gate.

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

## Pull request, review, and merge

- Open a Draft PR to `integration/mvp` and complete the repository PR template.
- Keep commits and the diff scoped and reviewable. List every modified file and
  disclose deviations, risks, and deferred work.
- An independent reviewer must inspect the actual GitHub diff, exact head SHA,
  current remote state, applicable automated evidence, and review threads.
  Implementation-agent self-report and green CI alone are not sufficient.
- For a fully machine-verifiable task with no unresolved Owner gate, the
  independent review agent may mark the PR Ready, squash merge it while pinning
  the expected head SHA, and complete merged-head verification.
- Ask the Owner only when an active gate requires human visual or real-device
  judgment, a major directional decision, production authority, or resolution
  of a mandatory STOP condition. After the Owner records the necessary judgment
  for the exact reviewed head, the review agent performs the routine Ready,
  merge, and merged-head operations.
- Reply to, fix, and resolve review findings in the PR. Any substantive new
  commit invalidates earlier review approval and requires review of the updated
  diff.
- Automated validation, independent diff/code review, and any applicable Owner
  judgment are distinct gates. For user-visible work, provide evidence for the
  task's approved platform matrix rather than a universal pair of phone and
  desktop screenshots.
- Delete a merged task branch through the approved post-merge workflow after
  merged-head verification.

Never commit `.env` files, tokens, cloud keys, production database credentials,
or other secrets. Public Contracts, root dependencies, lockfiles, database
schema or migrations, CI, deployment configuration, and other protected files
require explicit frozen task scope. Obtain an Owner decision only when the
required scope or direction has not already been approved.

Contributor, local, CI, and PR/test environments must not use production
credentials or a production database. Any production deployment is a separate
Owner-approved operation performed by an authorized operator from an approved
`main` baseline; repository candidate deployment documents do not authorize it.
