"use client";
import { localCatalogMediaSrc } from "../detail/local-catalog-media";
import type { ContentCard as Card } from "@moya/contracts";
import { CatalogCardMedia } from "../home/catalog-card";
import type { CatalogCardVariant } from "../home/catalog-card";
import { QuickActionCardAction } from "../quick-actions/quick-action-card-action";
import { useProductShell } from "../product-shell/product-shell";
import { useContentActions } from "./content-actions";
import styles from "../home/home-screen.module.css";
export const ContentCard = ({
  item,
  onMediaSettled,
  variant = "feed",
}: {
  item: Card;
  onMediaSettled?: () => void;
  variant?: CatalogCardVariant;
}) => {
  const shell = useProductShell(),
    actions = useContentActions(item.target, item.title);
  return (
    <div>
      <article
        className={`${styles.card} ${variant === "inscription" ? styles.inscriptionCard : styles.feedCard}`}
        data-catalog-card-variant={variant}
        data-catalog-id={
          item.target.type === "catalog" ? item.target.id : undefined
        }
        data-content-type={item.target.type}
        data-content-id={item.target.id}
        role={variant === "feed" ? "listitem" : undefined}
      >
        <CatalogCardMedia
          media={
            item.media
              ? {
                  ...item.media,
                  src:
                    item.target.type === "catalog"
                      ? localCatalogMediaSrc(
                          item.media.src,
                          item.target.id,
                          item.media.id,
                        )
                      : item.media.src,
                  alt: item.title,
                }
              : undefined
          }
          title={item.title}
          variant={variant}
          {...(onMediaSettled ? { onMediaSettled } : {})}
        />
        <div className={styles.cardBody}>
          <h3 className={styles.cardTitle}>{item.title}</h3>
          {variant === "inscription" && item.kind === "inscription" && (
            <p className={styles.cardMetadata}>碑刻</p>
          )}
        </div>
        <QuickActionCardAction
          className={styles.cardAction}
          content={{
            kind: item.target.type,
            id: item.target.id,
            title: item.title,
          }}
          environment={actions.environment}
          onActivate={(opener) => shell.openContent(item.target, opener)}
        />
      </article>
    </div>
  );
};
