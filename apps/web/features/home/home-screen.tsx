import { HomeCatalogCard } from "./home-catalog-card";
import styles from "./home-screen.module.css";
import { ContentWall } from "../../product-shell/content-wall";
import { ProductShell } from "../../product-shell/product-shell";

import type { CatalogPage } from "@moya/contracts";
import type { HomeCatalogState } from "./catalog-state";

export interface HomeScreenProps {
  state: HomeCatalogState;
}

const PopulatedCatalog = ({ page }: { page: CatalogPage }) => (
  <section aria-labelledby="catalog-heading" className={styles.catalogSection}>
    <h1 className="yoyi-visually-hidden" id="catalog-heading">
      发现
    </h1>
    <ContentWall label="公开档案">
      {page.items.map((item) => (
        <HomeCatalogCard key={item.id} item={item} />
      ))}
    </ContentWall>
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

  return <ProductShell homeDiscover={content} />;
};
