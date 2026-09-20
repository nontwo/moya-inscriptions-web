"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@moya/ui";
import { AnimatedTopTabs } from "../shell/animated-top-tabs";
import { HorizontalPager } from "../shell/horizontal-pager";
import type { HorizontalPagerHandle } from "../shell/horizontal-pager";
import type { ReactNode } from "react";
import type { HomeSurfaceData } from "./home-feed";
import { useProductShell } from "../product-shell/product-shell";
import { CatalogMasonry } from "./catalog-masonry";
import { TopicCard } from "../topics/topic-card";
import styles from "./home-screen.module.css";
const feeds = ["news", "threads", "topics"] as const;
type DiscussionFeed = (typeof feeds)[number];
const labels = { news: "近闻", threads: "话题", topics: "专题" };
const icons = {
  news: "news",
  threads: "discussion",
  topics: "academic-cap",
} as const;
export function DiscussionScreen({
  data,
  headerStart,
  headerEnd,
  initialTopicId = null,
}: {
  readonly data: HomeSurfaceData["topics"];
  readonly headerStart?: ReactNode;
  readonly headerEnd?: ReactNode;
  readonly initialTopicId?: string | null;
}) {
  const shell = useProductShell();
  const root = useRef<HTMLDivElement>(null);
  const pager = useRef<HorizontalPagerHandle<DiscussionFeed>>(null);
  const [active, setActive] = useState<DiscussionFeed>(
    initialTopicId ? "topics" : "news",
  );
  const [progress, setProgress] = useState(initialTopicId ? 2 : 0);
  const openedInitial = useRef(false);
  const positions = useRef<Record<DiscussionFeed, number>>({
    news: 0,
    threads: 0,
    topics: 0,
  });
  const commit = useCallback(
    (next: DiscussionFeed) => {
      if (shell.platform === "pc")
        positions.current[active] = shell.readActiveScrollTop();
      setActive(next);
      if (shell.platform === "pc")
        shell.restoreActiveScrollTop(positions.current[next]);
    },
    [active, shell],
  );
  useEffect(() => {
    if (shell.activeTopicId !== null && active !== "topics")
      pager.current?.scrollToKey("topics");
    const opener = Array.from(
      root.current?.querySelectorAll<HTMLButtonElement>("[data-topic-id]") ??
        [],
    ).find((button) => button.dataset.topicId === shell.activeTopicId);
    if (opener && shell.activeTopicId)
      shell.registerTopicOpener(shell.activeTopicId, opener);
  }, [active, shell.activeTopicId, shell.registerTopicOpener]);
  useEffect(() => {
    if (!initialTopicId || openedInitial.current) return;
    if (shell.activeDestination !== "discussion") {
      shell.navigatePrimary("discussion");
      return;
    }
    const frame = requestAnimationFrame(() => {
      if (openedInitial.current || !root.current) return;
      openedInitial.current = true;
      const opener =
        Array.from(
          root.current.querySelectorAll<HTMLButtonElement>("[data-topic-id]"),
        ).find((button) => button.dataset.topicId === initialTopicId) ??
        root.current;
      shell.openTopic(initialTopicId, opener, 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [
    initialTopicId,
    shell.activeDestination,
    shell.navigatePrimary,
    shell.openTopic,
  ]);
  const topics =
    data.state === "populated" ? (
      <CatalogMasonry
        feedLayout={shell.feedLayout}
        getKey={(topic) => topic.id}
        spanAtAlignedRows
        items={data.items}
        platform={shell.platform}
        renderItem={(topic, onMediaSettled) => (
          <TopicCard
            topic={topic}
            onMediaSettled={onMediaSettled}
            onOpen={(item, opener) =>
              shell.openTopic(item.id, opener, shell.readActiveScrollTop())
            }
          />
        )}
      />
    ) : (
      <section
        className={styles.stateMessage}
        role={data.state === "unexpected-error" ? "alert" : "status"}
      >
        <h2>
          {data.state === "loading"
            ? "正在加载"
            : data.state === "empty"
              ? "暂无专题"
              : "专题暂时不可用"}
        </h2>
      </section>
    );
  return (
    <div
      ref={root}
      className={styles.homeSurface}
      data-home-platform={shell.platform}
      data-discussion-surface=""
      data-active-discussion-feed={active}
    >
      <header className={styles.homeHeader} data-author-bar="">
        {headerStart ?? <span />}
        <AnimatedTopTabs
          items={feeds.map((id) => ({
            id,
            label: labels[id],
            icon: <Icon name={icons[id]} aria-hidden="true" />,
          }))}
          activeKey={active}
          progress={progress}
          onSelect={(id) => pager.current?.scrollToKey(id)}
          ariaLabel="讨论内容范围"
          idPrefix="discussion"
        />
        {headerEnd ?? <span />}
      </header>
      <HorizontalPager
        ref={pager}
        keys={feeds}
        activeKey={active}
        onCommit={commit}
        onProgress={setProgress}
        panels={{ news: null, threads: null, topics }}
        platform={shell.platform}
        visible={shell.activeDestination === "discussion"}
        scrollOwner={shell.platform === "pc" ? "document" : "panel"}
        registerActiveScrollElement={
          shell.registerActiveDiscussionScrollElement
        }
        panelClassName={styles.feedPanel}
        panelId={(id) => `discussion-panel-${id}`}
        panelLabelledBy={(id) => `discussion-tab-${id}`}
        diagnosticPrefix="discussion"
      />
    </div>
  );
}
