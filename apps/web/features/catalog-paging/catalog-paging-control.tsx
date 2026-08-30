"use client";

import styles from "./catalog-paging.module.css";

import type { CatalogPagingRequestState } from "./catalog-paging";

export interface CatalogPagingControlProps {
  readonly onLoadNextPage: () => void;
  readonly state: CatalogPagingRequestState;
}

const labels = {
  idle: "继续加载",
  loading: "正在加载…",
  "next-page-error": "加载失败，重新加载",
} as const;

export const CatalogPagingControl = ({
  onLoadNextPage,
  state,
}: CatalogPagingControlProps) => {
  if (state === "complete") return null;
  return (
    <div className={styles.container} data-catalog-paging-state={state}>
      <button
        type="button"
        aria-busy={state === "loading" ? "true" : undefined}
        className={styles.button}
        data-catalog-paging-control=""
        disabled={state === "loading"}
        onClick={onLoadNextPage}
      >
        {labels[state]}
      </button>
    </div>
  );
};
