import { quickActionNames } from "./quick-action-types";
import type { QuickActionName } from "./quick-action-types";

export interface QuickActionPoint {
  readonly x: number;
  readonly y: number;
}
export interface QuickActionViewport {
  readonly width: number;
  readonly height: number;
  readonly scale?: number;
  readonly offsetLeft?: number;
  readonly offsetTop?: number;
  readonly insets?: {
    readonly top: number;
    readonly right: number;
    readonly bottom: number;
    readonly left: number;
  };
}
export interface QuickActionLayout {
  readonly anchor: QuickActionPoint;
  readonly direction: string;
  readonly hitRadius: number;
  readonly inverseScale: number;
  readonly positions: readonly (QuickActionPoint & {
    readonly action: QuickActionName;
  })[];
}

// The bounded fans and hit geometry are adapted from PR #94.
const fans = {
  above: [
    [-56, -68],
    [0, -82],
    [56, -68],
  ],
  below: [
    [-56, 68],
    [0, 82],
    [56, 68],
  ],
  left: [
    [-68, -56],
    [-82, 0],
    [-68, 56],
  ],
  right: [
    [68, -56],
    [82, 0],
    [68, 56],
  ],
  "upper-left": [
    [-30, -76],
    [-68, -48],
    [-82, 0],
  ],
  "upper-right": [
    [30, -76],
    [68, -48],
    [82, 0],
  ],
  "lower-left": [
    [-30, 76],
    [-68, 48],
    [-82, 0],
  ],
  "lower-right": [
    [30, 76],
    [68, 48],
    [82, 0],
  ],
} as const;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(n, hi));

export const resolveQuickActionLayout = (
  anchor: QuickActionPoint,
  viewport: QuickActionViewport,
): QuickActionLayout => {
  // Geometry is defined at the unzoomed screen size. Pointer coordinates and
  // visualViewport bounds share layout CSS coordinates, so calibrate both the
  // hit regions and their rendered targets by the same scale.
  const inverseScale = 1 / (viewport.scale ?? 1);
  const hitRadius = 32 * inverseScale;
  const inset = viewport.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const left =
    (viewport.offsetLeft ?? 0) +
    Math.max(16, inset.left) * inverseScale +
    hitRadius;
  const top =
    (viewport.offsetTop ?? 0) +
    Math.max(16, inset.top) * inverseScale +
    hitRadius;
  const right = Math.max(
    left,
    (viewport.offsetLeft ?? 0) +
      viewport.width -
      Math.max(16, inset.right) * inverseScale -
      hitRadius,
  );
  const bottom = Math.max(
    top,
    (viewport.offsetTop ?? 0) +
      viewport.height -
      Math.max(16, inset.bottom) * inverseScale -
      hitRadius,
  );
  const preferred =
    anchor.y > (viewport.offsetTop ?? 0) + viewport.height / 2
      ? "above"
      : "below";
  const candidates = Object.entries(fans).map(([direction, offsets]) => {
    const points = offsets.map(([x, y]) => ({
      x: anchor.x + x * inverseScale,
      y: anchor.y + y * inverseScale,
    }));
    const overflow = points.reduce(
      (sum, p) =>
        sum +
        Math.abs(p.x - clamp(p.x, left, right)) +
        Math.abs(p.y - clamp(p.y, top, bottom)),
      0,
    );
    return {
      direction,
      points,
      score: overflow * 10000 + (direction === preferred ? 0 : 1),
    };
  });
  const best = candidates.reduce((a, b) => (a.score <= b.score ? a : b));
  // Translate the whole fan. Clamping targets independently crowds corners
  // and can keep a previous candidate active at another target's center.
  const minX = Math.min(...best.points.map((p) => p.x));
  const maxX = Math.max(...best.points.map((p) => p.x));
  const minY = Math.min(...best.points.map((p) => p.y));
  const maxY = Math.max(...best.points.map((p) => p.y));
  const dx = clamp(0, left - minX, right - maxX);
  const dy = clamp(0, top - minY, bottom - maxY);
  return {
    anchor,
    direction: best.direction,
    hitRadius,
    inverseScale,
    positions: best.points.map((p, i) => ({
      action: quickActionNames[i]!,
      x: p.x + dx,
      y: p.y + dy,
    })),
  };
};

export const resolveQuickActionCandidate = (
  point: QuickActionPoint,
  layout: QuickActionLayout,
  current: QuickActionName | null,
): QuickActionName | null => {
  if (
    Math.hypot(point.x - layout.anchor.x, point.y - layout.anchor.y) <=
    24 * layout.inverseScale
  )
    return null;
  const active = layout.positions.find((p) => p.action === current);
  if (
    active &&
    Math.hypot(point.x - active.x, point.y - active.y) <=
      layout.hitRadius + 10 * layout.inverseScale
  )
    return active.action;
  const nearest = layout.positions
    .map((p) => ({ ...p, distance: Math.hypot(point.x - p.x, point.y - p.y) }))
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest && nearest.distance <= layout.hitRadius
    ? nearest.action
    : null;
};
