import { Icon } from "@moya/ui";

import { CatalogGallery } from "./catalog-gallery";
import styles from "./catalog-detail.module.css";

import type { CatalogDetailPresentationState } from "./catalog-detail-presentation";
import type { PresentationPlatform } from "../shell/device-platform";

export interface CatalogDetailScreenProps {
  readonly activeMediaIndex: number;
  readonly onActiveMediaIndexChange: (index: number) => void;
  readonly onBack: () => void;
  readonly onOpenViewer: (index: number, opener: HTMLElement) => void;
  readonly onRetry?: (() => void) | undefined;
  readonly orientation: "landscape" | "portrait";
  readonly platform: PresentationPlatform;
  readonly state: CatalogDetailPresentationState;
}

const DetailMessage = ({
  description,
  onBack,
  onRetry,
  role = "status",
  title,
}: {
  readonly description: string;
  readonly onBack: () => void;
  readonly onRetry?: (() => void) | undefined;
  readonly role?: "alert" | "status";
  readonly title: string;
}) => (
  <section className={styles.message} role={role}>
    <h1>{title}</h1>
    <p>{description}</p>
    <div className={styles.messageActions}>
      {onRetry === undefined ? null : (
        <button onClick={onRetry} type="button">
          重试
        </button>
      )}
      <button onClick={onBack} type="button">
        返回
      </button>
    </div>
  </section>
);

export const CatalogDetailScreen = ({
  activeMediaIndex,
  onActiveMediaIndexChange,
  onBack,
  onOpenViewer,
  onRetry,
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
        onBack={onBack}
        title="未找到这项资料"
      />
    );
  } else if (state.state === "unavailable") {
    body = (
      <DetailMessage
        description="请稍后再试。"
        onBack={onBack}
        onRetry={onRetry}
        title="暂时无法加载资料"
      />
    );
  } else if (state.state === "unexpected-error") {
    body = (
      <DetailMessage
        description="发生了未预期的错误。"
        onBack={onBack}
        onRetry={onRetry}
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
          <CatalogGallery
            activeIndex={activeMediaIndex}
            media={detail.media}
            onActiveIndexChange={onActiveMediaIndexChange}
            onOpenViewer={onOpenViewer}
            platform={platform}
          />
          <section className={styles.identityPanel} data-detail-info-panel="">
            <h1 data-detail-title="">{detail.title}</h1>
            <p className={styles.kindPeriod}>{identity}</p>
            {detail.aliases.length === 0 ? null : (
              <div className={styles.aliases}>
                <span>又名</span>
                <p>{detail.aliases.join(" · ")}</p>
              </div>
            )}
            {detail.facts.length === 0 &&
            detail.factsPlaceholder === undefined ? null : (
              <section className={styles.factsSection} data-detail-facts="">
                <h2>基本资料</h2>
                {detail.facts.length === 0 ? null : (
                  <dl className={styles.facts}>
                    {detail.facts.map((fact) => (
                      <div key={`${fact.label}-${fact.value}`}>
                        <dt>{fact.label}</dt>
                        <dd>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {detail.factsPlaceholder === undefined ? null : (
                  <p data-detail-placeholder="">{detail.factsPlaceholder}</p>
                )}
              </section>
            )}
          </section>
        </div>

        <div className={styles.readingFlow}>
          {detail.sections.map((section) => (
            <section
              className={styles.readingSection}
              data-detail-placeholder={section.placeholder ? "true" : undefined}
              data-detail-section={section.id}
              key={section.id}
            >
              <h2>{section.title}</h2>
              <p>{section.content}</p>
            </section>
          ))}
          {detail.sourceCitations.length === 0 &&
          detail.sourcesPlaceholder === undefined ? null : (
            <section
              className={styles.readingSection}
              data-detail-section="sources"
            >
              <h2>资料来源</h2>
              {detail.sourceCitations.length === 0 ? null : (
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
              )}
              {detail.sourcesPlaceholder === undefined ? null : (
                <p data-detail-placeholder="">{detail.sourcesPlaceholder}</p>
              )}
            </section>
          )}
        </div>
      </>
    );
  }

  return (
    <section
      aria-label="资料详情"
      className={styles.detail}
      data-detail-composition={`${platform}-${orientation}`}
      data-detail-state={state.state}
      data-platform={platform}
    >
      <header className={styles.detailHeader}>
        <button aria-label="返回" onClick={onBack} type="button">
          <Icon aria-hidden="true" name="back" />
        </button>
        <span aria-hidden="true" />
      </header>
      <div className={styles.detailContent}>{body}</div>
    </section>
  );
};
