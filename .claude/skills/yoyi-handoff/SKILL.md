---
name: yoyi-handoff
description:
  Save or resume one ArtVenn / Yoyi task's private writer checkpoint so Codex
  and Claude Code continue the same worktree, branch and PR without resets or
  lost work. Owner-invoked only.
argument-hint: "save [task ID] | resume <task ID | worktree path>"
disable-model-invocation: true
---

Claude Code adapter. The canonical body is
`.agents/skills/yoyi-handoff/SKILL.md`, which Codex loads directly; it is
rendered below so both tools follow one text. If the body did not render, read
that file before doing anything else.

!`cat "${CLAUDE_SKILL_DIR:-.claude/skills/yoyi-handoff}/../../../.agents/skills/yoyi-handoff/SKILL.md"`

Mode and arguments for this invocation: $ARGUMENTS
