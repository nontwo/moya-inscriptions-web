# Apple task instructions

Apply the root repository authority and the
[shared task workflow](../../docs/development/task-workflow.md). These local
instructions add Apple requirements; they do not grant a wider task scope.

- Scope native sources, resources, Xcode projects, tests and dedicated guidance
  to `apps/apple/**` and any separately authorized supporting files. Keep the
  current iPhone priority and the approved Multiplatform direction.
- Preserve existing source and staged/unstaged work during handoff. Do not
  recreate the project, introduce another `.git`, change Team/Bundle ID/signing,
  upgrade dependencies or change a backend without explicit task authority.
- From the task worktree root, run
  `node scripts/verify-apple.mjs --output <private-output>` for bounded build and
  scheme unit/UI tests on one task-owned iOS Simulator. A specifically build-only task may
  use `--build-only`; report that unit tests were not run. Report missing
  projects, Xcode, SDKs or compatible destinations as NOT TESTED/PENDING.
- Keep DerivedData, simulator results and other writable validation output in
  the task's unique private output directory. Do not reuse another task's
  writable test data, output or runtime. Do not shut down all simulators.
- Apple-only work does not require Web dependency installation, `pnpm verify`,
  CMS/PostgreSQL, browser E2E or a platform matrix. The existing lightweight
  core-credential Git hooks still apply; keep their runtime and protections.
- Before introducing an API consumer, record its contract/API version and the
  required focused client validation. The current bootstrap has no such
  consumer; do not claim nonexistent client tests passed. Reading a Web API
  contract does not authorize changing its implementation or restarting another
  task's backend.
- User-visible behavior still needs the applicable Owner visual or real-device
  judgment. A simulator build is not a real-device acceptance result.
