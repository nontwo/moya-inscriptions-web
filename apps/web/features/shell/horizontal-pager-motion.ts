export const HORIZONTAL_PAGER_FALLBACK_STABLE_FRAMES = 4;
export const HORIZONTAL_PAGER_CLICK_SUPPRESS_PX = 8;
export const HORIZONTAL_PAGER_SCROLL_TOLERANCE_PX = 2;

export const horizontalPagerProgress = (
  scrollLeft: number,
  offsets: readonly number[],
): number => {
  if (offsets.length <= 1) return 0;
  if (scrollLeft <= (offsets[0] ?? 0)) return 0;
  for (let index = 0; index < offsets.length - 1; index += 1) {
    const start = offsets[index] ?? 0;
    const end = offsets[index + 1] ?? start + 1;
    if (scrollLeft <= end) {
      return index + (scrollLeft - start) / Math.max(1, end - start);
    }
  }
  return offsets.length - 1;
};

export const resolveHorizontalPagerSettledIndex = (
  scrollLeft: number,
  offsets: readonly number[],
): number => {
  let targetIndex = 0;
  let targetDistance = Number.POSITIVE_INFINITY;
  for (const [index, offset] of offsets.entries()) {
    const distance = Math.abs(scrollLeft - offset);
    if (distance < targetDistance) {
      targetDistance = distance;
      targetIndex = index;
    }
  }
  return targetIndex;
};

export const isHorizontalPagerAtOffset = (
  scrollLeft: number,
  offset: number,
): boolean =>
  Math.abs(scrollLeft - offset) <= HORIZONTAL_PAGER_SCROLL_TOLERANCE_PX;

export const isExplicitHorizontalWheel = (
  deltaX: number,
  deltaY: number,
  ctrlKey = false,
): boolean =>
  !ctrlKey &&
  Math.abs(deltaX) >= 8 &&
  Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
