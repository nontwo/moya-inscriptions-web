"use client";
import { Icon } from "@moya/ui";
import { useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { layoutHomeMasonry } from "../home/catalog-masonry-layout";
import type { MasonryLayoutResult } from "../home/catalog-masonry-layout";
import type { PresentationPlatform } from "../shell/device-platform";
import styles from "./user-presentation.module.css";
export interface UserContentItem {
  readonly id: string;
  readonly imageAlt?: string;
  readonly imageHeight?: number;
  readonly imageSrc?: string;
  readonly imageWidth?: number;
  readonly metadata?: string;
  readonly presentationKey?: string;
  readonly title: string;
}

export const UserContentList = ({
  items,
  platform,
  onOpen,
}: {
  readonly items: readonly UserContentItem[];
  readonly platform: PresentationPlatform;
  readonly onOpen: (item: UserContentItem, opener: HTMLButtonElement) => void;
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [layout, setLayout] = useState<MasonryLayoutResult | null>(null);
  const columns = platform === "pc" ? 3 : 2;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) return;
    const measure = () => {
      const width = list.clientWidth;
      if (width <= 0) return;
      const gap =
        Number.parseFloat(window.getComputedStyle(list).columnGap) || 12;
      const next = layoutHomeMasonry(
        items.map((_, index) => ({
          height: itemRefs.current[index]?.getBoundingClientRect().height ?? 0,
        })),
        width,
        columns,
        gap,
      );
      if (next.positions.some((position) => position.height <= 0)) return;
      setLayout((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    itemRefs.current.forEach((item) => {
      if (item !== null) observer.observe(item);
    });
    return () => observer.disconnect();
  }, [columns, items]);
  return (
    <div
      className={styles.grid}
      data-user-content-list=""
      data-user-columns={columns}
      data-user-layout-ready={layout !== null}
      ref={listRef}
      role="list"
      style={
        {
          "--user-columns": columns,
          ...(layout === null ? {} : { height: layout.height }),
        } as CSSProperties
      }
    >
      {items.map((item, index) => {
        const position = layout?.positions[index];
        return (
          <div
            className={styles.contentItem}
            key={item.presentationKey ?? item.id}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            style={
              position === undefined
                ? undefined
                : { left: position.x, top: position.y, width: position.width }
            }
          >
            <article role="listitem">
              {item.imageSrc === undefined ? (
                <div
                  aria-label={`暂无图像：${item.title}`}
                  className={styles.mediaFallback}
                  role="img"
                >
                  <Icon aria-hidden="true" name="image" />
                  <span>暂无图像</span>
                </div>
              ) : (
                <div className={styles.media}>
                  <img
                    alt={item.imageAlt ?? `${item.title}图像`}
                    height={item.imageHeight ?? 760}
                    loading="lazy"
                    src={item.imageSrc}
                    width={item.imageWidth ?? 600}
                  />
                </div>
              )}
              <div className={styles.cardBody}>
                <h3>{item.title}</h3>
                {item.metadata === undefined ? null : <p>{item.metadata}</p>}
              </div>
            </article>
            <button
              aria-label={`打开${item.title}`}
              data-user-content-id={item.id}
              onClick={(event) => onOpen(item, event.currentTarget)}
              type="button"
            />
          </div>
        );
      })}
    </div>
  );
};
