import type { HTMLAttributes, ReactNode } from "react";

import type { UiImage } from "../types.js";
import { cx } from "../utils.js";
import { MasonryLikeGrid, ResponsiveGrid } from "./layout.js";
import {
  Badge,
  ImageCard,
  type ImageCardProps,
  ThumbnailListItem,
} from "./primitives.js";

export type DiscoveryCardProps = ImageCardProps;

export function DiscoveryCard(props: DiscoveryCardProps) {
  return (
    <ImageCard
      {...props}
      className={cx("yoyi-discovery-card", props.className)}
    />
  );
}

export function DiscoveryGrid({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <MasonryLikeGrid
      {...props}
      className={cx("yoyi-discovery-grid", className)}
      density="compact"
    />
  );
}

export type InscriptionListItemProps = Omit<
  HTMLAttributes<HTMLLIElement>,
  "title"
> & {
  image: UiImage;
  title: ReactNode;
  href?: string;
  description?: ReactNode;
  metadata?: ReactNode;
  trailing?: ReactNode;
};

export function InscriptionListItem({
  image,
  title,
  href,
  description,
  metadata,
  trailing,
  className,
  ...props
}: InscriptionListItemProps) {
  return (
    <ThumbnailListItem
      {...props}
      className={cx("yoyi-inscription-list-item", className)}
      description={description}
      image={image}
      metadata={metadata}
      title={href ? <a href={href}>{title}</a> : title}
      trailing={trailing}
    />
  );
}

export function InscriptionList({
  className,
  ...props
}: HTMLAttributes<HTMLUListElement>) {
  return (
    <ul
      {...props}
      className={cx("yoyi-inscription-list", className)}
      data-yoyi-ui="inscription-list"
    />
  );
}

export type CalligraphyCardProps = ImageCardProps & {
  category?: ReactNode;
};

export function CalligraphyCard({
  category,
  metadata,
  className,
  ...props
}: CalligraphyCardProps) {
  return (
    <ImageCard
      {...props}
      className={cx("yoyi-calligraphy-card", className)}
      metadata={
        category || metadata ? (
          <div className="yoyi-calligraphy-card__metadata">
            {category ? <Badge>{category}</Badge> : null}
            {metadata}
          </div>
        ) : null
      }
    />
  );
}

export function CalligraphyGrid({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <ResponsiveGrid
      {...props}
      className={cx("yoyi-calligraphy-grid", className)}
      minItemWidth="compact"
    />
  );
}
