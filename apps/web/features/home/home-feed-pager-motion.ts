export const HOME_PAGER_AXIS_LOCK_PX = 8;
export const HOME_PAGER_DISTANCE_RATIO = 0.18;
export const HOME_PAGER_FLICK_VELOCITY = 0.45;
export const HOME_PAGER_EDGE_RESISTANCE = 0.25;
export const HOME_PAGER_AXIS_DOMINANCE = 1.15;

export type HomePagerAxis = "horizontal" | "vertical" | null;

export const resolveHomePagerAxis = (
  deltaX: number,
  deltaY: number,
): HomePagerAxis => {
  if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < HOME_PAGER_AXIS_LOCK_PX) {
    return null;
  }
  const absoluteX = Math.abs(deltaX);
  const absoluteY = Math.abs(deltaY);
  if (absoluteX > absoluteY * HOME_PAGER_AXIS_DOMINANCE) return "horizontal";
  if (absoluteY > absoluteX * HOME_PAGER_AXIS_DOMINANCE) return "vertical";
  return null;
};

export const resistHomePagerEdge = (
  deltaX: number,
  activeIndex: number,
  lastIndex: number,
): number => {
  const beyondStart = activeIndex === 0 && deltaX > 0;
  const beyondEnd = activeIndex === lastIndex && deltaX < 0;
  return beyondStart || beyondEnd
    ? deltaX * HOME_PAGER_EDGE_RESISTANCE
    : deltaX;
};

export const resolveHomePagerTarget = (
  activeIndex: number,
  lastIndex: number,
  deltaX: number,
  width: number,
  velocityX: number,
): number => {
  const safeWidth = Math.max(1, width);
  const direction = deltaX < 0 ? 1 : deltaX > 0 ? -1 : 0;
  const distanceQualified =
    Math.abs(deltaX) / safeWidth >= HOME_PAGER_DISTANCE_RATIO;
  const velocityQualified =
    Math.abs(velocityX) >= HOME_PAGER_FLICK_VELOCITY &&
    Math.sign(velocityX) === Math.sign(deltaX);
  if (direction === 0 || (!distanceQualified && !velocityQualified)) {
    return activeIndex;
  }
  return Math.max(0, Math.min(lastIndex, activeIndex + direction));
};

export const isExplicitHorizontalHomeWheel = (
  deltaX: number,
  deltaY: number,
  ctrlKey = false,
): boolean =>
  !ctrlKey &&
  Math.abs(deltaX) >= HOME_PAGER_AXIS_LOCK_PX &&
  Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
