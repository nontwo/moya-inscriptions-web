import styles from "./home-screen.module.css";

import type { CatalogPage, CatalogSummary } from "@moya/contracts";
import type { HomeCatalogState } from "./catalog-state";

export interface HomeScreenProps {
  state: HomeCatalogState;
}

const CatalogItem = ({ item }: { item: CatalogSummary }) => (
  <li>
    <article>
      {item.representativeMedia === undefined ? (
        <p>暂无公开图像</p>
      ) : (
        <img
          className={styles.media}
          src={item.representativeMedia.src}
          alt={item.representativeMedia.alt}
          width={item.representativeMedia.width}
          height={item.representativeMedia.height}
        />
      )}
      <h3>{item.title}</h3>
      {item.periodLabel === undefined ? null : <p>{item.periodLabel}</p>}
      {item.summary === undefined ? null : <p>{item.summary}</p>}
    </article>
  </li>
);

const PopulatedCatalog = ({ page }: { page: CatalogPage }) => (
  <section aria-labelledby="catalog-heading">
    <h2 id="catalog-heading">公开档案</h2>
    <ul>
      {page.items.map((item) => (
        <CatalogItem key={item.id} item={item} />
      ))}
    </ul>
  </section>
);

export const HomeScreen = ({ state }: HomeScreenProps) => {
  let content;

  switch (state.state) {
    case "populated":
      content = <PopulatedCatalog page={state.page} />;
      break;
    case "empty":
      content = (
        <section aria-labelledby="empty-heading">
          <h2 id="empty-heading">暂无公开档案</h2>
          <p>当前没有可展示的公开内容。</p>
        </section>
      );
      break;
    case "unavailable":
      content = (
        <section aria-labelledby="unavailable-heading" role="status">
          <h2 id="unavailable-heading">档案服务暂时不可用</h2>
          <p>请稍后再试。</p>
        </section>
      );
      break;
    case "unexpected-error":
      content = (
        <section aria-labelledby="error-heading" role="alert">
          <h2 id="error-heading">无法加载公开档案</h2>
          <p>发生了未预期的错误。</p>
        </section>
      );
      break;
  }

  return (
    <main>
      <h1>摩崖碑刻数字平台</h1>
      {content}
    </main>
  );
};
