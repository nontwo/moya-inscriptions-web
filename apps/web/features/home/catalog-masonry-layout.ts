export const HOME_ULTRA_WIDE_RATIO = 2.4;
export const HOME_PC_MIN_COLUMNS = 3;
export const HOME_PC_MAX_COLUMNS = 8;
export const HOME_PC_MIN_CARD_WIDTH = 220;
export const HOME_PC_MAX_CARD_WIDTH = 320;

export interface MasonryLayoutItem {
  readonly height: number;
  readonly spanAll?: boolean;
}

export interface MasonryPosition {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface MasonryLayoutResult {
  readonly height: number;
  readonly positions: readonly MasonryPosition[];
}

export const resolveHomeMasonryColumns = (
  availableWidth: number,
  gap: number,
  platform: "phone" | "tablet" | "pc",
  feedLayout: "single" | "double",
): number => {
  if (platform !== "pc") return feedLayout === "single" ? 1 : 2;

  const width = Number.isFinite(availableWidth)
    ? Math.max(0, availableWidth)
    : 0;
  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  let columns = Math.max(
    HOME_PC_MIN_COLUMNS,
    Math.min(
      HOME_PC_MAX_COLUMNS,
      Math.floor((width + safeGap) / (HOME_PC_MIN_CARD_WIDTH + safeGap)),
    ),
  );
  let cardWidth = (width - safeGap * Math.max(0, columns - 1)) / columns;

  while (columns < HOME_PC_MAX_COLUMNS && cardWidth > HOME_PC_MAX_CARD_WIDTH) {
    columns += 1;
    cardWidth = (width - safeGap * Math.max(0, columns - 1)) / columns;
  }

  return columns;
};

export const layoutHomeMasonry = (
  items: readonly MasonryLayoutItem[],
  availableWidth: number,
  columns: number,
  gap: number,
): MasonryLayoutResult => {
  const safeColumns = Math.max(1, Math.floor(columns));
  const safeGap = Number.isFinite(gap) ? Math.max(0, gap) : 0;
  const safeWidth = Number.isFinite(availableWidth)
    ? Math.max(0, availableWidth)
    : 0;
  const columnWidth =
    (safeWidth - safeGap * Math.max(0, safeColumns - 1)) / safeColumns;
  const heights = Array.from({ length: safeColumns }, () => 0);
  const positions: MasonryPosition[] = [];

  for (const item of items) {
    const height = Number.isFinite(item.height) ? Math.max(0, item.height) : 0;
    if (item.spanAll === true && safeColumns > 1) {
      const y = Math.max(...heights);
      positions.push({ height, width: safeWidth, x: 0, y });
      const nextHeight = y + height + safeGap;
      heights.fill(nextHeight);
      continue;
    }

    const shortest = Math.min(...heights);
    const column = heights.indexOf(shortest);
    const x = column * (columnWidth + safeGap);
    positions.push({ height, width: columnWidth, x, y: shortest });
    heights[column] = shortest + height + safeGap;
  }

  const tallest = Math.max(0, ...heights);
  return {
    height: tallest > 0 ? Math.max(0, tallest - safeGap) : 0,
    positions,
  };
};
