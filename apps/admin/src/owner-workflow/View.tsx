import { DefaultTemplate } from "@payloadcms/next/templates";
import type { AdminViewServerProps } from "payload";

import { isOwner } from "../editorial/access";
import { OwnerWorkflowClient } from "./client";

export const OwnerWorkflowView = (props: AdminViewServerProps) => {
  const { req, visibleEntities } = props.initPageResult;
  return (
    <DefaultTemplate {...props} req={req} visibleEntities={visibleEntities}>
      {isOwner(req) ? (
        <OwnerWorkflowClient />
      ) : (
        <p role="alert">此工作区仅限 Owner。</p>
      )}
    </DefaultTemplate>
  );
};
