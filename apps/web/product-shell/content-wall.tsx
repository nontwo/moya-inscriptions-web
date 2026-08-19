"use client";

import { useEffect, useRef, type ReactNode } from "react";

import styles from "./product-shell.module.css";

import type { ContentWallLayoutPreference } from "./presentation-preferences";

const desktopMinimumCardWidth = 220;
const desktopMaximumCardWidth = 320;

export const contentWallColumnCount = ({
  width,
  gap,
  platform,
  layout,
}: {
  width: number;
  gap: number;
  platform: "phone" | "tablet" | "pc";
  layout: ContentWallLayoutPreference;
}) => {
  if (platform !== "pc") return layout === "single" ? 1 : 2;
  if (width < 32) return 3;

  let columns = Math.max(
    3,
    Math.min(8, Math.floor((width + gap) / (desktopMinimumCardWidth + gap))),
  );
  let columnWidth = (width - gap * Math.max(0, columns - 1)) / columns;
  while (columns < 8 && columnWidth > desktopMaximumCardWidth) {
    columns += 1;
    columnWidth = (width - gap * Math.max(0, columns - 1)) / columns;
  }
  return columns;
};

const numericStyle = (value: CSSStyleDeclaration, property: string) =>
  Number.parseFloat(value.getPropertyValue(property)) || 0;

export function ContentWall({
  children,
  label,
}: {
  children: ReactNode;
  label?: string | undefined;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let firstFrame = 0;
    let secondFrame = 0;

    const layout = () => {
      const computed = window.getComputedStyle(container);
      const gap = numericStyle(computed, "--content-wall-gap") || 8;
      const paddingInlineStart = numericStyle(computed, "padding-inline-start");
      const paddingInlineEnd = numericStyle(computed, "padding-inline-end");
      const paddingBlockStart = numericStyle(computed, "padding-block-start");
      const paddingBlockEnd = numericStyle(computed, "padding-block-end");
      const innerWidth =
        container.clientWidth - paddingInlineStart - paddingInlineEnd;
      if (container.clientWidth < 32 || innerWidth <= 0) return;

      const root = document.documentElement;
      const platform =
        root.dataset.platform === "pc" || root.dataset.platform === "tablet"
          ? root.dataset.platform
          : "phone";
      const columns = contentWallColumnCount({
        width: container.clientWidth,
        gap,
        platform,
        layout:
          root.dataset.contentWallLayout === "single" ? "single" : "double",
      });
      const columnWidth =
        (innerWidth - gap * Math.max(0, columns - 1)) / columns;
      const heights = Array.from({ length: columns }, () => 0);
      const items = [
        ...container.querySelectorAll<HTMLElement>("[data-content-wall-card]"),
      ].filter((item) => !item.hidden);

      for (const item of items) {
        item.style.position = "absolute";
        item.style.inlineSize = `${columnWidth}px`;
        item.style.maxInlineSize = "100%";
        item.style.margin = "0";
        const shortest = Math.min(...heights);
        const column = heights.indexOf(shortest);
        item.style.insetInlineStart = `${paddingInlineStart + column * (columnWidth + gap)}px`;
        item.style.insetBlockStart = `${paddingBlockStart + shortest}px`;
        heights[column] = (heights[column] ?? 0) + item.offsetHeight + gap;
      }

      const tallest = Math.max(0, ...heights);
      const contentHeight =
        tallest > 0
          ? tallest - gap + paddingBlockStart + paddingBlockEnd
          : paddingBlockStart + paddingBlockEnd;
      container.style.blockSize = `${Math.max(0, contentHeight)}px`;
      container.dataset.contentWallColumns = String(columns);
      container.dataset.layoutReady = "true";
    };

    const scheduleLayout = () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      firstFrame = requestAnimationFrame(() => {
        layout();
        secondFrame = requestAnimationFrame(layout);
      });
    };
    const resizeObserver = new ResizeObserver(scheduleLayout);
    resizeObserver.observe(container);
    const rootObserver = new MutationObserver(scheduleLayout);
    rootObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-content-wall-layout", "data-platform"],
    });
    for (const image of container.querySelectorAll("img")) {
      image.addEventListener("load", scheduleLayout);
      image.addEventListener("error", scheduleLayout);
    }
    window.addEventListener("yoyi:platformchange", scheduleLayout);
    window.addEventListener("yoyi:layoutchange", scheduleLayout);
    scheduleLayout();
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      resizeObserver.disconnect();
      rootObserver.disconnect();
      window.removeEventListener("yoyi:platformchange", scheduleLayout);
      window.removeEventListener("yoyi:layoutchange", scheduleLayout);
      for (const image of container.querySelectorAll("img")) {
        image.removeEventListener("load", scheduleLayout);
        image.removeEventListener("error", scheduleLayout);
      }
    };
  }, [children]);

  return (
    <div
      aria-label={label}
      className={styles.contentWall}
      data-content-wall
      ref={containerRef}
      role="list"
    >
      {children}
    </div>
  );
}
