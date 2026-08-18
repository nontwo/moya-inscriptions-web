import {
  Card,
  ContentSection,
  Icon,
  MasonryLikeGrid,
  PageContainer,
  ResponsiveNavigation,
  YoyiLogo,
} from "@moya/ui";

import { CatalogMedia } from "./catalog-media";
import styles from "./home-screen.module.css";

import type { CatalogPage, CatalogSummary } from "@moya/contracts";
import type { HomeCatalogState } from "./catalog-state";

export interface HomeScreenProps {
  state: HomeCatalogState;
}

const CatalogItem = ({ item }: { item: CatalogSummary }) => (
  <Card className={styles.card} role="listitem">
    <CatalogMedia media={item.representativeMedia} />
    <div className={styles.cardBody}>
      <h3>{item.title}</h3>
      {item.periodLabel === undefined ? null : (
        <p className={styles.period}>{item.periodLabel}</p>
      )}
      {item.summary === undefined ? null : (
        <p className={styles.summary}>{item.summary}</p>
      )}
    </div>
  </Card>
);

const PopulatedCatalog = ({ page }: { page: CatalogPage }) => (
  <ContentSection
    aria-label="公开档案"
    className={styles.catalogSection}
    title="公开档案"
  >
    <MasonryLikeGrid density="compact" role="list">
      {page.items.map((item) => (
        <CatalogItem key={item.id} item={item} />
      ))}
    </MasonryLikeGrid>
  </ContentSection>
);

const navigationItems = [
  { id: "home", label: "首页", labelMark: "nav-home", href: "/" },
  {
    id: "inscriptions",
    label: "碑刻",
    labelMark: "nav-inscriptions",
    disabled: true,
  },
  {
    id: "calligraphy",
    label: "书帖",
    labelMark: "nav-calligraphy",
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
      <PageContainer className={styles.page}>
        <header className={styles.brand}>
          <YoyiLogo label="由艺" />
          <div>
            <p>由艺</p>
            <h1>摩崖碑刻数字档案</h1>
            <p>在纸墨与山石之间，浏览公开的碑刻与书迹档案。</p>
          </div>
        </header>
        <main>{content}</main>
      </PageContainer>
      <ResponsiveNavigation
        activeId="home"
        composition="floating-bottom"
        items={[...navigationItems]}
        minimizeBehavior="never"
      />
    </div>
  );
};
