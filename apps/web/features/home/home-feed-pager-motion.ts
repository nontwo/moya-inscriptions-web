export const HOME_PAGER_SCROLL_IDLE_MS = 120;
export const HOME_PAGER_CLICK_SUPPRESS_PX = 8;
export const HOME_PAGER_SCROLL_TOLERANCE_PX = 1;

export const homePagerProgress = (
  scrollLeft: number,
  width: number,
  lastIndex: number,
): number => {
  const safeWidth = Math.max(1, width);
  return Math.max(0, Math.min(lastIndex, scrollLeft / safeWidth));
};

export const resolveHomePagerSettledIndex = (
  originIndex: number,
  lastIndex: number,
  scrollLeft: number,
  width: number,
  requestedIndex: number | null = null,
): number => {
  if (requestedIndex !== null) {
    return Math.max(0, Math.min(lastIndex, requestedIndex));
  }
  const rawIndex = Math.round(homePagerProgress(scrollLeft, width, lastIndex));
  return Math.max(
    0,
    Math.min(lastIndex, originIndex + 1, Math.max(originIndex - 1, rawIndex)),
  );
};

export const isHomePagerAtIndex = (
  scrollLeft: number,
  width: number,
  index: number,
): boolean =>
  Math.abs(scrollLeft - Math.max(1, width) * index) <=
  HOME_PAGER_SCROLL_TOLERANCE_PX;

export const isExplicitHorizontalHomeWheel = (
  deltaX: number,
  deltaY: number,
  ctrlKey = false,
): boolean =>
  !ctrlKey &&
  Math.abs(deltaX) >= 8 &&
  Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
