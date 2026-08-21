import styles from "../../../features/catalog-detail/catalog-detail-screen.module.css";

export default function CatalogDetailLoading() {
  return (
    <main aria-busy="true" aria-live="polite" className={styles.screen}>
      <div className={styles.content}>
        <div className={styles.loading}>
          <span className={styles.loadingMedia} />
          <span className={styles.loadingTitle} />
          <span className={styles.loadingLine} />
          <span className={styles.loadingLine} />
          <span className={styles.loadingLine} />
        </div>
      </div>
    </main>
  );
}
