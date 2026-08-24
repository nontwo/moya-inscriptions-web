import { CatalogCard } from "./catalog-card";
import styles from "./home-screen.module.css";

import type { CatalogKind } from "@moya/contracts";
import type { HomeCatalogState } from "./catalog-state";

export type CatalogFeedLayout = "single" | "double";
export type CatalogScreenPresentation = "home" | CatalogKind;

export interface CatalogCollectionScreenProps {
  readonly feedLayout: CatalogFeedLayout;
  readonly onOpenCatalog?:
    ((catalogId: string, opener: HTMLElement) => void) | undefined;
  readonly openableCatalogIds?: readonly string[] | undefined;
  readonly presentation: CatalogScreenPresentation;
  readonly state: HomeCatalogState;
}

const screenCopy = {
  calligraphy: {
    emptyDescription: "当前没有可展示的公开书帖。",
    emptyTitle: "暂无公开书帖",
    heading: "书帖",
  },
  home: {
    emptyDescription: "当前没有可展示的公开内容。",
    emptyTitle: "暂无公开档案",
    heading: "发现",
  },
  inscription: {
    emptyDescription: "当前没有可展示的公开碑刻。",
    emptyTitle: "暂无公开碑刻",
    heading: "碑刻",
  },
} as const satisfies Record<
  CatalogScreenPresentation,
  {
    readonly emptyDescription: string;
    readonly emptyTitle: string;
    readonly heading: string;
  }
>;

const StateMessage = ({
  description,
  role,
  state,
  title,
}: {
  readonly description: string;
  readonly role?: "alert" | "status";
  readonly state: "empty" | "unavailable" | "unexpected-error";
  readonly title: string;
}) => (
  <section
    className={styles.stateMessage}
    data-catalog-presentation-state={state}
    role={role}
  >
    <IconForState state={state} />
    <h3>{title}</h3>
    <p>{description}</p>
  </section>
);

const IconForState = ({
  state,
}: {
  readonly state: "empty" | "unavailable" | "unexpected-error";
}) => (
  <span aria-hidden="true" className={styles.stateMark}>
    {state === "empty" ? "空" : "!"}
  </span>
);

const PopulatedCollection = ({
  feedLayout,
  onOpenCatalog,
  openableCatalogIds,
  presentation,
  state,
}: CatalogCollectionScreenProps & {
  readonly state: Extract<HomeCatalogState, { readonly state: "populated" }>;
}) => {
  const items =
    presentation === "home"
      ? state.page.items
      : state.page.items.filter(({ kind }) => kind === presentation);

  if (items.length === 0) {
    const copy = screenCopy[presentation];
    return (
      <StateMessage
        description={copy.emptyDescription}
        state="empty"
        title={copy.emptyTitle}
      />
    );
  }

  if (presentation === "inscription") {
    return (
      <ul
        className={styles.inscriptionList}
        data-catalog-item-count={items.length}
      >
        {items.map((item) => (
          <li key={item.id}>
            <CatalogCard
              item={item}
              onOpen={
                onOpenCatalog !== undefined &&
                openableCatalogIds?.includes(item.id) === true
                  ? (opener) => onOpenCatalog(item.id, opener)
                  : undefined
              }
              variant="inscription"
            />
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      className={styles.feed}
      data-catalog-item-count={items.length}
      data-feed-layout={feedLayout}
      role="list"
    >
      {items.map((item) => (
        <CatalogCard
          key={item.id}
          item={item}
          onOpen={
            onOpenCatalog !== undefined &&
            openableCatalogIds?.includes(item.id) === true
              ? (opener) => onOpenCatalog(item.id, opener)
              : undefined
          }
          variant="feed"
        />
      ))}
    </div>
  );
};

export const CatalogCollectionScreen = ({
  feedLayout,
  onOpenCatalog,
  openableCatalogIds,
  presentation,
  state,
}: CatalogCollectionScreenProps) => {
  const copy = screenCopy[presentation];
  let content;

  switch (state.state) {
    case "populated":
      content = (
        <PopulatedCollection
          feedLayout={feedLayout}
          onOpenCatalog={onOpenCatalog}
          openableCatalogIds={openableCatalogIds}
          presentation={presentation}
          state={state}
        />
      );
      break;
    case "empty":
      content = (
        <StateMessage
          description={copy.emptyDescription}
          state="empty"
          title={copy.emptyTitle}
        />
      );
      break;
    case "unavailable":
      content = (
        <StateMessage
          description="请稍后再试。"
          role="status"
          state="unavailable"
          title="档案服务暂时不可用"
        />
      );
      break;
    case "unexpected-error":
      content = (
        <StateMessage
          description="发生了未预期的错误。"
          role="alert"
          state="unexpected-error"
          title="无法加载公开档案"
        />
      );
      break;
  }

  return (
    <section
      aria-labelledby={`catalog-${presentation}-heading`}
      className={styles.screen}
      data-catalog-presentation={presentation}
      data-catalog-presentation-state={state.state}
    >
      <header className={styles.screenHeader}>
        <h2 id={`catalog-${presentation}-heading`}>{copy.heading}</h2>
      </header>
      {content}
    </section>
  );
};

export interface CatalogBrowseScreenProps {
  readonly feedLayout: CatalogFeedLayout;
  readonly kind: CatalogKind;
  readonly onOpenCatalog?:
    ((catalogId: string, opener: HTMLElement) => void) | undefined;
  readonly openableCatalogIds?: readonly string[] | undefined;
  readonly state: HomeCatalogState;
}

export const CatalogBrowseScreen = ({
  feedLayout,
  kind,
  onOpenCatalog,
  openableCatalogIds,
  state,
}: CatalogBrowseScreenProps) => (
  <CatalogCollectionScreen
    feedLayout={feedLayout}
    onOpenCatalog={onOpenCatalog}
    openableCatalogIds={openableCatalogIds}
    presentation={kind}
    state={state}
  />
);
