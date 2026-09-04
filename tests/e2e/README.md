# Formal Web browser regression harness

This directory exercises the actual Formal Web against a deterministic test-only
Public API. It keeps Product code free of injected fixtures while covering the
request-rendered React shell, navigation, Detail, Viewer, history, responsive
behavior, and explicit Development/Production boundaries.

The harness starts the Web from a temporary mirror so Next.js development files
stay outside the repository. Product source, prototype files, and installed
workspace dependencies remain the runtime inputs.

## Local commands

Install the browser engines once:

```sh
pnpm --filter @moya/tests exec playwright install chromium webkit
```

Run the complete five-project suite:

```sh
pnpm test:e2e
```

Run the required fast smoke suite used for non-browser pull requests:

```sh
pnpm test:e2e:smoke
```

The smoke suite runs `formal-web.spec.ts` in Desktop Chromium with one worker.
It verifies the Formal React root, truthful Production composition, the shared
Detail/Viewer journey, browser history and reload, redirects, and failure
presentation.

## CI policy

The protected check remains exactly `e2e`, but its work is proportionate to the
changed paths:

- browser-surface pull requests run the complete matrix in five parallel jobs;
- other code pull requests run the Desktop Chromium smoke suite;
- documentation and governance-only pull requests launch no browser;
- pushes to `main` run at most the smoke suite, avoiding a second full matrix
  immediately after an exact-head pull-request matrix;
- the complete matrix also runs every day, on manual dispatch, and for `v*` tags
  through `Full Browser Regression`.

Browser-surface paths include the Formal Web, shared UI and design tokens, E2E
harness files, browser-visible design/prototype assets, and root runtime or CI
configuration. Unknown code paths default to smoke rather than silently skipping
browser validation.

Each browser project still uses one worker in CI. Parallelism is provided by
separate jobs for Desktop Chromium, Desktop WebKit, iPhone WebKit, iPad WebKit,
and landscape iPad WebKit. No browser scenario is removed by this policy.
