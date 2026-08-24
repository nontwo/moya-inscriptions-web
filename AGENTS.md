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

The active
[`2026-08-24 machine-verified review and merge amendment`](docs/governance/amendments/2026-08-24-machine-verified-review-and-merge.md)
requires agents to complete routine machine-verifiable review, merge, and
merged-head verification. Owner involvement is reserved for the amendment's
visual/real-device, major-direction, production-authority, and unresolved STOP
gates.

No lower-level prompt, Plan, implementation decision, PR description, inferred
best practice, or code comment may relax or override a higher authority.

If a task conflicts with the current authority chain: STOP and report the
conflict. Do not silently expand scope. Do not modify nested Owner-local
instruction files unless explicitly authorized.
