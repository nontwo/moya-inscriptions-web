import { DefaultTemplate } from "@payloadcms/next/templates";
import type { AdminViewServerProps } from "payload";

import { isOwner } from "../editorial/access";
import { CommunityHistoryClient } from "./history-client";
import { CommunityQueueClient } from "./queue-client";
import { CommunitySettingsClient } from "./settings-client";

/**
 * The three Community views inside the standard Admin shell: the review
 * queue (the primary working surface), the publication setting and the
 * operation history. Each is Owner-only; `automation` never moderates.
 */
const OwnerOnly = ({
  children,
  props,
}: {
  readonly children: React.ReactNode;
  readonly props: AdminViewServerProps;
}) => {
  const { req, visibleEntities } = props.initPageResult;
  return (
    <DefaultTemplate {...props} req={req} visibleEntities={visibleEntities}>
      {isOwner(req) ? children : <p role="alert">此工作区仅限 Owner。</p>}
    </DefaultTemplate>
  );
};

export const CommunityModerationView = (props: AdminViewServerProps) => (
  <OwnerOnly props={props}>
    <CommunityQueueClient />
  </OwnerOnly>
);

export const CommunitySettingsView = (props: AdminViewServerProps) => (
  <OwnerOnly props={props}>
    <CommunitySettingsClient />
  </OwnerOnly>
);

export const CommunityHistoryView = (props: AdminViewServerProps) => (
  <OwnerOnly props={props}>
    <CommunityHistoryClient />
  </OwnerOnly>
);
