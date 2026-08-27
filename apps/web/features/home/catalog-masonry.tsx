"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import styles from "./home-screen.module.css";
import {
  layoutHomeMasonry,
  resolveHomeMasonryColumns,
} from "./catalog-masonry-layout";

import type { CSSProperties, ReactNode } from "react";
import type { FeedLayoutPreference } from "../product-shell/preferences";
import type { PresentationPlatform } from "../shell/device-platform";

interface RenderedLayout {
  readonly height: number;
  readonly positions: readonly {
    readonly height: number;
    readonly width: number;
    readonly x: number;
    readonly y: number;
  }[];
  readonly signature: string;
}

export interface CatalogMasonryProps<T> {
  readonly feedLayout: FeedLayoutPreference;
  readonly getKey: (item: T) => string;
  readonly isFullSpan?: (item: T) => boolean;
  readonly items: readonly T[];
  readonly platform: PresentationPlatform;
  readonly renderItem: (item: T, onMediaSettled: () => void) => ReactNode;
}

const layoutSignature = (
  width: number,
  columns: number,
  heights: readonly number[],
  spans: readonly boolean[],
) => `${width}:${columns}:${heights.join(",")}:${spans.join(",")}`;

export const CatalogMasonry = <T,>({
  feedLayout,
  getKey,
  isFullSpan = () => false,
  items,
  platform,
  renderItem,
}: CatalogMasonryProps<T>) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const settleFrameRef = useRef<number | null>(null);
  const [width, setWidth] = useState(0);
  const [revision, setRevision] = useState(0);
  const [renderedLayout, setRenderedLayout] = useState<RenderedLayout | null>(
    null,
  );

  const gap = platform === "tablet" ? 20 : platform === "pc" ? 20 : 12;
  const columns = useMemo(
    () => resolveHomeMasonryColumns(width, gap, platform, feedLayout),
    [feedLayout, gap, platform, width],
  );
  const columnWidth =
    width > 0 ? (width - gap * Math.max(0, columns - 1)) / columns : 0;
  const spans = useMemo(
    () =>
      items.map(
        (item) =>
          platform !== "pc" && feedLayout === "double" && isFullSpan(item),
      ),
    [feedLayout, isFullSpan, items, platform],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const measure = () => {
      const nextWidth = container.getBoundingClientRect().width;
      if (Number.isFinite(nextWidth) && nextWidth >= 32) {
        setWidth((current) =>
          Math.abs(current - nextWidth) <= 0.5 ? current : nextWidth,
        );
      }
    };

    measure();
    if (typeof ResizeObserver !== "function") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (width < 32 || columnWidth <= 0) return;
    const heights = items.map((item) => {
      const element = itemRefs.current.get(getKey(item));
      return element?.getBoundingClientRect().height ?? 0;
    });
    const signature = layoutSignature(width, columns, heights, spans);
    const result = layoutHomeMasonry(
      heights.map((height, index) => ({
        height,
        ...(spans[index] ? { spanAll: true } : {}),
      })),
      width,
      columns,
      gap,
    );
    setRenderedLayout((current) =>
      current?.signature === signature ? current : { ...result, signature },
    );
  }, [columnWidth, columns, gap, getKey, items, revision, spans, width]);

  const onMediaSettled = useCallback(() => {
    if (settleFrameRef.current !== null) {
      window.cancelAnimationFrame(settleFrameRef.current);
    }
    settleFrameRef.current = window.requestAnimationFrame(() => {
      settleFrameRef.current = null;
      setRevision((value) => value + 1);
    });
  }, []);

  useLayoutEffect(
    () => () => {
      if (settleFrameRef.current !== null) {
        window.cancelAnimationFrame(settleFrameRef.current);
      }
    },
    [],
  );
  const ready =
    renderedLayout !== null &&
    renderedLayout.positions.length === items.length &&
    renderedLayout.signature.startsWith(`${width}:${columns}:`);
  const retainedLayout =
    renderedLayout !== null && renderedLayout.positions.length === items.length
      ? renderedLayout
      : null;

  return (
    <div
      ref={containerRef}
      className={styles.masonry}
      data-home-masonry=""
      data-layout-ready={ready ? "true" : "false"}
      data-layout-retained={!ready && retainedLayout !== null ? "" : undefined}
      data-masonry-columns={columns}
      role="list"
      style={{ height: retainedLayout?.height ?? 1 }}
    >
      {items.map((item, index) => {
        const key = getKey(item);
        const position = retainedLayout?.positions[index];
        const itemWidth = spans[index] ? width : columnWidth;
        const style = {
          left: position?.x ?? 0,
          top: position?.y ?? 0,
          visibility: retainedLayout === null ? "hidden" : "visible",
          width: ready ? (position?.width ?? itemWidth) : itemWidth,
        } satisfies CSSProperties;
        return (
          <div
            key={key}
            ref={(element) => {
              if (element === null) itemRefs.current.delete(key);
              else itemRefs.current.set(key, element);
            }}
            className={styles.masonryItem}
            data-home-masonry-item=""
            data-home-masonry-span={spans[index] ? "full" : undefined}
            role="presentation"
            style={style}
          >
            {renderItem(item, onMediaSettled)}
          </div>
        );
      })}
    </div>
  );
};
