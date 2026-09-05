# Formal Web browser regression harness

The existing harness starts the Formal Web with a deterministic test-only Public
API in a temporary mirror. Development/Production behavior and fixtures are
unchanged.

Run related specs/projects while developing; investigate failures with
`--retries=0` and retain failed attempts. The complete local command remains
`pnpm test:e2e`, but a final full remote candidate does not require a duplicate
local five-project run.

## CI selection

Both PRs and main pushes use `scripts/ci-e2e-scope.mjs`:

- `none`: only explicitly allowlisted ordinary/governance documents. The summary
  says browser validation is not required and tests were NOT RUN.
- `smoke`: only importer implementation or backend/PostgreSQL test paths in the
  small allowlist. Runs existing `formal-web.spec.ts`, desktop-chromium, one
  worker; native planned/executed sets, identity and complete outcomes must
  match. Empty collections, skips, retries, flaky, failure and missing evidence
  fail.
- `full`: Web/shared runtime/design/prototype/dependency/build/E2E/CI changes,
  unknown or mixed groups, invalid input or failed comparison. Retains five
  projects, three native shards, 18/22/30-minute budgets and the unchanged
  strict native report aggregate. This CI PR itself must run full.

No extension-wide or whole-docs exemption exists. PR comparisons use merge-base
to head; main compares the complete before-to-after span. Renames expose both
paths. Missing comparison data defaults to full. Other applicable lint,
typecheck, ordinary/PostgreSQL tests and build are unchanged in all modes.

The required check remains `e2e`. Its selected job must succeed and retain its
native evidence. New commits cancel obsolete runs of the same PR only; main has
a unique run group and is never canceled by this concurrency rule. Canceled runs
are not passed evidence. There is no additional/nightly workflow.

For a local smoke check:

```sh
CI=1 pnpm --filter @moya/tests exec playwright test --config e2e/playwright.config.ts formal-web.spec.ts --project=desktop-chromium --workers=1
```

Use actual measured timings; no speed ratio is guaranteed. Pure CI changes have
no Owner visual gate; independent exact-head review and applicable merged-head
verification remain required.
