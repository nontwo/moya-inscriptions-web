import {
  forwardRef,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { CategoryOption, TabOption } from "../types.js";
import { cx } from "../utils.js";
import { FixedLabelMark, Icon } from "./brand.js";
import { IconButton } from "./primitives.js";

export type TabItemProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "value"
> & {
  selected: boolean;
  value: string;
  controls?: string | undefined;
};

export const TabItem = forwardRef<HTMLButtonElement, TabItemProps>(
  function TabItem(
    { selected, value, controls, className, type = "button", ...props },
    ref,
  ) {
    return (
      <button
        {...props}
        aria-controls={controls}
        aria-selected={selected}
        className={cx("yoyi-tab-item", selected && "is-selected", className)}
        data-value={value}
        data-yoyi-ui="tab-item"
        ref={ref}
        role="tab"
        tabIndex={selected ? 0 : -1}
        type={type}
      />
    );
  },
);

export type TabsProps = Omit<HTMLAttributes<HTMLDivElement>, "onChange"> & {
  items: TabOption[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  activationMode?: "automatic" | "manual";
};

export function Tabs({
  items,
  value,
  onValueChange,
  ariaLabel,
  activationMode = "automatic",
  className,
  ...props
}: TabsProps) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    const enabled = items
      .map((item, itemIndex) => (item.disabled ? -1 : itemIndex))
      .filter((itemIndex) => itemIndex >= 0);
    const position = enabled.indexOf(index);
    let nextIndex: number | undefined;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = enabled[(position + 1) % enabled.length];
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = enabled[(position - 1 + enabled.length) % enabled.length];
    } else if (event.key === "Home") {
      nextIndex = enabled[0];
    } else if (event.key === "End") {
      nextIndex = enabled[enabled.length - 1];
    } else if (
      activationMode === "manual" &&
      (event.key === "Enter" || event.key === " ")
    ) {
      event.preventDefault();
      const item = items[index];
      if (item && !item.disabled) onValueChange(item.id);
      return;
    } else {
      return;
    }

    event.preventDefault();
    if (nextIndex === undefined) return;
    refs.current[nextIndex]?.focus();
    const nextItem = items[nextIndex];
    if (activationMode === "automatic" && nextItem) {
      onValueChange(nextItem.id);
    }
  };

  return (
    <div
      {...props}
      aria-label={ariaLabel}
      className={cx("yoyi-tabs", className)}
      data-yoyi-ui="tabs"
      role="tablist"
    >
      {items.map((item, index) => (
        <TabItem
          aria-label={item.labelMark ? item.label : undefined}
          controls={item.panelId}
          disabled={item.disabled}
          key={item.id}
          onClick={() => onValueChange(item.id)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          ref={(node: HTMLButtonElement | null) => {
            refs.current[index] = node;
          }}
          selected={item.id === value}
          value={item.id}
        >
          {item.icon}
          {item.labelMark ? (
            <FixedLabelMark
              decorative
              label={item.label}
              name={item.labelMark}
            />
          ) : (
            <span>{item.label}</span>
          )}
        </TabItem>
      ))}
    </div>
  );
}

export type CategoryTabsProps = Omit<TabsProps, "items"> & {
  options: CategoryOption[];
};

export function CategoryTabs({ options, ...props }: CategoryTabsProps) {
  return <Tabs {...props} items={options} />;
}

export type CalligraphyCategoryTabsProps = CategoryTabsProps;

export function CalligraphyCategoryTabs(props: CalligraphyCategoryTabsProps) {
  return (
    <CategoryTabs
      {...props}
      className={cx("yoyi-calligraphy-category-tabs", props.className)}
    />
  );
}

export type DiscoverNearbyTabsProps = Omit<TabsProps, "items" | "ariaLabel"> & {
  discoverLabel?: string;
  nearbyLabel?: string;
};

export function DiscoverNearbyTabs({
  discoverLabel = "发现",
  nearbyLabel = "附近",
  ...props
}: DiscoverNearbyTabsProps) {
  return (
    <Tabs
      {...props}
      ariaLabel="首页内容范围"
      className={cx("yoyi-discover-nearby-tabs", props.className)}
      items={[
        {
          id: "discover",
          label: discoverLabel,
        },
        {
          id: "nearby",
          label: nearbyLabel,
        },
      ]}
    />
  );
}

export type PaginationProps = Omit<HTMLAttributes<HTMLElement>, "onChange"> & {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
};

export function Pagination({
  page,
  pageCount,
  onPageChange,
  label = "分页",
  previousLabel = "上一页",
  nextLabel = "下一页",
  className,
  ...props
}: PaginationProps) {
  const pages = Array.from({ length: Math.max(pageCount, 0) }, (_, i) => i + 1);

  return (
    <nav
      {...props}
      aria-label={label}
      className={cx("yoyi-pagination", className)}
      data-yoyi-ui="pagination"
    >
      <IconButton
        disabled={page <= 1}
        icon={<Icon name="previous" />}
        label={previousLabel}
        onClick={() => onPageChange(page - 1)}
      />
      <div className="yoyi-pagination__pages">
        {pages.map((pageNumber) => (
          <button
            aria-current={pageNumber === page ? "page" : undefined}
            className={cx(
              "yoyi-pagination__page",
              pageNumber === page && "is-current",
            )}
            key={pageNumber}
            onClick={() => onPageChange(pageNumber)}
            type="button"
          >
            <span className="yoyi-visually-hidden">第</span>
            {pageNumber}
            <span className="yoyi-visually-hidden">页</span>
          </button>
        ))}
      </div>
      <IconButton
        disabled={page >= pageCount}
        icon={<Icon name="next" />}
        label={nextLabel}
        onClick={() => onPageChange(page + 1)}
      />
    </nav>
  );
}

export type ContentCategorySelectorProps = {
  label: ReactNode;
  options: CategoryOption[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
};

export function ContentCategorySelector({
  label,
  options,
  value,
  onValueChange,
  className,
}: ContentCategorySelectorProps) {
  return (
    <section
      className={cx("yoyi-content-category-selector", className)}
      data-yoyi-ui="content-category-selector"
    >
      <h2>{label}</h2>
      <CategoryTabs
        ariaLabel={typeof label === "string" ? label : "内容分类"}
        onValueChange={onValueChange}
        options={options}
        value={value}
      />
    </section>
  );
}
