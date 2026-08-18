import { CatalogMedia } from "./catalog-media";
import { HomeMasonry } from "./home-masonry";
import styles from "./home-screen.module.css";
import { HomeShell } from "./home-shell";

import type { CatalogPage, CatalogSummary } from "@moya/contracts";
import type { HomeCatalogState } from "./catalog-state";

export interface HomeScreenProps {
  state: HomeCatalogState;
}

const CatalogItem = ({ item }: { item: CatalogSummary }) => (
  <article className={styles.card} data-home-card role="listitem">
    <CatalogMedia media={item.representativeMedia} />
    <div className={styles.cardCaption}>
      <h3 className={styles.cardTitle}>{item.title}</h3>
      {item.periodLabel === undefined ? null : (
        <p className={styles.cardMeta}>{item.periodLabel}</p>
      )}
    </div>
  </article>
);

const PopulatedCatalog = ({ page }: { page: CatalogPage }) => (
  <section aria-labelledby="catalog-heading" className={styles.catalogSection}>
    <h1 className="yoyi-visually-hidden" id="catalog-heading">
      发现
    </h1>
    <HomeMasonry>
      {page.items.map((item) => (
        <CatalogItem key={item.id} item={item} />
      ))}
    </HomeMasonry>
  </section>
);

const HomeState = ({
  kind,
}: {
  kind: "empty" | "unavailable" | "unexpected-error";
}) => {
  const copy = {
    empty: {
      title: "暂无公开档案",
      description: "当前没有可展示的公开内容。",
      role: "status",
    },
    unavailable: {
      title: "档案服务暂时不可用",
      description: "请稍后再试。",
      role: "status",
    },
    "unexpected-error": {
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
      <h1 className="yoyi-visually-hidden">发现</h1>
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

  return <HomeShell>{content}</HomeShell>;
};
