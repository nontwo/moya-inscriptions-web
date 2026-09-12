"use client";

import { developmentSignInPath } from "../../../../features/product-application/community-comment-surface";
import { ProductApplication } from "../../../../features/product-application/product-application";

import type { T02pDevelopmentCatalogDestinationStates } from "../../../../features/product-preview/catalog-scenarios";
import type { PresentationPlatform } from "../../../../features/shell/device-platform";

export interface CommunityAcceptancePreviewProps {
  readonly initialPlatform: PresentationPlatform;
  readonly states: T02pDevelopmentCatalogDestinationStates;
}

/**
 * The accepted product preview with the real comment client composed through
 * the frozen seam: the same Product application as the Formal root, over the
 * clean Development states, kept as the regression and acceptance entry.
 */
export const CommunityAcceptancePreview = ({
  initialPlatform,
  states,
}: CommunityAcceptancePreviewProps) => (
  <div data-community-acceptance-preview="">
    <ProductApplication
      comments={{ signInHref: developmentSignInPath }}
      initialPlatform={initialPlatform}
      states={states}
    />
  </div>
);
