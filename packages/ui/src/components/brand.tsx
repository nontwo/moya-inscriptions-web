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

// These three animated category glyphs share the canonical SVG artwork.
// Direct vectors avoid the external CSS-mask paint path while a parent scales
// continuously from zero. Other Icon consumers retain their existing renderer.
const categoryArtwork = {
  nearby: {
    viewBox: "-2 0 28 24",
    path: "M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Zm-5.8 3.5a8 8 0 0 1 0-11.4m11.6 0a8 8 0 0 1 0 11.4M3.5 18.5a11.4 11.4 0 0 1 0-17m17 0a11.4 11.4 0 0 1 0 17",
    strokeWidth: 1.6,
    strokeLinejoin: undefined,
  },
  inscriptions: {
    viewBox: "0 0 24 24",
    path: "M7 20h10M8.2 20V7.2c0-2.1 1.7-3.7 3.8-3.7s3.8 1.6 3.8 3.7V20M10.4 8.2h3.2M10.4 11.4h3.2M10.4 14.6h3.2",
    strokeWidth: 1.7,
    strokeLinejoin: undefined,
  },
  calligraphy: {
    viewBox: "0 0 24 24",
    path: "M13.5 10.5 18 3l3 3-7.5 4.5Zm0 0c-1.4-1.4-3.6-1.4-5 0C6 13 7 17 3 21c4-1 7.7-.8 10.5-3.5 2-2 2-5 0-7ZM3 21c3.3-2 6.1-4.5 8-7.5",
    strokeWidth: 1.7,
    strokeLinejoin: "round",
  },
} as const;

export function AnimatedCategoryIcon({
  name,
}: {
  readonly name: keyof typeof categoryArtwork;
}) {
  const artwork = categoryArtwork[name];
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="24"
      height="24"
      viewBox={artwork.viewBox}
      preserveAspectRatio="xMidYMid meet"
      data-icon={name}
      data-icon-renderer="svg"
      data-yoyi-ui="icon"
    >
      <path
        d={artwork.path}
        fill="none"
        stroke="currentColor"
        strokeWidth={artwork.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin={artwork.strokeLinejoin}
      />
    </svg>
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
