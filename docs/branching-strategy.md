# Branching strategy

```text
main
└── integration/mvp
    └── <short-lived task branch for a work reference>
```

- `main` is the Owner-approved milestone baseline.
- `integration/mvp` is the shared integration branch.
- A short-lived task branch starts from the latest `integration/mvp` and returns
  through a squash-merge pull request.
- Never push directly to `main` or `integration/mvp`.
- Never force-push a shared branch or rewrite another contributor's history.
- A machine-verifiable pull request targeting `integration/mvp` may be marked
  Ready and squash merged by an independent review agent after applicable
  validation, actual-diff review, and every applicable Owner gate pass.
- Owner judgment is required only for visual or real-device acceptance, a major
  product or architecture direction, a production-authority operation, or an
  unresolved mandatory STOP condition. The Owner does not perform routine GitHub
  merge operations.
- Promotion from `integration/mvp` to `main` creates a stable milestone and
  requires an explicit Owner milestone decision. After approval, an independent
  review agent may execute the promotion merge and merged-head verification.
- Add an annotated baseline tag after an approved milestone enters `main`.
- Delete a short-lived branch through the approved post-merge workflow only
  after merged-head verification passes.

## Status source

Dynamic task, roadmap, and milestone status belongs only in
[project status](project-status.md). This file defines branch topology and
milestone-promotion rules only.
