---
name: yoyi-task
description:
  Plan, start, change or report one bounded ArtVenn / Yoyi task under the
  repository authority chain. `plan` is read-only analysis, `start` executes an
  approved task, `change` applies an explicit requirements delta, `status`
  reports facts. Owner-invoked only.
argument-hint: "plan|start|change|status <task reference or request>"
disable-model-invocation: true
---

Claude Code adapter. The canonical body is `.agents/skills/yoyi-task/SKILL.md`,
which Codex loads directly; it is rendered below so both tools follow one text.
If the body did not render, read that file before doing anything else.

!`cat "${CLAUDE_SKILL_DIR:-.claude/skills/yoyi-task}/../../../.agents/skills/yoyi-task/SKILL.md"`

Mode and arguments for this invocation: $ARGUMENTS
