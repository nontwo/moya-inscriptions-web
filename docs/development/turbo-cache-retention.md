# Turborepo local cache: output boundary and retention

Turborepo 2.10 keeps one local cache for the main checkout and every linked Git
worktree ("using shared worktree cache"): each `turbo run` reads and writes
`<main checkout>/.turbo/cache`, whichever worktree it starts in. That cache is
regenerable build output only; deleting an archive costs a rebuild on the next
miss and never touches source, dependencies, databases or running services.

## What a build archive contains

`turbo.json` caches `build` outputs as `.next/**` and `dist/**` with these
exclusions:

- `!.next/cache/**` — the Next.js compiler cache (Turbopack/webpack). It is
  large, machine-specific and rebuilt on demand.
- `!.next/dev/**` — Next 16 development-server output that sits beside a
  production build when `next dev` is running in the same worktree.
- Admin only (`admin#build`): `!dist/cache/**` and `!dist/dev/**`, because a
  Development harness may point the Admin `distDir` at `dist` through
  `MOYA_ADMIN_DIST_DIR`.

Everything the built application needs stays cached: `.next/server`,
`.next/static`, `.next/standalone` (Admin), `BUILD_ID`, route and build
manifests, generated `.next/types`, and every package `dist`. A harness that
selects another Admin `distDir` (for example `.next-pcint-dev`) is outside both
globs and is never cached, which is the intended behavior for task-owned
development output.

Older task branches keep the previous outputs until they integrate `main`; their
archives are still bounded by the retention below.

## Retention policy (workstation policy, not a Turbo requirement)

Run from any worktree:

```sh
pnpm cache:prune                     # plan only: prints totals, deletes nothing
pnpm cache:prune -- plan --plan-file /path/private/plan.json
pnpm cache:prune -- apply --from-plan /path/private/plan.json [--max-gib 15]
```

`plan` keeps an archive group (`<hash>.tar.zst`, `-manifest.json`, `-meta.json`)
when any existing registered worktree currently produces that task hash (a
read-only `turbo run build lint typecheck test --dry-run=json` in each worktree
that has `node_modules`), when its meta records a worktree's current HEAD, or
when it is newer than `--keep-days` (default 3). The newest remaining history is
then retained until `--budget-gib` (default 10) is full; legacy archives that
still contain compiler or development cache paths are dropped first. `apply`
deletes exactly the reviewed plan, re-checking each file's inode, device, size
and mtime, skipping anything changed, and is idempotent; `--max-gib` limits one
batch. The plan and result files hold local paths and belong in the task's
private artifacts directory, not in Git.

The default budget is an engineering choice for this machine. If the kept set is
larger than the budget, the command keeps it and reports it; it never deletes a
kept group to reach the number.

## Safety limits

- The command only operates on a real `<root>/.turbo/cache` directory, only on
  the three recognized file names per hash, never follows symlinks, and never
  descends into other directories.
- It refuses to apply while a `turbo` process is running or the cache was
  written in the last 30 seconds. That is a best-effort check, not a lock:
  coordinate relevant build activity yourself and do not run `apply` during
  another task's verification.
- There is no scheduled, hook-triggered or automatic run. Review the plan at
  task closeout and apply it deliberately.
- `du` counts APFS clones and hard links in full; measure reclaimed space with
  `df` before and after, and expect snapshots or open files to delay it.
