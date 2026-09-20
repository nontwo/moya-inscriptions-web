"use client";

import { createContext } from "react";

/** Detail's outer scroller remains the owner across the two content pages. */
export const CatalogDetailScrollContext = createContext<{
  readonly read: () => number;
  readonly restore: (top: number) => void;
  readonly collapseTop: (section: HTMLElement) => number;
} | null>(null);
