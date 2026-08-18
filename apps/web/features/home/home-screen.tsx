import { Icon, ResponsiveNavigation } from "@moya/ui";

import { CatalogMedia } from "./catalog-media";
import { HomePreferences } from "./home-preferences";
import styles from "./home-screen.module.css";

import type { CatalogPage, CatalogSummary } from "@moya/contracts";
import type { HomeCatalogState } from "./catalog-state";

export interface HomeScreenProps {
  state: HomeCatalogState;
}

const CatalogItem = ({ item }: { item: CatalogSummary }) => (
  <article className={styles.card} role="listitem">
    <CatalogMedia media={item.representativeMedia} />
    <div className={styles.cardBody}>
      <h3>{item.title}</h3>
      {item.periodLabel === undefined ? null : (
        <p className={styles.period}>{item.periodLabel}</p>
      )}
    </div>
  </article>
);

const PopulatedCatalog = ({ page }: { page: CatalogPage }) => (
  <section aria-labelledby="catalog-heading" className={styles.catalogSection}>
    <h2 className="yoyi-visually-hidden" id="catalog-heading">
      目录内容
    </h2>
    <div className={styles.wall} role="list">
      {page.items.map((item) => (
        <CatalogItem key={item.id} item={item} />
      ))}
    </div>
  </section>
);

const navigationItems = [
  {
    id: "home",
    label: "首页",
    labelMark: "nav-home",
    icon: "home",
    href: "/",
  },
  {
    id: "inscriptions",
    label: "碑刻",
    labelMark: "nav-inscriptions",
    icon: "inscriptions",
    disabled: true,
  },
  {
    id: "calligraphy",
    label: "书帖",
    labelMark: "nav-calligraphy",
    icon: "calligraphy",
    disabled: true,
  },
] as const;

const HomeState = ({
  kind,
}: {
  kind: "empty" | "unavailable" | "unexpected-error";
}) => {
  const copy = {
    empty: {
      icon: "empty",
      title: "暂无公开档案",
      description: "当前没有可展示的公开内容。",
      role: undefined,
    },
    unavailable: {
      icon: "error",
      title: "档案服务暂时不可用",
      description: "请稍后再试。",
      role: "status",
    },
    "unexpected-error": {
      icon: "error",
      title: "无法加载公开档案",
      description: "发生了未预期的错误。",
      role: "alert",
    },
  } as const;
  const state = copy[kind];

  return (
    <section
      aria-labelledby={`${kind}-heading`}
      className={styles.state}
      data-home-state={kind}
      role={state.role}
    >
      <Icon name={state.icon} size="lg" />
      <h2 id={`${kind}-heading`}>{state.title}</h2>
      <p>{state.description}</p>
    </section>
  );
};

export const HomeScreen = ({ state }: HomeScreenProps) => {
  let content;

  switch (state.state) {
    case "populated":
      content = <PopulatedCatalog page={state.page} />;
      break;
    case "empty":
      content = <HomeState kind="empty" />;
      break;
    case "unavailable":
      content = <HomeState kind="unavailable" />;
      break;
    case "unexpected-error":
      content = <HomeState kind="unexpected-error" />;
      break;
  }

  return (
    <div className={styles.shell}>
      <header className={styles.homeTopBar}>
        <div
          aria-label="首页内容范围"
          className={styles.homeTabs}
          role="tablist"
        >
          <button
            aria-selected="true"
            className={styles.activeTab}
            role="tab"
            type="button"
          >
            发现
          </button>
          <button
            aria-disabled="true"
            aria-selected="false"
            disabled
            role="tab"
            type="button"
          >
            附近
          </button>
          <button
            aria-disabled="true"
            aria-selected="false"
            disabled
            role="tab"
            type="button"
          >
            专题
          </button>
        </div>
        <HomePreferences />
      </header>
      <main className={styles.main}>{content}</main>
      <ResponsiveNavigation
        activeId="home"
        composition="floating-bottom"
        items={[...navigationItems]}
        minimizeBehavior="on-scroll-down"
      />
    </div>
  );
};
