import { Icon, PageContainer, YoyiLogo } from "@moya/ui";

import styles from "../features/home/home-screen.module.css";

export default function Loading() {
  return (
    <PageContainer className={styles.page}>
      <header className={styles.brand}>
        <YoyiLogo label="由艺" />
        <div>
          <p>由艺</p>
          <h1>摩崖碑刻数字档案</h1>
        </div>
      </header>
      <div aria-live="polite" className={styles.state} role="status">
        <Icon name="loading" size="lg" />
        <h2>正在加载公开档案</h2>
        <p>请稍候。</p>
      </div>
    </PageContainer>
  );
}
