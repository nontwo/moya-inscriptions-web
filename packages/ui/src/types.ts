import type { ReactNode } from "react";

import type { FixedLabelName, IconName } from "./assets.ts";

export type NavigationItem = {
  id: string;
  label: string;
  labelMark?: FixedLabelName;
  href?: string;
  icon?: IconName | ReactNode;
  disabled?: boolean;
};

export type CategoryOption = {
  id: string;
  label: string;
  labelMark?: FixedLabelName;
  icon?: ReactNode;
  disabled?: boolean;
};

export type TabOption = CategoryOption & {
  panelId?: string;
};

export type UiImage = {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  srcSet?: string;
  sizes?: string;
};
