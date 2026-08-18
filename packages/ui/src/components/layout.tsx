import type { HTMLAttributes, ReactNode } from "react";

import { cx } from "../utils.ts";

export type PageContainerProps = HTMLAttributes<HTMLDivElement> & {
  readingWidth?: boolean;
  bottomNavigationSpace?: boolean;
};

export function PageContainer({
  readingWidth = false,
  bottomNavigationSpace = true,
  className,
  ...props
}: PageContainerProps) {
  return (
    <div
      {...props}
      className={cx(
        "yoyi-page-container",
        readingWidth && "yoyi-page-container--reading",
        bottomNavigationSpace && "yoyi-page-container--with-bottom-navigation",
        className,
      )}
      data-yoyi-ui="page-container"
    />
  );
}

export type ContentSectionProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function ContentSection({
  title,
  description,
  action,
  className,
  children,
  ...props
}: ContentSectionProps) {
  return (
    <section
      {...props}
      className={cx("yoyi-content-section", className)}
      data-yoyi-ui="content-section"
    >
      {title || description || action ? (
        <header className="yoyi-content-section__header">
          <div>
            {title ? <h2>{title}</h2> : null}
            {description ? <p>{description}</p> : null}
          </div>
          {action ? <div>{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export type ResponsiveGridProps = HTMLAttributes<HTMLDivElement> & {
  minItemWidth?: "compact" | "standard" | "wide";
};

export function ResponsiveGrid({
  minItemWidth = "standard",
  className,
  ...props
}: ResponsiveGridProps) {
  return (
    <div
      {...props}
      className={cx(
        "yoyi-responsive-grid",
        `yoyi-responsive-grid--${minItemWidth}`,
        className,
      )}
      data-yoyi-ui="responsive-grid"
    />
  );
}

export type MasonryLikeGridProps = HTMLAttributes<HTMLDivElement> & {
  density?: "comfortable" | "compact";
};

export function MasonryLikeGrid({
  density = "comfortable",
  className,
  ...props
}: MasonryLikeGridProps) {
  return (
    <div
      {...props}
      className={cx(
        "yoyi-masonry-grid",
        `yoyi-masonry-grid--${density}`,
        className,
      )}
      data-yoyi-ui="masonry-grid"
    />
  );
}
