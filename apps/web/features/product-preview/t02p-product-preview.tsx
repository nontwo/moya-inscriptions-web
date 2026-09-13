"use client";

import { CatalogBrowseScreen } from "../home/catalog-screen";
import { CalligraphyCategoryScreen } from "../calligraphy/calligraphy-category-screen";
import { HomeScreen } from "../home/home-screen";
import { loadCatalogDetailPresentation } from "../detail/load-catalog-detail";
import { PreviewCatalogDetailOverlay } from "./preview-catalog-detail-overlay";
import { ProductShell, useProductShell } from "../product-shell/product-shell";
import { findTopic } from "../topics/topic";
import { ContentQuickActionsProvider } from "../quick-actions/content-quick-actions";
import type { ContentQuickActionEnvironment } from "../quick-actions/quick-action-types";

import { TopicDetail } from "../topics/topic-detail";

import type { T02pDevelopmentCatalogDestinationStates } from "./catalog-scenarios";
import type { CatalogDetailPresentationLoader } from "../detail/load-catalog-detail";
import type { ContentIdentity } from "@moya/contracts";
import type { ProductShellProfileOverlayRenderProps } from "../product-shell/product-shell";
import type { CatalogDetailPresentation } from "../detail/catalog-detail-presentation";
import type { ReactNode, RefObject } from "react";
import type { HomeCatalogState } from "../home/catalog-state";
import type { HomeFeed, HomeSurfaceData } from "../home/home-feed";
import type { PresentationPlatform } from "../shell/device-platform";

const PreviewHome = ({
  data,
  initialFeed,
  initialTopicId,
}: {
  readonly data: HomeSurfaceData;
  readonly initialFeed: HomeFeed;
  readonly initialTopicId: string | null;
}) => {
  return (
    <div data-product-panel="home">
      <HomeScreen
        data={data}
        initialFeed={initialFeed}
        initialTopicId={initialTopicId}
      />
    </div>
  );
};

const PreviewBrowse = ({ state }: { readonly state: HomeCatalogState }) => {
  const { feedLayout, openCatalog } = useProductShell();
  return (
    <div data-product-panel="inscriptions">
      <CatalogBrowseScreen
        feedLayout={feedLayout}
        kind="inscription"
        onOpenCatalog={(item, opener) => openCatalog(item.id, opener)}
        state={state}
      />
    </div>
  );
};

export interface T02pProductPreviewProps {
  readonly detailScopeKey?: string;
  readonly headerStart?: ReactNode;
  readonly headerEnd?: ReactNode;
  readonly renderProfileOverlay?: (
    properties: ProductShellProfileOverlayRenderProps,
  ) => ReactNode;
  readonly workDetailLoader?: CatalogDetailPresentationLoader;
  readonly renderDiscussion?: (target: ContentIdentity) => ReactNode;
  readonly renderDetailActions?: (
    detail: CatalogDetailPresentation,
    refresh: () => void,
  ) => ReactNode;
  readonly discoveryHome?: ReactNode;
  readonly filteredInscriptions?: ReactNode;
  readonly catalogDetailLoader?: CatalogDetailPresentationLoader;
  readonly developmentPlatformOverride?: PresentationPlatform | null;
  readonly initialPlatform: PresentationPlatform;
  readonly initialHomeFeed?: HomeFeed;
  readonly initialTopicId?: string | null;
  readonly productUtility?: ReactNode;
  readonly navigationAction?: ReactNode;
  readonly quickActions?: ContentQuickActionEnvironment;
  readonly renderCommentSection?: (catalogId: string) => ReactNode;
  readonly showDevelopmentPagerControls?: boolean;
  readonly states: T02pDevelopmentCatalogDestinationStates;
}

export const T02pProductPreview = ({
  catalogDetailLoader = loadCatalogDetailPresentation,
  detailScopeKey = "catalog",
  headerStart,
  headerEnd,
  renderProfileOverlay,
  workDetailLoader,
  renderDiscussion,
  renderDetailActions,
  discoveryHome,
  filteredInscriptions,
  developmentPlatformOverride = null,
  initialPlatform,
  initialHomeFeed = "discover",
  initialTopicId = null,
  productUtility,
  navigationAction,
  quickActions,
  renderCommentSection,
  showDevelopmentPagerControls = false,
  states,
}: T02pProductPreviewProps) => (
  <div data-clean-product-preview="">
    <ProductShell
      calligraphy={
        <div data-product-panel="calligraphy">
          <ContentQuickActionsProvider environment={quickActions}>
            <CalligraphyCategoryScreen
              data={states.calligraphy}
              headerStart={headerStart}
              headerEnd={headerEnd}
            />
          </ContentQuickActionsProvider>
        </div>
      }
      developmentPlatformOverride={developmentPlatformOverride}
      home={
        <ContentQuickActionsProvider environment={quickActions}>
          {discoveryHome ?? (
            <PreviewHome
              data={states.home}
              initialFeed={initialHomeFeed}
              initialTopicId={initialTopicId}
            />
          )}
        </ContentQuickActionsProvider>
      }
      initialPlatform={initialPlatform}
      primaryUtility={productUtility}
      navigationAction={navigationAction}
      inscriptions={
        filteredInscriptions ?? <PreviewBrowse state={states.inscriptions} />
      }
      {...(renderProfileOverlay ? { renderProfileOverlay } : {})}
      showDevelopmentPagerControls={showDevelopmentPagerControls}
      renderDetailOverlay={({
        backButtonRef,
        target,
        initialScrollTop,
        navigationRevision,
        onClose,
        onScrollTopChange,
      }) => (
        <PreviewCatalogDetailOverlay
          backButtonRef={backButtonRef}
          key={`${detailScopeKey}:${target.type}:${target.id}:${navigationRevision}`}
          catalogId={target.id}
          commentSection={
            renderDiscussion?.(target) ??
            (target.type === "catalog"
              ? renderCommentSection?.(target.id)
              : undefined)
          }
          {...(renderDetailActions
            ? { renderActions: renderDetailActions }
            : {})}
          initialScrollTop={initialScrollTop}
          loader={
            target.type === "work"
              ? (workDetailLoader ?? unavailableDetailLoader)
              : catalogDetailLoader
          }
          onClose={onClose}
          onScrollTopChange={onScrollTopChange}
        />
      )}
      renderTopicOverlay={({ backButtonRef, onClose, topicId }) => (
        <PreviewTopicOverlay
          backButtonRef={backButtonRef}
          onClose={onClose}
          topicId={topicId}
          topicsState={states.home.topics}
        />
      )}
    />
  </div>
);

const PreviewTopicOverlay = ({
  backButtonRef,
  onClose,
  topicId,
  topicsState,
}: {
  readonly backButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onClose: () => void;
  readonly topicId: string;
  readonly topicsState: HomeSurfaceData["topics"];
}) => {
  const { feedLayout, platform } = useProductShell();
  const topics = topicsState.state === "populated" ? topicsState.items : [];
  return (
    <TopicDetail
      backButtonRef={backButtonRef}
      feedLayout={feedLayout}
      onClose={onClose}
      platform={platform}
      topic={findTopic(topics, topicId)}
    />
  );
};

const unavailableDetailLoader: CatalogDetailPresentationLoader = async () => ({
  state: "not-found",
});
