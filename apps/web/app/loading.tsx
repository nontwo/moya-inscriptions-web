import styles from "../features/home/home-screen.module.css";

export default function Loading() {
  return (
    <div
      aria-label="由艺正在加载"
      className={`${styles.loading} yoyi-paper yoyi-paper--visible`}
      data-loading-screen
      role="status"
    >
      <div className={styles.loadingBrand}>
        <span aria-label="由艺" className="yoyi-logo" role="img" />
        <p className={styles.loadingMotto} lang="zh-CN">
          志于道，据于德，依于仁，游于艺
        </p>
      </div>
    </div>
  );
}
