import type { HTMLAttributes } from "react";

import type { FixedLabelName, IconName } from "../assets.js";
import { cx } from "../utils.js";

export type IconProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
  name: IconName;
  label?: string;
  size?: "sm" | "md" | "lg";
};

export function Icon({
  name,
  label,
  size = "md",
  className,
  ...props
}: IconProps) {
  return (
    <span
      {...props}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cx("yoyi-icon", `yoyi-icon--${size}`, className)}
      data-icon={name}
      data-yoyi-ui="icon"
      role={label ? "img" : undefined}
    />
  );
}

export type YoyiLogoProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> & {
  label?: string;
};

export function YoyiLogo({
  label = "由艺",
  className,
  ...props
}: YoyiLogoProps) {
  return (
    <span
      {...props}
      aria-label={label}
      className={cx("yoyi-logo", className)}
      data-yoyi-ui="logo"
      role="img"
    />
  );
}

export type FixedLabelMarkProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  "children"
> & {
  name: FixedLabelName;
  label: string;
  decorative?: boolean;
};

export function FixedLabelMark({
  name,
  label,
  decorative = false,
  className,
  ...props
}: FixedLabelMarkProps) {
  return (
    <span
      {...props}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      className={cx("yoyi-fixed-label", className)}
      data-label={name}
      data-yoyi-ui="fixed-label"
      role={decorative ? undefined : "img"}
    />
  );
}
