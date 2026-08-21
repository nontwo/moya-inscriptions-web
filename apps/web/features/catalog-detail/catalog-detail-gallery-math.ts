export type GestureAxis = "horizontal" | "vertical" | null;

export type FocusWheelIntent = "page" | "pan" | "zoom";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const lockGalleryGestureAxis = (
  x: number,
  y: number,
  threshold = 10,
  directionRatio = 1.25,
): GestureAxis => {
  if (Math.max(Math.abs(x), Math.abs(y)) < threshold) return null;
  if (Math.abs(x) > Math.abs(y) * directionRatio) return "horizontal";
  if (Math.abs(y) > Math.abs(x) * directionRatio) return "vertical";
  return null;
};

export const shouldCommitGallerySwipe = ({
  deltaX,
  deltaY,
  duration,
  index,
  total,
  velocity,
  width,
}: {
  deltaX: number;
  deltaY: number;
  duration: number;
  index: number;
  total: number;
  velocity?: number;
  width: number;
}) => {
  if (Math.abs(deltaX) <= Math.abs(deltaY)) return false;
  const goingNext = deltaX < 0;
  if ((goingNext && index >= total - 1) || (!goingNext && index <= 0))
    return false;
  const speed = velocity ?? deltaX / Math.max(16, duration);
  return (
    Math.abs(deltaX) >= Math.max(48, width * 0.18) || Math.abs(speed) >= 0.55
  );
};

export const containedImagePanBounds = ({
  naturalHeight,
  naturalWidth,
  scale,
  stageHeight,
  stageWidth,
}: {
  naturalHeight: number;
  naturalWidth: number;
  scale: number;
  stageHeight: number;
  stageWidth: number;
}) => {
  const fit = Math.min(stageWidth / naturalWidth, stageHeight / naturalHeight);
  const fitWidth = naturalWidth * fit;
  const fitHeight = naturalHeight * fit;
  return {
    fitHeight,
    fitWidth,
    maxX: Math.max(0, (fitWidth * scale - stageWidth) / 2),
    maxY: Math.max(0, (fitHeight * scale - stageHeight) / 2),
  };
};

export const dynamicFocusMaxScale = ({
  naturalHeight,
  naturalWidth,
  stageHeight,
  stageWidth,
}: {
  naturalHeight: number;
  naturalWidth: number;
  stageHeight: number;
  stageWidth: number;
}) => {
  const fit = Math.min(stageWidth / naturalWidth, stageHeight / naturalHeight);
  return clamp(1 / Math.max(fit, Number.EPSILON), 4, 8);
};

export const zoomFocusAt = ({
  maxScale,
  naturalHeight,
  naturalWidth,
  originX,
  originY,
  panX,
  panY,
  scale,
  stageHeight,
  stageWidth,
  targetScale,
}: {
  maxScale: number;
  naturalHeight: number;
  naturalWidth: number;
  originX: number;
  originY: number;
  panX: number;
  panY: number;
  scale: number;
  stageHeight: number;
  stageWidth: number;
  targetScale: number;
}) => {
  const nextScale = clamp(targetScale, 1, maxScale);
  const centerX = stageWidth / 2;
  const centerY = stageHeight / 2;
  const imageX = (originX - centerX - panX) / scale;
  const imageY = (originY - centerY - panY) / scale;
  const bounds = containedImagePanBounds({
    naturalHeight,
    naturalWidth,
    scale: nextScale,
    stageHeight,
    stageWidth,
  });
  return {
    scale: nextScale,
    x: clamp(originX - centerX - imageX * nextScale, -bounds.maxX, bounds.maxX),
    y: clamp(originY - centerY - imageY * nextScale, -bounds.maxY, bounds.maxY),
  };
};

export const wheelGestureDelta = ({
  deltaMode,
  deltaX,
}: {
  deltaMode: number;
  deltaX: number;
}) => (deltaMode === 1 ? deltaX * 16 : deltaMode === 2 ? deltaX * 240 : deltaX);

export const classifyFocusWheel = ({
  ctrlKey,
  deltaMode,
  deltaX,
  deltaY,
  metaKey,
  scale,
}: {
  ctrlKey: boolean;
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  metaKey: boolean;
  scale: number;
}): FocusWheelIntent => {
  if (
    ctrlKey ||
    metaKey ||
    deltaMode !== 0 ||
    (Math.abs(deltaY) >= 40 && Math.abs(deltaX) < 1)
  )
    return "zoom";
  if (scale > 1 && Math.abs(deltaY) >= Math.abs(deltaX)) return "pan";
  return "page";
};

export const recentPointerVelocity = ({
  currentTime,
  currentX,
  lastTime,
  lastX,
  startTime,
  startX,
}: {
  currentTime: number;
  currentX: number;
  lastTime: number;
  lastX: number;
  startTime: number;
  startX: number;
}) => {
  const recentDuration = currentTime - lastTime;
  if (recentDuration > 0 && recentDuration < 80)
    return (currentX - lastX) / recentDuration;
  return (currentX - startX) / Math.max(16, currentTime - startTime);
};

export const edgeCarouselDelta = ({
  attemptedPanX,
  boundedPanX,
}: {
  attemptedPanX: number;
  boundedPanX: number;
}) => attemptedPanX - boundedPanX;

export const shouldSuppressFocusOpen = (closedAt: number, now: number) =>
  now - closedAt < 350;
