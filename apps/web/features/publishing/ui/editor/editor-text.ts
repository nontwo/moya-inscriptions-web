/**
 * The work publishing counting rule (C02) as the editor applies it to its
 * counters and field messages: a thin re-export of the shared implementation
 * in `packages/contracts/src/work-publishing-text.ts`, reached through the
 * plain publishing data boundary. Only the field wording lives here. The
 * Backend enforces the same rule again; these checks only inform the author.
 */

import {
  AUTHORSHIP_ORIGINAL_AUTHOR_MAXIMUM,
  AUTHORSHIP_REFERENCE_TITLE_MAXIMUM,
  AUTHORSHIP_SOURCE_NOTE_MAXIMUM,
  DRAFT_TEXT_RAW_ALLOWANCE,
  checkPublishingText,
  publishingBodyRule,
  publishingTitleRule,
} from "../../publishing-data";

import type {
  PublishingTextCheck,
  PublishingTextIssue,
  PublishingTextRule,
} from "../../publishing-data";

export { codePointLength } from "../../publishing-data";

export type EditorTextIssue = PublishingTextIssue;
export type EditorTextRule = PublishingTextRule;
export type EditorTextCheck = PublishingTextCheck;

export const checkEditorText: (
  raw: string,
  rule: EditorTextRule,
) => EditorTextCheck = checkPublishingText;

export const titleRule: EditorTextRule = publishingTitleRule;
export const bodyRule: EditorTextRule = publishingBodyRule;

/** The authorship fields follow the contracts' rules: same limits, same raw allowance. */
export const referenceTitleRule: EditorTextRule = {
  maximum: AUTHORSHIP_REFERENCE_TITLE_MAXIMUM,
  singleLine: true,
  rawAllowance: DRAFT_TEXT_RAW_ALLOWANCE,
};
export const originalAuthorRule: EditorTextRule = {
  maximum: AUTHORSHIP_ORIGINAL_AUTHOR_MAXIMUM,
  singleLine: true,
  rawAllowance: DRAFT_TEXT_RAW_ALLOWANCE,
};
export const sourceNoteRule: EditorTextRule = {
  maximum: AUTHORSHIP_SOURCE_NOTE_MAXIMUM,
  singleLine: false,
  rawAllowance: DRAFT_TEXT_RAW_ALLOWANCE,
};

/** Field-specific product text for an issue (neutral wording). */
export const issueMessage = (
  label: string,
  issue: EditorTextIssue,
  maximum: number,
): string =>
  issue === "too_long"
    ? `${label}最多 ${maximum} 字`
    : issue === "line_break"
      ? `${label}不能换行`
      : `${label}包含无法保存的字符`;
