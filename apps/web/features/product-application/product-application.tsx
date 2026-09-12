"use client";

import { LiveCommentSection } from "../comments/live-comment-section";
import { T02pProductPreview } from "../product-preview/t02p-product-preview";

import type { CommunityCommentSurface } from "./community-comment-surface";
import type { T02pProductPreviewProps } from "../product-preview/t02p-product-preview";

export interface ProductApplicationProps extends Pick<
  T02pProductPreviewProps,
  | "initialHomeFeed"
  | "initialPlatform"
  | "initialTopicId"
  | "navigationAction"
  | "productUtility"
  | "states"
> {
  /**
   * The live comment section composed through the frozen seam (amendment
   * section 6); null keeps the accepted Detail without a comment section.
   */
  readonly comments: CommunityCommentSurface | null;
}

/**
 * The accepted Product application — Home, Browse, Search, Detail and Viewer —
 * with Catalog comments over the real comment client. A Client Component so
 * the render-prop seam is created on the client, while the Server pages decide
 * with plain data whether comments are composed at all.
 */
export const ProductApplication = ({
  comments,
  ...preview
}: ProductApplicationProps) => (
  <T02pProductPreview
    {...preview}
    {...(comments === null
      ? {}
      : {
          renderCommentSection: (catalogId: string) => (
            <LiveCommentSection
              catalogId={catalogId}
              key={catalogId}
              signInHref={comments.signInHref}
            />
          ),
        })}
  />
);
