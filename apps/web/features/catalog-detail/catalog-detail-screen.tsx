import { CatalogMediaGallery } from "./catalog-media-gallery";
import styles from "./catalog-detail-screen.module.css";

import type { CatalogDetail, PublicMedia } from "@moya/contracts";

export type CatalogDetailStatusKind =
  "not-found" | "unavailable" | "unexpected-error";

type PresentationMedia = Pick<
  PublicMedia,
  "alt" | "height" | "src" | "width"
> & { key: string };

const qaMediaPresets: readonly (readonly [string, number, number])[] = [
  ["stone-detail.svg", 360, 610],
  ["inscription-rubbing.svg", 600, 420],
  ["discovery-stone.svg", 600, 760],
  ["cliff-gate.svg", 360, 520],
  ["valley-wall.svg", 360, 430],
  ["stele-shadow.svg", 360, 400],
  ["calligraphy-sheet.svg", 600, 760],
];

const qaMedia: readonly PresentationMedia[] = qaMediaPresets.map(
  ([file, width, height], index) => ({
    alt: `虚拟测试图，与真实记录无对应关系：${index + 1}`,
    height,
    key: `qa-demo-${index + 1}`,
    src: `/docs/design-system/assets/demo/${file}`,
    width,
  }),
);

const kindLabel = (kind: CatalogDetail["kind"]): string =>
  kind === "calligraphy" ? "书帖" : "碑刻";

const publicMedia = (detail: CatalogDetail): readonly PresentationMedia[] => {
  if (detail.media.length > 0)
    return detail.media.map(({ id, ...media }) => ({ key: id, ...media }));
  if (detail.representativeMedia !== undefined) {
    const { id, ...media } = detail.representativeMedia;
    return [{ key: id, ...media }];
  }
  return [];
};

const detailMedia = (
  detail: CatalogDetail,
  qa: boolean,
): readonly PresentationMedia[] => {
  const media = publicMedia(detail);
  return media.length > 0 || !qa ? media : qaMedia;
};

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
          <a className={styles.actionLink} href="/">
            返回首页
          </a>
        </section>
      </div>
    </main>
  );
};

export const CatalogDetailScreen = ({
  detail,
  qa = false,
}: {
  detail: CatalogDetail;
  qa?: boolean;
}) => {
  const media = detailMedia(detail, qa);
  const facts = detailFacts(detail);

  return (
    <main className={styles.screen}>
      <header className={styles.topbar}>
        <a aria-label="返回首页" className={styles.backLink} href="/">
          返回首页
        </a>
      </header>
      <div className={styles.content}>
        <section
          className={`${styles.hero}${media.length === 0 ? ` ${styles.heroWithoutMedia}` : ""}`}
        >
          {media.length === 0 ? null : <CatalogMediaGallery media={media} />}
          <article className={styles.identity}>
            <h1>{detail.title}</h1>
            <p className={styles.kind}>{kindLabel(detail.kind)}</p>
            {detail.aliases.length === 0 ? null : (
              <div className={styles.aliases}>
                <p>又名</p>
                <p>{detail.aliases.join(" · ")}</p>
              </div>
            )}
            {facts.length > 0 || qa ? (
              <section className={styles.factsSection}>
                <h2>基本资料</h2>
                {facts.length === 0 ? (
                  <p className={styles.placeholder}>资料待接入</p>
                ) : (
                  <dl className={styles.facts}>
                    {facts.map((fact) => (
                      <div key={fact.label}>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>
            ) : null}
          </article>
        </section>
        {detail.description !== undefined || qa ? (
          <section className={styles.readingSection}>
            <h2>简介</h2>
            <p
              className={
                detail.description === undefined
                  ? styles.placeholder
                  : undefined
              }
            >
              {detail.description ?? "内容待接入"}
            </p>
          </section>
        ) : null}
        {qa ? (
          <section className={styles.readingSection}>
            <h2>释文</h2>
            <p className={styles.placeholder}>内容待接入</p>
          </section>
        ) : null}
        {qa ? (
          <section className={styles.readingSection}>
            <h2>说明</h2>
            <p className={styles.placeholder}>内容待接入</p>
          </section>
        ) : null}
        {detail.sourceCitations.length > 0 || qa ? (
          <section className={styles.readingSection}>
            <h2>资料来源</h2>
            {detail.sourceCitations.length === 0 ? (
              <p className={styles.placeholder}>内容待接入</p>
            ) : (
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
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
};
