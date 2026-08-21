import { CatalogMediaGallery } from "./catalog-media-gallery";
import styles from "./catalog-detail-screen.module.css";

import type { CatalogDetail, PublicMedia } from "@moya/contracts";

export type CatalogDetailStatusKind =
  | "not-found"
  | "unavailable"
  | "unexpected-error";

const kindLabel = (kind: CatalogDetail["kind"]): string =>
  kind === "calligraphy" ? "书帖" : "碑刻";

const detailMedia = (detail: CatalogDetail): readonly PublicMedia[] =>
  detail.media.length > 0
    ? detail.media
    : detail.representativeMedia === undefined
      ? []
      : [detail.representativeMedia];

const regionLabel = (detail: CatalogDetail): string | undefined => {
  const region = [detail.province, detail.prefecture, detail.county].filter(
    (part): part is string => part !== undefined,
  );
  return region.length === 0 ? undefined : region.join(" · ");
};

const detailFacts = (detail: CatalogDetail) => {
  const facts: Array<{ label: string; value: string }> = [];
  if (detail.dynasty !== undefined)
    facts.push({ label: "朝代", value: detail.dynasty });
  if (detail.dateText !== undefined)
    facts.push({ label: "年代", value: detail.dateText });
  if (
    detail.dynasty === undefined &&
    detail.dateText === undefined &&
    detail.periodLabel !== undefined
  ) {
    facts.push({ label: "时期", value: detail.periodLabel });
  }

  const region = regionLabel(detail);
  if (region !== undefined) facts.push({ label: "地区", value: region });
  if (detail.currentLocation !== undefined)
    facts.push({ label: "现址", value: detail.currentLocation });
  if (detail.currentCustodian !== undefined)
    facts.push({ label: "保管 / 现藏单位", value: detail.currentCustodian });
  return facts;
};

export const CatalogDetailStatus = ({
  state,
}: {
  state: CatalogDetailStatusKind;
}) => {
  const content = {
    "not-found": {
      title: "未找到这项资料",
      description: "这项资料可能不存在，或已无法访问。",
    },
    unavailable: {
      title: "档案服务暂时不可用",
      description: "请稍后再试。",
    },
    "unexpected-error": {
      title: "无法加载这项资料",
      description: "发生了未预期的错误，请稍后再试。",
    },
  }[state];

  return (
    <main className={styles.screen}>
      <div className={styles.content}>
        <section
          aria-live={state === "unexpected-error" ? "assertive" : "polite"}
          className={styles.status}
          role={state === "unexpected-error" ? "alert" : "status"}
        >
          <h1>{content.title}</h1>
          <p>{content.description}</p>
          <div className={styles.statusActions}>
            {state === "not-found" ? null : (
              <a className={styles.actionLink} href="">
                重新加载
              </a>
            )}
            <a className={styles.actionLink} href="/">
              返回首页
            </a>
          </div>
        </section>
      </div>
    </main>
  );
};

export const CatalogDetailScreen = ({
  detail,
}: {
  detail: CatalogDetail;
}) => {
  const media = detailMedia(detail);
  const facts = detailFacts(detail);

  return (
    <main className={styles.screen}>
      <header className={styles.topbar}>
        <a className={styles.backLink} href="/">
          返回首页
        </a>
      </header>
      <div className={styles.content}>
        <section
          className={`${styles.hero}${media.length === 0 ? ` ${styles.heroWithoutMedia}` : ""}`}
        >
          {media.length === 0 ? null : <CatalogMediaGallery media={media} />}
          <article className={styles.identity}>
            <p className={styles.kind}>{kindLabel(detail.kind)}</p>
            <h1>{detail.title}</h1>
            {detail.aliases.length === 0 ? null : (
              <div className={styles.aliases}>
                <p>又名</p>
                <p>{detail.aliases.join(" · ")}</p>
              </div>
            )}
            {detail.summary === undefined ? null : (
              <p className={styles.summary}>{detail.summary}</p>
            )}
            {facts.length === 0 ? null : (
              <section className={styles.factsSection}>
                <h2>基本资料</h2>
                <dl className={styles.facts}>
                  {facts.map((fact) => (
                    <div key={fact.label}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </article>
        </section>
        {detail.description === undefined ? null : (
          <section className={styles.readingSection}>
            <h2>简介</h2>
            <p>{detail.description}</p>
          </section>
        )}
        {detail.sourceCitations.length === 0 ? null : (
          <section className={styles.readingSection}>
            <h2>资料来源</h2>
            <ul className={styles.sources}>
              {detail.sourceCitations.map((source, index) => (
                <li key={`${source.label}-${index}`}>
                  <strong>{source.label}</strong>
                  {source.citation === undefined ? null : (
                    <span>{source.citation}</span>
                  )}
                  {source.url === undefined ? null : (
                    <a href={source.url} rel="noreferrer" target="_blank">
                      查看来源
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
};
