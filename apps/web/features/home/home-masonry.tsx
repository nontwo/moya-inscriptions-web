"use client";

import { useEffect, useRef, type ReactNode } from "react";

import styles from "./home-screen.module.css";

import type { HomeLayoutPreference } from "./presentation-preferences";

const desktopMinimumCardWidth = 220;
const desktopMaximumCardWidth = 320;

export const masonryColumnCount = ({
  width,
  gap,
  desktop,
  layout,
}: {
  width: number;
  gap: number;
  desktop: boolean;
  layout: HomeLayoutPreference;
}) => {
  if (!desktop) return layout === "single" ? 1 : 2;
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

const numericStyle = (styles: CSSStyleDeclaration, property: string) =>
  Number.parseFloat(styles.getPropertyValue(property)) || 0;

export function HomeMasonry({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    let firstFrame = 0;
    let secondFrame = 0;

    const layout = () => {
      const computed = window.getComputedStyle(container);
      const gap = numericStyle(computed, "--home-masonry-gap") || 8;
      const paddingInlineStart = numericStyle(computed, "padding-inline-start");
      const paddingInlineEnd = numericStyle(computed, "padding-inline-end");
      const paddingBlockStart = numericStyle(computed, "padding-block-start");
      const paddingBlockEnd = numericStyle(computed, "padding-block-end");
      const outerWidth = container.clientWidth;
      const innerWidth = outerWidth - paddingInlineStart - paddingInlineEnd;
      if (outerWidth < 32 || innerWidth <= 0) return;

      const rootLayout = document.documentElement.dataset.homeLayout;
      const columns = masonryColumnCount({
        width: outerWidth,
        gap,
        desktop: window.matchMedia("(min-width: 56rem)").matches,
        layout: rootLayout === "single" ? "single" : "double",
      });
      const columnWidth =
        (innerWidth - gap * Math.max(0, columns - 1)) / columns;
      const heights = Array.from({ length: columns }, () => 0);
      const items = [
        ...container.querySelectorAll<HTMLElement>("[data-home-card]"),
      ];

      items.forEach((item) => {
        item.style.position = "absolute";
        item.style.inlineSize = `${columnWidth}px`;
        item.style.maxInlineSize = "100%";
        item.style.margin = "0";
        const shortest = Math.min(...heights);
        const column = heights.indexOf(shortest);
        item.style.insetInlineStart = `${paddingInlineStart + column * (columnWidth + gap)}px`;
        item.style.insetBlockStart = `${paddingBlockStart + shortest}px`;
        heights[column] = (heights[column] ?? 0) + item.offsetHeight + gap;
      });

      const tallest = Math.max(0, ...heights);
      const contentHeight =
        tallest > 0
          ? tallest - gap + paddingBlockStart + paddingBlockEnd
          : paddingBlockStart + paddingBlockEnd;
      container.style.blockSize = `${Math.max(0, contentHeight)}px`;
      container.dataset.masonryColumns = String(columns);
      container.dataset.layoutReady = "true";
    };

    const scheduleLayout = () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      firstFrame = window.requestAnimationFrame(() => {
        layout();
        secondFrame = window.requestAnimationFrame(layout);
      });
    };

    const images = [...container.querySelectorAll<HTMLImageElement>("img")];
    images.forEach((image) => {
      image.addEventListener("load", scheduleLayout);
      image.addEventListener("error", scheduleLayout);
    });
    const resizeObserver = new ResizeObserver(scheduleLayout);
    resizeObserver.observe(container);
    const preferenceObserver = new MutationObserver(scheduleLayout);
    preferenceObserver.observe(document.documentElement, {
      attributeFilter: ["data-home-layout"],
      attributes: true,
    });
    scheduleLayout();

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      resizeObserver.disconnect();
      preferenceObserver.disconnect();
      images.forEach((image) => {
        image.removeEventListener("load", scheduleLayout);
        image.removeEventListener("error", scheduleLayout);
      });
    };
  }, [children]);

  return (
    <div
      className={styles.masonry}
      data-home-masonry
      ref={containerRef}
      role="list"
    >
      {children}
    </div>
  );
}
