/**
 * The work publishing counting rule (C02) as the editor applies it to its
 * counters and field messages.
 *
 * The shared implementation lives in `packages/contracts/src/work-publishing-text.ts`
 * and is exported only from `@moya/contracts/schemas`, which Web feature and
 * Client Component files may not import (the contracts root is type-only). Until
 * `features/publishing/publishing-data.ts` re-exports it through the Web public
 * API boundary, this module restates the same rule with the same limits; its
 * tests pin the documented cases so any divergence fails:
 *
 * - CRLF and lone CR become LF; NUL and lone surrogates are rejected;
 * - outer whitespace is trimmed; a title is a single line;
 * - length is the number of Unicode code points after normalization;
 * - a draft may hold raw input up to the limit plus 2,000 code points.
 *
 * The Backend enforces the rule again; these checks only inform the author.
 */

export const TITLE_MAXIMUM = 200;
export const BODY_MAXIMUM = 10_000;
export const REFERENCE_TITLE_MAXIMUM = 200;
export const ORIGINAL_AUTHOR_MAXIMUM = 100;
export const SOURCE_NOTE_MAXIMUM = 500;
export const RAW_ALLOWANCE = 2_000;

export type EditorTextIssue = "invalid_characters" | "line_break" | "too_long";

export interface EditorTextRule {
  readonly maximum: number;
  readonly singleLine: boolean;
}

export interface EditorTextCheck {
  /** The normalized value (what is stored or published). */
  readonly value: string;
  /** Code points of the normalized value. */
  readonly length: number;
  readonly issue: EditorTextIssue | null;
}

export const codePointLength = (value: string): number => [...value].length;

const hasInvalidCharacters = (value: string): boolean =>
  value.includes("\u0000") || /[\uD800-\uDFFF]/u.test(value);

export const normalizeLineBreaks = (value: string): string =>
  value.replace(/\r\n?/gu, "\n");

export const checkEditorText = (
  raw: string,
  rule: EditorTextRule,
): EditorTextCheck => {
  const value = normalizeLineBreaks(raw).trim();
  const length = codePointLength(value);
  const issue: EditorTextIssue | null = hasInvalidCharacters(raw)
    ? "invalid_characters"
    : length > rule.maximum ||
        codePointLength(raw) > rule.maximum + RAW_ALLOWANCE
      ? "too_long"
      : rule.singleLine && value.includes("\n")
        ? "line_break"
        : null;
  return { value, length, issue };
};

export const titleRule: EditorTextRule = {
  maximum: TITLE_MAXIMUM,
  singleLine: true,
};
export const bodyRule: EditorTextRule = {
  maximum: BODY_MAXIMUM,
  singleLine: false,
};
export const referenceTitleRule: EditorTextRule = {
  maximum: REFERENCE_TITLE_MAXIMUM,
  singleLine: true,
};
export const originalAuthorRule: EditorTextRule = {
  maximum: ORIGINAL_AUTHOR_MAXIMUM,
  singleLine: true,
};
export const sourceNoteRule: EditorTextRule = {
  maximum: SOURCE_NOTE_MAXIMUM,
  singleLine: false,
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
