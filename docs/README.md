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
  the Constitution and all active amendments to be read before planning or
  modification.
- [Owner amendments](governance/amendments/) record explicit current Owner
  amendments. The active machine-verified review and merge amendment reserves
  Owner involvement for visual or real-device, major-direction,
  production-authority, and unresolved STOP gates. An independent review agent
  handles routine machine-verifiable review and merge.
- The [Owner Development Constitution][constitution] is normative below active
  Owner amendments.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) is the subordinate operational
  contributor guide.
- [`branching-strategy.md`](branching-strategy.md) defines branch topology and
  milestone-promotion rules only.
- [`module-ownership.md`](module-ownership.md) records stable ownership,
  implementation authority, and decision gates.

## 2. Current architecture and status

- [`project-status.md`](project-status.md) is the only dynamic source for task,
  roadmap, milestone, and completion status.
- [`architecture.md`](architecture.md) and accepted entries in
  [`adr/`](adr/README.md) describe the active system and its approved
  architecture boundaries.
- Current domain and implementation specifications live in areas such as
  [`catalog-import/`](catalog-import/), [`design-system/`](design-system/), and
  the relevant package or service README files.

Current architecture documents describe the active system. They do not replace
dynamic status reporting or the authority chain.

## 3. Historical records

- [`governance/history/`](governance/history/) contains completed governance
  audits and superseded evidence.
- [`audits/`](audits/) contains retained technical audit evidence.
- [`history/`](history/) contains detailed milestone narration removed from the
  concise dynamic status.
- Superseded or partially superseded ADRs remain in [`adr/`](adr/README.md) as
  historical evidence. Their superseded rules do not override current accepted
  architecture.

Historical audits and superseded evidence do not override current rules.

## 4. Prototype and archived designs

- [`deployment/`](deployment/) contains only active provider-neutral readiness,
  release-safety, migration and rollback guidance. It does not select a
  production provider or authorize real infrastructure operations.
- [`archive/deployment/`](archive/deployment/) contains historical provider
  candidates, including T03 CloudBase evidence. Archived material is
  non-executable and non-authoritative for current configuration or deployment.
- [`prototypes/`](prototypes/) contains non-production prototypes and reference
  material. Repository presence does not authorize Production consumption or a
  replacement of the canonical T02 presentation.

Candidate and archived material becomes current only through an explicitly
approved task and the applicable authority process.

[constitution]: governance/OWNER-DEVELOPMENT-CONSTITUTION.md
