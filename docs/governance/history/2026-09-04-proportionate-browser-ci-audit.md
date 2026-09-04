# Proportionate Browser CI Audit — 2026-09-04

## Decision

The Owner approved optimizing browser CI so routine development is no longer
serialized behind the complete five-device matrix while preserving meaningful
end-to-end protection.

This task changes validation orchestration only. It does not change Product
behavior, Public Contracts, API behavior, PostgreSQL, migrations, importers,
dependencies, lockfiles, Production resources, or release authority.

## Measured baseline

The completed `main` workflow run `33914729580` provided the current baseline:

| Job                         | Approximate wall time |
| --------------------------- | --------------------: |
| `lint`                      |            41 seconds |
| `typecheck`                 |            47 seconds |
| `test` including PostgreSQL |   1 minute 48 seconds |
| `e2e`                       | 16 minutes 11 seconds |

Inside `e2e`:

- browser/system dependency installation took about 1 minute 24 seconds;
- Playwright reported 325 test instances using one worker;
- the browser run took about 14 minutes 28 seconds;
- 211 passed, 113 were intentionally skipped, and one retried test was reported
  as flaky.

The full matrix was running for backend/importer-only changes and again after
merge because the workflow had no scope classification.

## Existing-rule audit

| Existing protection                                | Classification | Result                                                                           |
| -------------------------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| Required `e2e` check on protected `main`           | PRESERVE       | The aggregate required check remains exactly `e2e`.                              |
| Full browser evidence for Web/UI changes           | PRESERVE       | Browser-surface pull requests still run all five projects.                       |
| One worker per browser project in CI               | PRESERVE       | Stability is retained; parallelism moves to independent jobs.                    |
| Browser validation for every repository change     | MODERNIZE      | Unknown code defaults to smoke; docs/governance-only changes launch no browser.  |
| Five projects serialized in one job                | MODERNIZE      | Five independent matrix jobs reduce wall-clock critical path.                    |
| Full matrix repeated immediately on merged `main`  | MODERNIZE      | Exact-head PR matrix is followed by merged-head smoke, not a duplicate full run. |
| Stale pull-request runs continue after new commits | RETIRE         | PR concurrency cancels superseded runs; `main` runs are not cancelled.           |

No protection was silently discarded. The Constitution already requires
validation proportionate to affected scope, while user-visible work continues to
require its applicable browser and Owner acceptance gates.

## Frozen policy

The classifier produces exactly one mode:

```text
none
smoke
full
```

### `full`

A pull request touching a browser surface runs all existing tests in parallel
jobs for:

```text
desktop-chromium
desktop-webkit
mobile-webkit
tablet-webkit
tablet-landscape-webkit
```

### `smoke`

Non-browser code changes and every browser-surface push to `main` run the stable
Formal Web smoke suite in Desktop Chromium.

### `none`

Documentation and governance-only changes do not start a browser. Format, lint,
typecheck, tests, and build remain independently governed by the main workflow.

Unknown or empty path information fails conservatively to smoke, or to full for
a pull request whose comparison cannot be resolved.

## Additional complete-matrix evidence

The complete five-project matrix also runs:

- daily at `07:23 UTC`;
- by manual workflow dispatch;
- on `v*` tag pushes.

## Known flaky test

Run `33914729580` exposed an existing race in
`tests/e2e/t02p-inscription-filter.spec.ts`: an intentionally missing image can
transition to its failed-media presentation between two snapshots unrelated to
the filter assertion. The open UI PR #92 already modifies that file and is the
correct bounded place to stabilize the wait. This CI-orchestration task does not
change Product or feature tests owned by that PR.

## Expected effect

For backend, database, importer, and other non-browser work, the protected
browser gate should move from the approximately 16-minute complete matrix to a
small Desktop Chromium smoke run. For browser-surface pull requests, the same
coverage remains but the five projects no longer serialize behind one worker.

These are target improvements to be measured after merge, not guaranteed
durations. Future changes must preserve the stable `e2e` required-check context
unless the repository ruleset is deliberately changed in a separately approved
governance task.
