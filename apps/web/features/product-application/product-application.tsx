"use client";

import { LiveCommentSection } from "../comments/live-comment-section";
import { AuthorProvider, useAuthors } from "../authors/author-context";
import { AuthorProfileOverlay } from "../authors/author-profile";
import {
  AuthorTrigger,
  DiscoveryHome,
  FilteredInscriptions,
} from "../authors/discovery-feed";
import { DiscussionSection } from "../authors/discussion-section";
import { DetailActions, loadWorkDetail } from "../authors/work-detail";
import { LiveCatalogCards } from "../authors/live-catalog-cards";
import { CatalogSearchNavigationAction } from "../search/catalog-search";
import "../authors/author-styles.css";
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
  /** Formal Development composition; the clean Catalog preview keeps its data. */
  readonly authorCommunity?: boolean;
}

/**
 * The accepted Product application — Home, Browse, Search, Detail and Viewer —
 * with Catalog comments over the real comment client. A Client Component so
 * the render-prop seam is created on the client, while the Server pages decide
 * with plain data whether comments are composed at all.
 */
export const ProductApplication = ({
  comments,
  authorCommunity = false,
  ...preview
}: ProductApplicationProps) =>
  comments === null || !authorCommunity ? (
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
  ) : (
    <AuthorProvider signInHref={comments.signInHref}>
      <AuthorProduct preview={preview} />
    </AuthorProvider>
  );

const AuthorProduct = ({
  preview,
}: {
  preview: Omit<ProductApplicationProps, "comments" | "authorCommunity">;
}) => {
  const author = useAuthors();
  return (
    <LiveCatalogCards>
      {" "}
      <T02pProductPreview
        {...preview}
        detailScopeKey={author.viewer?.id ?? "guest"}
        renderProfileOverlay={(properties) => (
          <AuthorProfileOverlay {...properties} />
        )}
        workDetailLoader={loadWorkDetail}
        renderDiscussion={(target) => (
          <DiscussionSection
            target={target}
            key={`${target.type}:${target.id}`}
          />
        )}
        renderDetailActions={(detail, refresh) => (
          <DetailActions detail={detail} refresh={refresh} />
        )}
        discoveryHome={
          <DiscoveryHome
            data={preview.states.home}
            initialFeed={preview.initialHomeFeed ?? "discover"}
          />
        }
        filteredInscriptions={<FilteredInscriptions />}
        headerStart={<CatalogSearchNavigationAction />}
        headerEnd={<AuthorTrigger />}
      />
    </LiveCatalogCards>
  );
};
