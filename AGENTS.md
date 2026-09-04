# Repository Development Authority

Before planning or modifying repository files, read:

1. `docs/governance/OWNER-DEVELOPMENT-CONSTITUTION.md`;
2. every active amendment under `docs/governance/amendments/`.

The authority order is:

1. explicit current Owner instructions and active Owner amendments;
2. the Constitution;
3. task-specific frozen Scope and Behavior Matrix;
4. approved Plan and implementation prompt;
5. model, agent, or tool inference.

The active amendments are:

- [`2026-08-24 machine-verified review and merge`](docs/governance/amendments/2026-08-24-machine-verified-review-and-merge.md),
  which reserves Owner involvement for visual or real-device judgment,
  major-direction decisions, production authority, and unresolved STOP gates;
- [`2026-09-04 React Product current authority`](docs/governance/amendments/2026-09-04-react-product-current-authority.md),
  which records the merged React Formal Root, the non-production Prototype
  boundary, and the implemented Catalog Content V1 state.
- [`2026-09-04 single-main trunk unification`](docs/governance/amendments/2026-09-04-single-main-trunk-unification.md),
  which establishes `main` as the sole shared development branch and defines
  tag- and release-based stable milestones.

No lower-level prompt, Plan, implementation decision, PR description, inferred
best practice, or code comment may relax or override a higher authority.

If a task conflicts with the current authority chain: STOP and report the
conflict. Do not silently expand scope. Do not modify nested Owner-local
instruction files unless explicitly authorized.
