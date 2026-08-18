"use client";

import styles from "../features/home/home-screen.module.css";

export default function ErrorBoundary({ reset }: { reset: () => void }) {
  return (
    <main className={styles.state}>
      <h1>页面暂时无法显示</h1>
      <p>发生了未预期的错误，请稍后重试。</p>
      <button onClick={reset} type="button">
        重新加载
      </button>
    </main>
  );
}
