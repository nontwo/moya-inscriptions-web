"use client";

import { CatalogBrowseScreen } from "../home/catalog-screen";
import { AllCalligraphyFeed } from "../calligraphy/calligraphy-category-screen";
import { HomeScreen } from "../home/home-screen";
import { DiscussionScreen } from "../home/discussion-screen";
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
import type {
  ProductShellEditorOverlayControls,
  ProductShellProfileOverlayRenderProps,
} from "../product-shell/product-shell";
import type { EditorTarget } from "../product-shell/product-history";
import type { CatalogDetailPresentation } from "../detail/catalog-detail-presentation";
import type { ReactNode, RefObject } from "react";
import type { HomeCatalogState } from "../home/catalog-state";
import type { HomeFeed, HomeSurfaceData } from "../home/home-feed";
import type { PresentationPlatform } from "../shell/device-platform";

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
  readonly renderEditorOverlay?: (
    target: EditorTarget,
    controls: ProductShellEditorOverlayControls,
  ) => ReactNode;
  readonly workDetailLoader?: CatalogDetailPresentationLoader;
  readonly renderDiscussion?: (target: ContentIdentity) => ReactNode;
  readonly renderDetailActions?: (
    detail: CatalogDetailPresentation,
    refresh: () => void,
  ) => ReactNode;
  readonly renderDiscover?: (active: boolean) => ReactNode;
  readonly renderInscriptions?: (active: boolean) => ReactNode;
  readonly userPage?: ReactNode;
  readonly catalogDetailLoader?: CatalogDetailPresentationLoader;
  readonly developmentPlatformOverride?: PresentationPlatform | null;
  readonly initialPlatform: PresentationPlatform;
  readonly initialHomeFeed?: HomeFeed;
  readonly onHomeFeedChange?: (feed: HomeFeed) => void;
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
  renderEditorOverlay,
  workDetailLoader,
  renderDiscussion,
  renderDetailActions,
  renderDiscover,
  renderInscriptions,
  userPage,
  developmentPlatformOverride = null,
  initialPlatform,
  initialHomeFeed = "discover",
  onHomeFeedChange,
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
      discussion={
        <div data-product-panel="discussion">
          <ContentQuickActionsProvider environment={quickActions}>
            <DiscussionScreen
              data={states.home.topics}
              headerStart={headerStart}
              headerEnd={headerEnd}
              initialTopicId={initialTopicId}
            />
          </ContentQuickActionsProvider>
        </div>
      }
      user={
        userPage ?? (
          <section className="phase4-page">
            <h1>用户</h1>
            <p>登录后查看个人主页。</p>
          </section>
        )
      }
      developmentPlatformOverride={developmentPlatformOverride}
      home={
        <div data-product-panel="home">
          <ContentQuickActionsProvider environment={quickActions}>
            <HomeScreen
              data={states.home}
              initialFeed={initialHomeFeed}
              {...(onHomeFeedChange ? { onFeedChange: onHomeFeedChange } : {})}
              headerStart={headerStart}
              headerEnd={headerEnd}
              {...(renderDiscover ? { renderDiscover } : {})}
              renderInscriptions={
                renderInscriptions ??
                (() => <PreviewBrowse state={states.inscriptions} />)
              }
              calligraphy={<AllCalligraphyFeed data={states.calligraphy} />}
            />
          </ContentQuickActionsProvider>
        </div>
      }
      initialPlatform={initialPlatform}
      primaryUtility={productUtility}
      navigationAction={navigationAction}
      {...(renderProfileOverlay ? { renderProfileOverlay } : {})}
      {...(renderEditorOverlay ? { renderEditorOverlay } : {})}
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
