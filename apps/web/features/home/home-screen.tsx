"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CatalogCard, isUltraWideCatalogMedia } from "./catalog-card";
import { CatalogMasonry } from "./catalog-masonry";
import { HomeContentCard } from "./home-content-card";
import { HomeFeedPager } from "./home-feed-pager";
import { homeFeeds, parseHomeFeed } from "./home-feed";
import styles from "./home-screen.module.css";
import { useProductShell } from "../product-shell/product-shell";
import { TopicCard } from "../topics/topic-card";

import type { ReactNode } from "react";
import type { CatalogSummary } from "@moya/contracts";
import type {
  HomeFeed,
  HomeFeedState,
  HomeSurfaceData,
  NearbyCard,
} from "./home-feed";
import type { Topic } from "../topics/topic";

const feedLabels = {
  discover: "发现",
  nearby: "附近",
  topics: "专题",
} as const satisfies Record<HomeFeed, string>;

const feedMessages = {
  discover: {
    empty: ["暂无公开档案", "当前没有可展示的公开内容。"],
    unavailable: ["档案服务暂时不可用", "请稍后再试。"],
    unexpectedError: ["无法加载公开档案", "发生了未预期的错误。"],
  },
  nearby: {
    empty: ["附近暂无内容", "当前没有可展示的附近内容。"],
    unavailable: ["附近内容尚未接入", "真实位置服务尚未提供。"],
    unexpectedError: ["无法加载附近内容", "发生了未预期的错误。"],
  },
  topics: {
    empty: ["暂无专题", "当前没有可展示的专题。"],
    unavailable: ["专题内容尚未接入", "真实策展内容服务尚未提供。"],
    unexpectedError: ["无法加载专题", "发生了未预期的错误。"],
  },
} as const;

const FeedMessage = ({
  feed,
  state,
}: {
  readonly feed: HomeFeed;
  readonly state: "empty" | "loading" | "unavailable" | "unexpected-error";
}) => {
  if (state === "loading") {
    return (
      <section
        className={styles.stateMessage}
        data-home-feed-state="loading"
        role="status"
      >
        <span className={styles.stateMark} aria-hidden="true">
          ···
        </span>
        <h2>正在加载</h2>
      </section>
    );
  }
  const copy = feedMessages[feed];
  const [title, description] =
    state === "unexpected-error" ? copy.unexpectedError : copy[state];
  return (
    <section
      className={styles.stateMessage}
      data-home-feed-state={state}
      role={state === "unexpected-error" ? "alert" : "status"}
    >
      <span className={styles.stateMark} aria-hidden="true">
        {state === "empty" ? "空" : "!"}
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
};

const renderFeedState = <T,>(
  feed: HomeFeed,
  state: HomeFeedState<T>,
  populated: (items: readonly T[]) => ReactNode,
) => {
  if (state.state === "populated") return populated(state.items);
  return <FeedMessage feed={feed} state={state.state} />;
};

export interface HomeScreenProps {
  readonly data: HomeSurfaceData;
  readonly initialFeed?: HomeFeed;
  readonly initialTopicId?: string | null;
}

export const HomeScreen = ({
  data,
  initialFeed = "discover",
  initialTopicId = null,
}: HomeScreenProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const initializedTopicRef = useRef(false);
  const initialTopicFrameRef = useRef<number | null>(null);
  const activeFeedRef = useRef<HomeFeed>(parseHomeFeed(initialFeed));
  const scrollPositionsRef = useRef<Record<HomeFeed, number>>({
    discover: 0,
    nearby: 0,
    topics: 0,
  });
  const {
    activeTopicId,
    feedLayout,
    openTopic,
    platform,
    readActiveScrollTop,
    registerTopicOpener,
    restoreActiveScrollTop,
  } = useProductShell();
  const [activeFeed, setActiveFeed] = useState<HomeFeed>(() =>
    parseHomeFeed(initialFeed),
  );
  activeFeedRef.current = activeFeed;

  const commitFeed = useCallback(
    (feed: HomeFeed) => {
      if (feed === activeFeed) return;
      scrollPositionsRef.current[activeFeed] = readActiveScrollTop();
      setActiveFeed(feed);
      restoreActiveScrollTop(scrollPositionsRef.current[feed]);
    },
    [activeFeed, readActiveScrollTop, restoreActiveScrollTop],
  );

  const openTopicFromCard = useCallback(
    (topic: Topic, opener: HTMLButtonElement) => {
      const scrollTop = readActiveScrollTop();
      scrollPositionsRef.current.topics = scrollTop;
      openTopic(topic.id, opener, scrollTop);
    },
    [openTopic, readActiveScrollTop],
  );

  useEffect(() => {
    if (activeTopicId !== null && activeFeed !== "topics") {
      setActiveFeed("topics");
      restoreActiveScrollTop(scrollPositionsRef.current.topics);
    }
  }, [activeFeed, activeTopicId, restoreActiveScrollTop]);

  useEffect(() => {
    if (activeTopicId === null) return;
    const opener = Array.from(
      rootRef.current?.querySelectorAll<HTMLButtonElement>("[data-topic-id]") ??
        [],
    ).find((button) => button.dataset.topicId === activeTopicId);
    if (opener !== undefined) registerTopicOpener(activeTopicId, opener);
  }, [activeTopicId, registerTopicOpener]);

  useEffect(() => {
    if (initialTopicId === null || initializedTopicRef.current) return;
    initializedTopicRef.current = true;
    if (activeFeed !== "topics") setActiveFeed("topics");
    initialTopicFrameRef.current = window.requestAnimationFrame(() => {
      initialTopicFrameRef.current = null;
      const opener =
        Array.from(
          rootRef.current?.querySelectorAll<HTMLButtonElement>(
            "[data-topic-id]",
          ) ?? [],
        ).find((button) => button.dataset.topicId === initialTopicId) ??
        rootRef.current;
      if (opener !== null) {
        const scrollTop = scrollPositionsRef.current.topics;
        openTopic(initialTopicId, opener, scrollTop);
      }
    });
  }, [activeFeed, initialTopicId, openTopic]);

  useEffect(
    () => () => {
      if (initialTopicFrameRef.current !== null) {
        window.cancelAnimationFrame(initialTopicFrameRef.current);
      }
    },
    [],
  );

  const panels = {
    discover: renderFeedState(
      "discover",
      data.discover,
      (items: readonly CatalogSummary[]) => (
        <CatalogMasonry
          feedLayout={feedLayout}
          getKey={(item) => item.id}
          isFullSpan={(item) =>
            isUltraWideCatalogMedia(item.representativeMedia)
          }
          items={items}
          platform={platform}
          renderItem={(item, onMediaSettled) => (
            <CatalogCard
              item={item}
              onMediaSettled={onMediaSettled}
              variant="feed"
            />
          )}
        />
      ),
    ),
    nearby: renderFeedState(
      "nearby",
      data.nearby,
      (items: readonly NearbyCard[]) => (
        <CatalogMasonry
          feedLayout={feedLayout}
          getKey={(item) => item.id}
          isFullSpan={(item) => isUltraWideCatalogMedia(item.media)}
          items={items}
          platform={platform}
          renderItem={(item, onMediaSettled) => (
            <HomeContentCard item={item} onMediaSettled={onMediaSettled} />
          )}
        />
      ),
    ),
    topics: renderFeedState(
      "topics",
      data.topics,
      (items: readonly Topic[]) => (
        <CatalogMasonry
          feedLayout={feedLayout}
          getKey={(topic) => topic.id}
          isFullSpan={(topic) => isUltraWideCatalogMedia(topic.cover)}
          items={items}
          platform={platform}
          renderItem={(topic, onMediaSettled) => (
            <TopicCard
              onMediaSettled={onMediaSettled}
              onOpen={openTopicFromCard}
              topic={topic}
            />
          )}
        />
      ),
    ),
  } satisfies Readonly<Record<HomeFeed, ReactNode>>;

  return (
    <div
      ref={rootRef}
      className={styles.homeSurface}
      data-active-home-feed={activeFeed}
      data-home-surface=""
      tabIndex={-1}
    >
      <header className={styles.homeHeader}>
        <div aria-label="首页内容范围" className={styles.tabs} role="tablist">
          {homeFeeds.map((feed) => {
            const selected = activeFeed === feed;
            return (
              <button
                key={feed}
                type="button"
                aria-controls={`home-panel-${feed}`}
                aria-selected={selected}
                className={selected ? styles.selectedTab : styles.tab}
                data-home-feed-tab={feed}
                id={`home-tab-${feed}`}
                onClick={() => commitFeed(feed)}
                role="tab"
              >
                {feedLabels[feed]}
              </button>
            );
          })}
        </div>
        <span aria-hidden="true" className={styles.settingsClearance} />
      </header>
      <HomeFeedPager
        activeFeed={activeFeed}
        onCommit={commitFeed}
        panels={panels}
        platform={platform}
      />
    </div>
  );
};
