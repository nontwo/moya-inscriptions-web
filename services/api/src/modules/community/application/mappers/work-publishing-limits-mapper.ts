import { WORK_BODY_MAXIMUM, WORK_TITLE_MAXIMUM } from "@moya/contracts/schemas";

import type { PublishingLimits } from "@moya/contracts";
import type { WorkPublishingSettings } from "@moya/contracts/internal/community-operator";

/** The author-facing limits: the stored settings plus the shared text rule. */
export const mapPublishingLimits = (
  settings: WorkPublishingSettings,
): PublishingLimits => ({
  maxItems: settings.maxItemsPerWork,
  originalItemMaxBytes: settings.originalItemMaxBytes,
  standardComponentMaxBytes: settings.standardComponentMaxBytes,
  titleMax: WORK_TITLE_MAXIMUM,
  bodyMax: WORK_BODY_MAXIMUM,
});
