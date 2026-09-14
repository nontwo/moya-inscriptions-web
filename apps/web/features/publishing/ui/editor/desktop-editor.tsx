"use client";

import styles from "./editor.module.css";

import type { ReactNode } from "react";

/**
 * PC and wide tablet (E05): one spacious editor — the mode switches before
 * anything else, then the media column, the text and settings column and
 * the continuous preview. The same confirmation opens from the return bar.
 */
export const DesktopEditor = ({
  switches,
  media,
  text,
  preview,
  status,
}: {
  readonly switches: ReactNode;
  readonly media: ReactNode;
  readonly text: ReactNode;
  readonly preview: ReactNode;
  /** Notices and the upload summary. */
  readonly status?: ReactNode;
}) => (
  <div className={styles.desktop} data-editor-layout="desktop">
    <div className={styles.desktopTop}>
      {switches}
      {status}
    </div>
    <div className={styles.desktopGrid}>
      {/* The media section carries its own 图片 heading. */}
      <div className={styles.column}>{media}</div>
      <section aria-label="文字与设置" className={styles.column}>
        <h2 className={styles.sectionTitle}>文字与设置</h2>
        {text}
      </section>
      {preview}
    </div>
  </div>
);
