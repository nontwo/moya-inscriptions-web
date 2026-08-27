import { Icon } from "@moya/ui";

import { CatalogMediaCarousel } from "./catalog-media-carousel";
import styles from "./catalog-detail.module.css";

import type { RefObject } from "react";
import type { CatalogDetailPresentationState } from "./catalog-detail-presentation";
import type { PresentationPlatform } from "../shell/device-platform";

export interface CatalogDetailScreenProps {
  readonly activeMediaIndex: number;
  readonly backButtonRef: RefObject<HTMLButtonElement | null>;
  readonly onActiveMediaIndexChange: (index: number) => void;
  readonly onBack: () => void;
  readonly orientation: "landscape" | "portrait";
  readonly platform: PresentationPlatform;
  readonly state: CatalogDetailPresentationState;
}

const DetailMessage = ({
  description,
  role = "status",
  title,
}: {
  readonly description: string;
  readonly role?: "alert" | "status";
  readonly title: string;
}) => (
  <section className={styles.message} role={role}>
    <h1>{title}</h1>
    <p>{description}</p>
  </section>
);

export const CatalogDetailScreen = ({
  activeMediaIndex,
  backButtonRef,
  onActiveMediaIndexChange,
  onBack,
  orientation,
  platform,
  state,
}: CatalogDetailScreenProps) => {
  let body;
  if (state.state === "loading") {
    body = (
      <div aria-label="正在加载资料" className={styles.skeleton} role="status">
        <span className={styles.skeletonMedia} />
        <span className={styles.skeletonTitle} />
        <span />
        <span />
      </div>
    );
  } else if (state.state === "not-found") {
    body = (
      <DetailMessage
        description="这项资料可能不存在，或已无法访问。"
        title="未找到这项资料"
      />
    );
  } else if (state.state === "unavailable") {
    body = (
      <DetailMessage
        description="资料服务当前不可用，请返回后稍后再试。"
        title="暂时无法加载资料"
      />
    );
  } else if (state.state === "unexpected-error") {
    body = (
      <DetailMessage
        description="发生了未预期的错误，请返回上一页。"
        role="alert"
        title="暂时无法显示此页面"
      />
    );
  } else {
    const detail = state.detail;
    const identity = [
      detail.kind === "calligraphy" ? "书帖" : "碑刻",
      detail.periodLabel,
    ]
      .filter((value): value is string => value !== undefined)
      .join(" · ");

    body = (
      <>
        <div className={styles.hero}>
          <CatalogMediaCarousel
            activeIndex={activeMediaIndex}
            media={detail.media}
            onActiveIndexChange={onActiveMediaIndexChange}
            platform={platform}
          />
          <section className={styles.identityPanel} data-detail-info-panel="">
            <h1 data-detail-title="">{detail.title}</h1>
            <p className={styles.kindPeriod}>{identity}</p>
            {detail.summary === undefined ? null : (
              <p className={styles.summary}>{detail.summary}</p>
            )}
            {detail.aliases.length === 0 ? null : (
              <div className={styles.aliases}>
                <span>又名</span>
                <p>{detail.aliases.join(" · ")}</p>
              </div>
            )}
            {detail.facts.length === 0 ? null : (
              <section className={styles.factsSection} data-detail-facts="">
                <h2>基本资料</h2>
                <dl className={styles.facts}>
                  {detail.facts.map((fact) => (
                    <div key={`${fact.label}-${fact.value}`}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </section>
        </div>

        {detail.description === undefined &&
        detail.sourceCitations.length === 0 ? null : (
          <div className={styles.readingFlow}>
            {detail.description === undefined ? null : (
              <section
                className={styles.readingSection}
                data-detail-section="description"
              >
                <h2>简介</h2>
                <p>{detail.description}</p>
              </section>
            )}
            {detail.sourceCitations.length === 0 ? null : (
              <section
                className={styles.readingSection}
                data-detail-section="sources"
              >
                <h2>资料来源</h2>
                <ul className={styles.sources}>
                  {detail.sourceCitations.map((citation, index) => (
                    <li key={`${citation.label}-${index}`}>
                      <strong>{citation.label}</strong>
                      {citation.citation === undefined ? null : (
                        <span>{citation.citation}</span>
                      )}
                      {citation.url === undefined ? null : (
                        <a href={citation.url} rel="noreferrer" target="_blank">
                          查看来源
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <section
      aria-label="资料详情"
      aria-modal="true"
      className={styles.detail}
      data-detail-composition={`${platform}-${orientation}`}
      data-detail-source={
        state.state === "loaded" ? state.detail.source : undefined
      }
      data-detail-state={state.state}
      data-platform={platform}
      role="dialog"
    >
      <header className={styles.detailHeader}>
        <button
          ref={backButtonRef}
          aria-label="返回"
          onClick={onBack}
          type="button"
        >
          <Icon aria-hidden="true" name="back" />
        </button>
        <span aria-hidden="true" />
      </header>
      <div className={styles.detailContent}>{body}</div>
    </section>
  );
};
