/**
 * The plain (server-safe) boundary through which Client Components reach the
 * work publishing browser client and the shared text rule (C02); `"use client"`
 * files never import lib/public-api directly.
 */
export {
  AUTHORSHIP_ORIGINAL_AUTHOR_MAXIMUM,
  AUTHORSHIP_REFERENCE_TITLE_MAXIMUM,
  AUTHORSHIP_SOURCE_NOTE_MAXIMUM,
  DRAFT_TEXT_RAW_ALLOWANCE,
  WORK_BODY_MAXIMUM,
  WORK_EXCERPT_MAXIMUM,
  WORK_ITEMS_CONFIGURABLE_MAXIMUM,
  WORK_ITEMS_HARD_MAXIMUM,
  WORK_TITLE_MAXIMUM,
  checkPublishingBody,
  checkPublishingText,
  checkPublishingTitle,
  codePointLength,
  hasInvalidPublishingCharacters,
  normalizePublishingBody,
  normalizePublishingLineBreaks,
  normalizePublishingTitle,
  publishingBodyRule,
  publishingClient,
  publishingContentIssues,
  publishingTitleRule,
  PublishingRequestError,
} from "../../lib/public-api/work-publishing-client";
export type {
  PublishingContentInput,
  PublishingContentIssue,
  PublishingHolder,
  PublishingPageQueryInput,
  PublishingReadiness,
  PublishingReadinessCommand,
  PublishingRequestErrorCode,
  PublishingRequestIdentity,
  PublishingTextCheck,
  PublishingTextIssue,
  PublishingTextRule,
} from "../../lib/public-api/work-publishing-client";
