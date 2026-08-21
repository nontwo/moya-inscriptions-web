export type GestureAxis = "horizontal" | "vertical" | null;

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

export const zoomedEdgePageStep = ({
  deltaX,
  maxX,
  panX,
}: {
  deltaX: number;
  maxX: number;
  panX: number;
}): -1 | 1 | undefined => {
  if (maxX <= 0) return undefined;
  if (deltaX > 0 && panX >= maxX - 1) return -1;
  if (deltaX < 0 && panX <= -maxX + 1) return 1;
  return undefined;
};

export const shouldSuppressFocusOpen = (closedAt: number, now: number) =>
  now - closedAt < 350;
