# Branching strategy

```text
main
└── <short-lived task branch for a work reference>
```

- `main` is the sole long-lived, default, and shared development branch.
- A short-lived task branch starts from the latest `origin/main` and returns
  through a squash-merge pull request targeting `main`.
- Never push directly to `main`.
- Never force-push a shared branch or rewrite another contributor's history.
- A machine-verifiable pull request targeting `main` may be marked Ready and
  squash merged by an independent review agent after applicable validation,
  actual-diff review, and every applicable Owner gate pass.
- Owner judgment is required only for visual or real-device acceptance, a major
  product or architecture direction, a production-authority operation, or an
  unresolved mandatory STOP condition. The Owner does not perform routine GitHub
  merge operations.
- A stable milestone starts from a verified `main` commit and requires an
  explicit Owner milestone decision. After approval, create an annotated tag and
  GitHub Release without introducing another long-lived branch.
- Production release starts only from an approved tag and proceeds through the
  protected Production environment plus deployment, smoke, and rollback gates.
- Delete a short-lived branch through the approved post-merge workflow only
  after merged-head verification passes.

## Status source

Dynamic task, roadmap, and milestone status belongs only in
[project status](project-status.md). This file defines branch topology and
milestone-promotion rules only.
