import {
  forwardRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

import type { UiImage } from "../types.ts";
import { cx } from "../utils.ts";
import { Icon } from "./brand.tsx";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      className,
      children,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        {...props}
        aria-busy={loading || undefined}
        className={cx(
          "yoyi-button",
          `yoyi-button--${variant}`,
          `yoyi-button--${size}`,
          className,
        )}
        data-yoyi-ui="button"
        disabled={disabled || loading}
        ref={ref}
        type={type}
      >
        {loading ? <Icon name="loading" /> : null}
        <span>{children}</span>
      </button>
    );
  },
);

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "aria-label"
> & {
  label: string;
  icon: ReactNode;
  variant?: "quiet" | "outlined" | "filled";
  size?: "sm" | "md" | "lg";
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      label,
      icon,
      variant = "quiet",
      size = "md",
      className,
      type = "button",
      ...props
    },
    ref,
  ) {
    return (
      <button
        {...props}
        aria-label={label}
        className={cx(
          "yoyi-icon-button",
          `yoyi-icon-button--${variant}`,
          `yoyi-icon-button--${size}`,
          className,
        )}
        data-yoyi-ui="icon-button"
        ref={ref}
        type={type}
      >
        {icon}
      </button>
    );
  },
);

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  invalid?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className, ...props },
  ref,
) {
  return (
    <input
      {...props}
      aria-invalid={invalid || undefined}
      className={cx("yoyi-input", invalid && "is-invalid", className)}
      data-yoyi-ui="input"
      ref={ref}
    />
  );
});

export type SearchInputProps = Omit<InputProps, "type"> & {
  label: string;
  clearLabel?: string;
  onClear?: () => void;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  function SearchInput(
    {
      label,
      clearLabel = "清除搜索",
      onClear,
      value,
      defaultValue,
      className,
      ...props
    },
    ref,
  ) {
    const hasValue =
      (typeof value === "string" && value.length > 0) ||
      (typeof defaultValue === "string" && defaultValue.length > 0);

    return (
      <label
        className={cx("yoyi-search-input", className)}
        data-yoyi-ui="search-input"
      >
        <span className="yoyi-visually-hidden">{label}</span>
        <Icon name="search" />
        <input
          {...props}
          aria-label={label}
          defaultValue={defaultValue}
          ref={ref}
          type="search"
          value={value}
        />
        {onClear && hasValue ? (
          <IconButton
            icon={<Icon name="close" size="sm" />}
            label={clearLabel}
            onClick={onClear}
            size="sm"
          />
        ) : null}
      </label>
    );
  },
);

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  invalid?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  function Textarea({ invalid = false, className, ...props }, ref) {
    return (
      <textarea
        {...props}
        aria-invalid={invalid || undefined}
        className={cx("yoyi-textarea", invalid && "is-invalid", className)}
        data-yoyi-ui="textarea"
        ref={ref}
      />
    );
  },
);

export type CardProps = HTMLAttributes<HTMLElement> & {
  interactive?: boolean;
};

export const Card = forwardRef<HTMLElement, CardProps>(function Card(
  { interactive = false, className, children, ...props },
  ref,
) {
  return (
    <article
      {...props}
      className={cx(
        "yoyi-card",
        interactive && "yoyi-card--interactive",
        className,
      )}
      data-yoyi-ui="card"
      ref={ref}
    >
      {children}
    </article>
  );
});

export type ImageCardProps = Omit<CardProps, "title"> & {
  image: UiImage;
  title: ReactNode;
  href?: string;
  metadata?: ReactNode;
  footer?: ReactNode;
  aspectRatio?: "portrait" | "landscape" | "square";
};

export function ImageCard({
  image,
  title,
  href,
  metadata,
  footer,
  aspectRatio = "portrait",
  className,
  ...props
}: ImageCardProps) {
  const titleContent = href ? <a href={href}>{title}</a> : title;

  return (
    <Card
      {...props}
      className={cx("yoyi-image-card", className)}
      interactive={Boolean(href)}
    >
      <div
        className={cx(
          "yoyi-image-card__media",
          `yoyi-image-card__media--${aspectRatio}`,
        )}
      >
        <img
          alt={image.alt}
          decoding="async"
          height={image.height}
          loading="lazy"
          sizes={image.sizes}
          src={image.src}
          srcSet={image.srcSet}
          width={image.width}
        />
      </div>
      <div className="yoyi-image-card__body">
        <h3 className="yoyi-image-card__title">{titleContent}</h3>
        {metadata ? (
          <div className="yoyi-image-card__metadata">{metadata}</div>
        ) : null}
        {footer ? (
          <div className="yoyi-image-card__footer">{footer}</div>
        ) : null}
      </div>
    </Card>
  );
}

export type ListItemProps = Omit<HTMLAttributes<HTMLLIElement>, "title"> & {
  title: ReactNode;
  description?: ReactNode;
  metadata?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
};

export const ListItem = forwardRef<HTMLLIElement, ListItemProps>(
  function ListItem(
    { title, description, metadata, leading, trailing, className, ...props },
    ref,
  ) {
    return (
      <li
        {...props}
        className={cx("yoyi-list-item", className)}
        data-yoyi-ui="list-item"
        ref={ref}
      >
        {leading ? (
          <div className="yoyi-list-item__leading">{leading}</div>
        ) : null}
        <div className="yoyi-list-item__body">
          <div className="yoyi-list-item__title">{title}</div>
          {description ? (
            <div className="yoyi-list-item__description">{description}</div>
          ) : null}
          {metadata ? (
            <div className="yoyi-list-item__metadata">{metadata}</div>
          ) : null}
        </div>
        {trailing ? (
          <div className="yoyi-list-item__trailing">{trailing}</div>
        ) : null}
      </li>
    );
  },
);

export type ThumbnailListItemProps = Omit<ListItemProps, "leading"> & {
  image: UiImage;
};

export function ThumbnailListItem({ image, ...props }: ThumbnailListItemProps) {
  return (
    <ListItem
      {...props}
      leading={
        <img
          alt={image.alt}
          decoding="async"
          height={image.height}
          loading="lazy"
          sizes={image.sizes}
          src={image.src}
          srcSet={image.srcSet}
          width={image.width}
        />
      }
    />
  );
}

export type TagProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "success" | "warning" | "error";
};

export function Tag({ tone = "neutral", className, ...props }: TagProps) {
  return (
    <span
      {...props}
      className={cx("yoyi-tag", `yoyi-tag--${tone}`, className)}
      data-yoyi-ui="tag"
    />
  );
}

export type CategoryTagProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-pressed"
> & {
  selected?: boolean;
};

export function CategoryTag({
  selected = false,
  className,
  type = "button",
  ...props
}: CategoryTagProps) {
  return (
    <button
      {...props}
      aria-pressed={selected}
      className={cx("yoyi-category-tag", selected && "is-selected", className)}
      data-yoyi-ui="category-tag"
      type={type}
    />
  );
}

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "accent" | "info";
};

export function Badge({ tone = "neutral", className, ...props }: BadgeProps) {
  return (
    <span
      {...props}
      className={cx("yoyi-badge", `yoyi-badge--${tone}`, className)}
      data-yoyi-ui="badge"
    />
  );
}

export function Divider({
  className,
  ...props
}: HTMLAttributes<HTMLHRElement>) {
  return (
    <hr
      {...props}
      className={cx("yoyi-divider", className)}
      data-yoyi-ui="divider"
    />
  );
}

export type SkeletonProps = HTMLAttributes<HTMLSpanElement> & {
  width?: string | number;
  height?: string | number;
  label?: string;
};

export function Skeleton({
  width,
  height,
  label = "内容加载中",
  className,
  style,
  ...props
}: SkeletonProps) {
  return (
    <span
      {...props}
      aria-label={label}
      className={cx("yoyi-skeleton", className)}
      data-yoyi-ui="skeleton"
      role="status"
      style={{ ...style, width, height }}
    />
  );
}
