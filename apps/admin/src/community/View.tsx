import { DefaultTemplate } from "@payloadcms/next/templates";
import type { AdminViewServerProps } from "payload";

import { isOwner } from "../editorial/access";
import { CommunityModerationClient } from "./client";

export const CommunityModerationView = (props: AdminViewServerProps) => {
  const { req, visibleEntities } = props.initPageResult;
  return (
    <DefaultTemplate {...props} req={req} visibleEntities={visibleEntities}>
      {isOwner(req) ? (
        <CommunityModerationClient />
      ) : (
        <p role="alert">此工作区仅限 Owner。</p>
      )}
    </DefaultTemplate>
  );
};
