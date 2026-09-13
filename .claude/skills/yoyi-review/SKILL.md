---
name: yoyi-review
description:
  Independently review one ArtVenn / Yoyi task against its Issue specification,
  the actual diff at the exact head SHA, applicable evidence and review threads,
  without editing source. Owner-invoked only.
argument-hint: "<PR number | branch | task ID> [--head <sha>]"
disable-model-invocation: true
---

Claude Code adapter. The canonical body is
`.agents/skills/yoyi-review/SKILL.md`, which Codex loads directly; it is
rendered below so both tools follow one text. If the body did not render, read
that file before doing anything else.

!`cat "${CLAUDE_SKILL_DIR:-.claude/skills/yoyi-review}/../../../.agents/skills/yoyi-review/SKILL.md"`

Review target for this invocation: $ARGUMENTS
