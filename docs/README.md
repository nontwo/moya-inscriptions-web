# Documentation authority map

This map classifies repository documents by authority and lifecycle. The
[Owner Development Constitution](governance/OWNER-DEVELOPMENT-CONSTITUTION.md)
is the sole normative repository development authority. Operational guides and
technical documents must remain consistent with it and cannot amend it.

## 1. Normative and current authority

- [`../AGENTS.md`](../AGENTS.md) is the short repository entrypoint that
  requires the Constitution to be read before planning or modification.
- [`governance/OWNER-DEVELOPMENT-CONSTITUTION.md`](governance/OWNER-DEVELOPMENT-CONSTITUTION.md)
  is normative and controls repository development below explicit Owner
  amendments.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) is the subordinate operational
  contributor guide.
- [`branching-strategy.md`](branching-strategy.md) defines branch topology and
  milestone-promotion rules only.
- [`module-ownership.md`](module-ownership.md) records stable ownership and
  approval boundaries.

## 2. Current architecture and status

- [`project-status.md`](project-status.md) is the only dynamic source for task,
  roadmap, milestone, and completion status.
- [`architecture.md`](architecture.md) and accepted entries in
  [`adr/`](adr/README.md) describe the active system and its approved
  architecture boundaries.
- Current domain and implementation specifications live in areas such as
  [`catalog-import/`](catalog-import/), [`design-system/`](design-system/), and
  the relevant package or service README files.

Current architecture documents describe the active system; they do not replace
dynamic status reporting or the Constitution.

## 3. Historical records

- [`governance/history/`](governance/history/) contains completed governance
  audits and superseded evidence.
- [`audits/`](audits/) contains retained technical audit evidence.
- Superseded or partially superseded ADRs remain in [`adr/`](adr/README.md) as
  historical evidence. Their superseded rules do not override current accepted
  architecture.

Historical audits and superseded evidence do not override current rules.

## 4. Candidate or archived designs

- [`deployment/`](deployment/) records candidate deployment architecture and
  checklists. Candidate deployment documents do not constitute an approved
  deployment or authorize real infrastructure operations.
- [`prototypes/`](prototypes/) contains non-production prototypes and reference
  material. Repository presence does not authorize Production consumption or a
  replacement of the canonical T02 presentation.

Candidate and archived material becomes current only through an explicitly
approved task and the applicable constitutional process.
