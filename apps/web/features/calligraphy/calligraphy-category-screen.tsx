"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { CatalogCard, isUltraWideCatalogMedia } from "../home/catalog-card";
import { CatalogMasonry } from "../home/catalog-masonry";
import { useProductShell } from "../product-shell/product-shell";
import { CalligraphyCategoryPager } from "./calligraphy-category-pager";
import { calligraphyCategories } from "./calligraphy-category";
import styles from "./calligraphy-category.module.css";

import type { ReactNode } from "react";
import type { CatalogSummary } from "@moya/contracts";
import type { CalligraphyCategoryPagerHandle } from "./calligraphy-category-pager";
import type {
  CalligraphyCategory,
  CalligraphyCategoryState,
  CalligraphyCategorySurfaceData,
} from "./calligraphy-category";

const categoryLabels = {
  all: "全部",
  ink: "墨迹",
  rubbing: "拓本",
} as const satisfies Record<CalligraphyCategory, string>;

const CategoryMessage = ({
  category,
  state,
}: {
  readonly category: CalligraphyCategory;
  readonly state: Exclude<CalligraphyCategoryState["state"], "populated">;
}) => {
  const label = categoryLabels[category];
  const copy =
    state === "classification-unavailable"
      ? [`${label}分类数据尚未接入`, "当前公开目录尚未提供规范分类。"]
      : state === "empty"
        ? [
            category === "all" ? "暂无公开书帖" : `暂无${label}书帖`,
            "当前没有可展示的公开书帖。",
          ]
        : state === "unavailable"
          ? ["档案服务暂时不可用", "请稍后再试。"]
          : ["无法加载公开档案", "发生了未预期的错误。"];
  return (
    <section
      className={styles.stateMessage}
      data-calligraphy-category-state={state}
      role={state === "unexpected-error" ? "alert" : "status"}
    >
      <span aria-hidden="true" className={styles.stateMark}>
        {state === "empty" ? "空" : "!"}
      </span>
      <h2>{copy[0]}</h2>
      <p>{copy[1]}</p>
    </section>
  );
};

const renderCategory = (
  category: CalligraphyCategory,
  state: CalligraphyCategoryState,
  feedLayout: "single" | "double",
  platform: "phone" | "tablet" | "pc",
  openCatalog: (catalogId: string, opener: HTMLElement) => void,
): ReactNode => {
  if (state.state !== "populated") {
    return <CategoryMessage category={category} state={state.state} />;
  }
  const items = state.page.items.filter(({ kind }) => kind === "calligraphy");
  if (items.length === 0) {
    return <CategoryMessage category={category} state="empty" />;
  }
  return (
    <div className={styles.categoryFeed} data-feed-layout={feedLayout}>
      <CatalogMasonry<CatalogSummary>
        feedLayout={feedLayout}
        getKey={(item) => item.id}
        isFullSpan={(item) => isUltraWideCatalogMedia(item.representativeMedia)}
        items={items}
        platform={platform}
        renderItem={(item, onMediaSettled) => (
          <CatalogCard
            item={item}
            onMediaSettled={onMediaSettled}
            onOpenCatalog={(catalog, opener) => openCatalog(catalog.id, opener)}
            variant="feed"
          />
        )}
      />
    </div>
  );
};

export interface CalligraphyCategoryScreenProps {
  readonly data: CalligraphyCategorySurfaceData;
}

export const CalligraphyCategoryScreen = ({
  data,
}: CalligraphyCategoryScreenProps) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const pagerRef = useRef<CalligraphyCategoryPagerHandle>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const viewportSizeRef = useRef({ height: 0, width: 0 });
  const viewportRestoreFramesRef = useRef<number[]>([]);
  const viewportRestorePendingRef = useRef(false);
  const activeCategoryRef = useRef<CalligraphyCategory>("all");
  const scrollPositionsRef = useRef<Record<CalligraphyCategory, number>>({
    all: 0,
    ink: 0,
    rubbing: 0,
  });
  const {
    activeCatalogId,
    activeDestination,
    feedLayout,
    openCatalog,
    platform,
    readActiveScrollTop,
    restoreActiveScrollTop,
  } = useProductShell();
  const [activeCategory, setActiveCategory] =
    useState<CalligraphyCategory>("all");
  activeCategoryRef.current = activeCategory;

  const updateIndicator = useCallback((progress: number) => {
    const tabs = tabsRef.current;
    const indicator = indicatorRef.current;
    if (tabs === null || indicator === null) return;
    const width =
      tabs.getBoundingClientRect().width / calligraphyCategories.length;
    indicator.style.transform = `translate3d(${progress * width}px, 0, 0)`;
    indicator.dataset.calligraphyCategoryProgress = String(progress);
  }, []);

  useLayoutEffect(() => {
    updateIndicator(calligraphyCategories.indexOf(activeCategory));
  }, [activeCategory, updateIndicator]);

  useEffect(() => {
    if (activeDestination !== "calligraphy" || activeCatalogId !== null) {
      return undefined;
    }
    const destination = rootRef.current?.closest<HTMLElement>(
      '[data-primary-destination="calligraphy"]',
    );
    const scrollTarget: HTMLElement | Window | null =
      platform === "pc" ? window : (destination ?? null);
    if (scrollTarget === null) return undefined;
    viewportSizeRef.current = {
      height: window.innerHeight,
      width: window.innerWidth,
    };
    const recordScroll = () => {
      if (viewportRestorePendingRef.current) return;
      if (
        viewportSizeRef.current.height !== window.innerHeight ||
        viewportSizeRef.current.width !== window.innerWidth
      ) {
        return;
      }
      scrollPositionsRef.current[activeCategoryRef.current] =
        readActiveScrollTop();
    };
    scrollTarget.addEventListener("scroll", recordScroll, { passive: true });
    return () => scrollTarget.removeEventListener("scroll", recordScroll);
  }, [activeCatalogId, activeDestination, platform, readActiveScrollTop]);

  useEffect(() => {
    if (activeDestination !== "calligraphy" || activeCatalogId !== null) {
      return undefined;
    }
    const restoreAfterViewportChange = () => {
      viewportSizeRef.current = {
        height: window.innerHeight,
        width: window.innerWidth,
      };
      viewportRestorePendingRef.current = true;
      for (const frame of viewportRestoreFramesRef.current) {
        window.cancelAnimationFrame(frame);
      }
      viewportRestoreFramesRef.current = [];
      const desired = scrollPositionsRef.current[activeCategoryRef.current];
      const first = window.requestAnimationFrame(() => {
        restoreActiveScrollTop(desired);
        const second = window.requestAnimationFrame(() => {
          const third = window.requestAnimationFrame(() => {
            viewportRestorePendingRef.current = false;
            viewportRestoreFramesRef.current = [];
          });
          viewportRestoreFramesRef.current.push(third);
        });
        viewportRestoreFramesRef.current.push(second);
      });
      viewportRestoreFramesRef.current.push(first);
    };
    window.addEventListener("orientationchange", restoreAfterViewportChange);
    window.addEventListener("resize", restoreAfterViewportChange);
    return () => {
      window.removeEventListener(
        "orientationchange",
        restoreAfterViewportChange,
      );
      window.removeEventListener("resize", restoreAfterViewportChange);
      for (const frame of viewportRestoreFramesRef.current) {
        window.cancelAnimationFrame(frame);
      }
      viewportRestoreFramesRef.current = [];
      viewportRestorePendingRef.current = false;
    };
  }, [activeCatalogId, activeDestination, restoreActiveScrollTop]);

  const commitCategory = useCallback(
    (category: CalligraphyCategory) => {
      const current = activeCategoryRef.current;
      if (category === current) return;
      if (activeDestination === "calligraphy") {
        scrollPositionsRef.current[current] = readActiveScrollTop();
      }
      activeCategoryRef.current = category;
      setActiveCategory(category);
      if (activeDestination === "calligraphy") {
        restoreActiveScrollTop(scrollPositionsRef.current[category]);
      }
    },
    [activeDestination, readActiveScrollTop, restoreActiveScrollTop],
  );

  const panels = Object.fromEntries(
    calligraphyCategories.map((category) => [
      category,
      renderCategory(
        category,
        data.categories[category],
        feedLayout,
        platform,
        openCatalog,
      ),
    ]),
  ) as Record<CalligraphyCategory, ReactNode>;

  return (
    <div
      ref={rootRef}
      className={styles.surface}
      data-active-calligraphy-category={activeCategory}
      data-calligraphy-category-surface=""
      data-calligraphy-classification-source={data.classificationSource}
      data-calligraphy-platform={platform}
      tabIndex={-1}
    >
      <header className={styles.header}>
        <div
          ref={tabsRef}
          aria-label="书帖分类"
          className={styles.tabs}
          role="tablist"
        >
          <span
            ref={indicatorRef}
            aria-hidden="true"
            className={styles.indicator}
            data-calligraphy-category-indicator=""
          />
          {calligraphyCategories.map((category) => {
            const selected = activeCategory === category;
            return (
              <button
                key={category}
                type="button"
                aria-controls={`calligraphy-panel-${category}`}
                aria-selected={selected}
                className={selected ? styles.selectedTab : styles.tab}
                data-calligraphy-category-tab={category}
                id={`calligraphy-tab-${category}`}
                onClick={() => pagerRef.current?.scrollToCategory(category)}
                role="tab"
              >
                {categoryLabels[category]}
              </button>
            );
          })}
        </div>
      </header>
      <CalligraphyCategoryPager
        ref={pagerRef}
        activeCategory={activeCategory}
        onCommit={commitCategory}
        onProgress={updateIndicator}
        panels={panels}
        panelStates={{
          all: data.categories.all.state,
          ink: data.categories.ink.state,
          rubbing: data.categories.rubbing.state,
        }}
        platform={platform}
        primaryVisible={activeDestination === "calligraphy"}
      />
    </div>
  );
};
