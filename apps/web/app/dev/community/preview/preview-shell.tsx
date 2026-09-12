"use client";

import { LiveCommentSection } from "../../../../features/comments/live-comment-section";
import { T02pProductPreview } from "../../../../features/product-preview/t02p-product-preview";

import type { T02pDevelopmentCatalogDestinationStates } from "../../../../features/product-preview/catalog-scenarios";
import type { PresentationPlatform } from "../../../../features/shell/device-platform";

export interface CommunityAcceptancePreviewProps {
  readonly initialPlatform: PresentationPlatform;
  readonly states: T02pDevelopmentCatalogDestinationStates;
}

/**
 * The accepted product preview with the real comment client composed through
 * the frozen seam. Development only; the Formal root stays untouched.
 */
export const CommunityAcceptancePreview = ({
  initialPlatform,
  states,
}: CommunityAcceptancePreviewProps) => (
  <div data-community-acceptance-preview="">
    <T02pProductPreview
      initialPlatform={initialPlatform}
      renderCommentSection={(catalogId) => (
        <LiveCommentSection
          catalogId={catalogId}
          key={catalogId}
          signInHref="/dev/community"
        />
      )}
      states={states}
    />
  </div>
);
