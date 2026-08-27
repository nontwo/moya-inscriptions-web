"use client";

import { CatalogBrowseScreen } from "../home/catalog-screen";
import { HomeScreen } from "../home/home-screen";
import { ProductShell, useProductShell } from "../product-shell/product-shell";
import { findTopic } from "../topics/topic";
import { TopicDetail } from "../topics/topic-detail";

import type { T02pDevelopmentCatalogDestinationStates } from "./catalog-scenarios";
import type { RefObject } from "react";
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

const PreviewBrowse = ({
  kind,
  state,
}: {
  readonly kind: "inscription" | "calligraphy";
  readonly state: HomeCatalogState;
}) => {
  const { feedLayout } = useProductShell();
  return (
    <div
      data-product-panel={
        kind === "inscription" ? "inscriptions" : "calligraphy"
      }
    >
      <CatalogBrowseScreen feedLayout={feedLayout} kind={kind} state={state} />
    </div>
  );
};

export interface T02pProductPreviewProps {
  readonly developmentPlatformOverride?: PresentationPlatform | null;
  readonly initialPlatform: PresentationPlatform;
  readonly initialHomeFeed?: HomeFeed;
  readonly initialTopicId?: string | null;
  readonly showDevelopmentPagerControls?: boolean;
  readonly states: T02pDevelopmentCatalogDestinationStates;
}

export const T02pProductPreview = ({
  developmentPlatformOverride = null,
  initialPlatform,
  initialHomeFeed = "discover",
  initialTopicId = null,
  showDevelopmentPagerControls = false,
  states,
}: T02pProductPreviewProps) => (
  <div data-clean-product-preview="">
    <ProductShell
      calligraphy={
        <PreviewBrowse kind="calligraphy" state={states.calligraphy} />
      }
      developmentPlatformOverride={developmentPlatformOverride}
      home={
        <PreviewHome
          data={states.home}
          initialFeed={initialHomeFeed}
          initialTopicId={initialTopicId}
        />
      }
      initialPlatform={initialPlatform}
      inscriptions={
        <PreviewBrowse kind="inscription" state={states.inscriptions} />
      }
      showDevelopmentPagerControls={showDevelopmentPagerControls}
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
