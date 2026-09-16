---
name: artvenn-admin
description:
  Perform Owner-instructed ArtVenn / 由于艺 community administration through the
  Payload MCP `artvenn_*` tools as a bound machine principal (find, prepare,
  execute, cancel, undo). Development-only. Owner-invoked only.
argument-hint: "<natural-language administration request>"
disable-model-invocation: true
---

Claude Code adapter. The canonical body is
`.agents/skills/artvenn-admin/SKILL.md`, which Codex loads directly; it is
rendered below so both tools follow one text. If the body did not render, read
that file before doing anything else.

!`cat "${CLAUDE_SKILL_DIR:-.claude/skills/artvenn-admin}/../../../.agents/skills/artvenn-admin/SKILL.md"`

Request for this invocation: $ARGUMENTS
