export const HORIZONTAL_PAGER_FALLBACK_STABLE_FRAMES = 4;
export const HORIZONTAL_PAGER_CLICK_SUPPRESS_PX = 8;
export const HORIZONTAL_PAGER_SCROLL_TOLERANCE_PX = 2;
export const HORIZONTAL_PAGER_SETTLE_MS = 150;

export type PagerDirection = "pending" | "horizontal" | "vertical";

export const resolvePagerDirection = (
  direction: PagerDirection,
  deltaX: number,
  deltaY: number,
): PagerDirection => {
  if (direction !== "pending") return direction;
  if (Math.abs(deltaX) >= 12 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5)
    return "horizontal";
  if (Math.abs(deltaY) >= 12 && Math.abs(deltaY) >= Math.abs(deltaX))
    return "vertical";
  return "pending";
};

export const pagerSettleProgress = (elapsedMs: number): number => {
  const progress = Math.max(
    0,
    Math.min(1, elapsedMs / HORIZONTAL_PAGER_SETTLE_MS),
  );
  return 1 - (1 - progress) ** 3;
};

export const resolvePagerRelease = (
  left: number,
  offsets: readonly number[],
  origin: number,
  velocity: number,
): number => {
  const distance = left - (offsets[origin] ?? 0);
  const target =
    Math.abs(velocity) >= 0.5 && Math.abs(distance) >= 24
      ? origin + Math.sign(velocity)
      : resolveHorizontalPagerSettledIndex(left, offsets);
  return Math.max(
    0,
    origin - 1,
    Math.min(offsets.length - 1, origin + 1, target),
  );
};

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
