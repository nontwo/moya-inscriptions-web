"use client";

import { CatalogMedia } from "./catalog-media";
import styles from "./home-screen.module.css";
import { useProductShellActions } from "../../product-shell/product-shell-context";

import type { CatalogSummary } from "@moya/contracts";

export function HomeCatalogCard({ item }: { item: CatalogSummary }) {
  const { openRealCatalogSummary } = useProductShellActions();
  return (
    <button
      className={styles.card}
      data-content-wall-card
      data-home-card
      onClick={() => openRealCatalogSummary(item)}
      role="listitem"
      type="button"
    >
      <CatalogMedia media={item.representativeMedia} />
      <span className={styles.cardCaption}>
        <span className={styles.cardTitle}>{item.title}</span>
        {item.periodLabel === undefined ? null : (
          <span className={styles.cardMeta}>{item.periodLabel}</span>
        )}
      </span>
    </button>
  );
}
