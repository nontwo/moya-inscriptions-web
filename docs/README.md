# Documentation authority map

This map classifies repository documents by authority and lifecycle.

The current authority order is:

1. explicit current Owner instructions and active
   [Owner amendments](governance/amendments/);
2. the [Owner Development Constitution][constitution];
3. task-specific frozen Scope and Behavior Matrix;
4. approved Plan and implementation prompt;
5. model, agent, or tool inference.

Operational guides and technical documents must remain consistent with this
chain. They cannot amend it.

## 1. Normative and current authority

- [`../AGENTS.md`](../AGENTS.md) is the short repository entrypoint. It requires
  the Constitution and every active amendment to be read before planning or
  modification.
- [Owner amendments](governance/amendments/) currently include:
  - the machine-verified review and merge amendment, which defines routine
    review/merge authority and Owner decision gates;
  - the React Product current-authority amendment, which records the merged
    Formal React root, the non-production Prototype boundary, and implemented
    Catalog Content V1 state.
- The [Owner Development Constitution][constitution] is normative below active
  Owner instructions and amendments.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) is the subordinate operational
  contributor guide.
- [`branching-strategy.md`](branching-strategy.md) defines branch topology and
  milestone-promotion rules only.
- [`module-ownership.md`](module-ownership.md) records stable ownership,
  implementation authority, and decision gates.

## 2. Current architecture and status

- [`project-status.md`](project-status.md) is the only dynamic source for task,
  roadmap, milestone, completion, and Production-gap status.
- [`architecture.md`](architecture.md) and accepted entries in
  [`adr/`](adr/README.md) describe the active system and approved architecture
  boundaries.
- Current domain and implementation specifications live in areas such as
  [`catalog-import/`](catalog-import/), [`design-system/`](design-system/), and
  the relevant package or service README files.

Current architecture documents describe the active system. They do not replace
dynamic status reporting or the authority chain.

## 3. Historical records

- [`governance/history/`](governance/history/) contains completed governance
  audits, rule classifications, and superseded evidence.
- [`audits/`](audits/) contains retained technical audit evidence.
- [`history/`](history/) contains detailed milestone narration removed from the
  concise dynamic status.
- Superseded or partially superseded ADRs remain in [`adr/`](adr/README.md) as
  historical evidence. Their superseded rules do not override current accepted
  architecture.

Historical audits and superseded evidence do not override current rules.

## 4. Prototype and archived designs

- [`deployment/`](deployment/) contains active provider-neutral readiness,
  release-safety, migration, backup, and rollback guidance. It does not select a
  provider or authorize real infrastructure operations.
- [`archive/deployment/`](archive/deployment/) contains historical provider
  candidates, including T03 CloudBase evidence. Archived material is
  non-executable and non-authoritative.
- [`prototypes/`](prototypes/) contains non-production visual/interaction
  references and fixtures. It is not the current Formal React implementation, a
  Production data source, or permission to replace the current Product Shell.

Candidate, archived, or Prototype material becomes current only through an
explicitly approved task and the applicable authority process.

[constitution]: governance/OWNER-DEVELOPMENT-CONSTITUTION.md
