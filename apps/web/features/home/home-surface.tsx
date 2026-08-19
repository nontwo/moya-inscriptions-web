"use client";

import { useRef, useState, type PointerEvent, type ReactNode } from "react";

import styles from "./home-screen.module.css";

export type HomeFeed = "discover" | "nearby" | "topics";

const feeds: readonly HomeFeed[] = ["discover", "nearby", "topics"];
const feedLabels: Record<HomeFeed, string> = {
  discover: "发现",
  nearby: "附近",
  topics: "专题",
};

const icon = (name: string) => (
  <span aria-hidden="true" className="yoyi-icon" data-icon={name} />
);

export function HomeSurface({
  discover,
  nearby,
  topics,
  onOpenSettings,
}: {
  discover: ReactNode;
  nearby: ReactNode;
  topics: ReactNode;
  onOpenSettings: () => void;
}) {
  const [feed, setFeed] = useState<HomeFeed>("discover");
  const pointerStart = useRef<{ x: number; y: number } | undefined>(undefined);

  const selectFeed = (next: HomeFeed) => {
    setFeed(next);
    requestAnimationFrame(() =>
      window.dispatchEvent(new Event("yoyi:layoutchange")),
    );
  };

  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button,input,a")) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event: PointerEvent<HTMLElement>) => {
    const start = pointerStart.current;
    pointerStart.current = undefined;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 52 || Math.abs(dx) <= Math.abs(dy) * 1.2) return;
    const current = feeds.indexOf(feed);
    const next = Math.max(
      0,
      Math.min(feeds.length - 1, current + (dx < 0 ? 1 : -1)),
    );
    selectFeed(feeds[next] ?? feed);
  };

  return (
    <section
      aria-label="首页"
      className={styles.homeSurface}
      data-product-surface="home"
    >
      <header className={styles.topBar}>
        <div aria-label="首页内容范围" className={styles.tabs} role="tablist">
          {feeds.map((value) => (
            <button
              aria-controls={`home-panel-${value}`}
              aria-label={feedLabels[value]}
              aria-selected={feed === value}
              className={feed === value ? styles.selectedTab : undefined}
              id={`home-tab-${value}`}
              key={value}
              onClick={() => selectFeed(value)}
              role="tab"
              type="button"
            >
              <span>{feedLabels[value]}</span>
            </button>
          ))}
        </div>
        <button
          aria-label="打开设置"
          className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md"
          data-settings-trigger
          onClick={onOpenSettings}
          type="button"
        >
          {icon("settings")}
        </button>
      </header>
      <div
        className={styles.homePager}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {feeds.map((value) => (
          <main
            aria-labelledby={`home-tab-${value}`}
            className={styles.scroll}
            data-home-feed={value}
            data-surface-scroll={`home:${value}`}
            hidden={feed !== value}
            id={`home-panel-${value}`}
            key={value}
            role="tabpanel"
          >
            {value === "discover"
              ? discover
              : value === "nearby"
                ? nearby
                : topics}
          </main>
        ))}
      </div>
    </section>
  );
}
