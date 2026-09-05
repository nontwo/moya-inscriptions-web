import { quickActionNames } from "./quick-action-types";

import type { QuickActionName } from "./quick-action-types";

export type QuickActionLayoutDirection =
  | "above"
  | "below"
  | "left"
  | "right"
  | "upper-left"
  | "upper-right"
  | "lower-left"
  | "lower-right";

export interface QuickActionPoint {
  readonly x: number;
  readonly y: number;
}

export interface QuickActionPosition extends QuickActionPoint {
  readonly action: QuickActionName;
}

export interface QuickActionLayout {
  readonly anchor: QuickActionPoint;
  readonly direction: QuickActionLayoutDirection;
  readonly hitRadius: number;
  readonly positions: readonly QuickActionPosition[];
}

export interface QuickActionViewport {
  readonly height: number;
  readonly offsetLeft?: number;
  readonly offsetTop?: number;
  readonly safeInset?: number;
  readonly width: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

const templates: Readonly<
  Record<QuickActionLayoutDirection, readonly QuickActionPoint[]>
> = {
  above: [
    { x: -56, y: -68 },
    { x: 0, y: -82 },
    { x: 56, y: -68 },
  ],
  below: [
    { x: -56, y: 68 },
    { x: 0, y: 82 },
    { x: 56, y: 68 },
  ],
  left: [
    { x: -68, y: -56 },
    { x: -82, y: 0 },
    { x: -68, y: 56 },
  ],
  right: [
    { x: 68, y: -56 },
    { x: 82, y: 0 },
    { x: 68, y: 56 },
  ],
  "upper-left": [
    { x: -30, y: -76 },
    { x: -68, y: -48 },
    { x: -82, y: 0 },
  ],
  "upper-right": [
    { x: 30, y: -76 },
    { x: 68, y: -48 },
    { x: 82, y: 0 },
  ],
  "lower-left": [
    { x: -30, y: 76 },
    { x: -68, y: 48 },
    { x: -82, y: 0 },
  ],
  "lower-right": [
    { x: 30, y: 76 },
    { x: 68, y: 48 },
    { x: 82, y: 0 },
  ],
};

const directionPreference = (
  anchor: QuickActionPoint,
  viewport: Required<QuickActionViewport>,
): readonly QuickActionLayoutDirection[] => {
  const left = anchor.x - viewport.offsetLeft;
  const top = anchor.y - viewport.offsetTop;
  const right = viewport.width - left;
  const bottom = viewport.height - top;
  const edge = 112;

  if (left < edge && top < edge)
    return [
      "lower-right",
      "right",
      "below",
      "upper-right",
      "above",
      "left",
      "lower-left",
      "upper-left",
    ];
  if (right < edge && top < edge)
    return [
      "lower-left",
      "left",
      "below",
      "upper-left",
      "above",
      "right",
      "lower-right",
      "upper-right",
    ];
  if (left < edge && bottom < edge)
    return [
      "upper-right",
      "right",
      "above",
      "lower-right",
      "below",
      "left",
      "upper-left",
      "lower-left",
    ];
  if (right < edge && bottom < edge)
    return [
      "upper-left",
      "left",
      "above",
      "lower-left",
      "below",
      "right",
      "upper-right",
      "lower-right",
    ];
  if (top < edge)
    return [
      "below",
      "lower-right",
      "lower-left",
      "right",
      "left",
      "above",
      "upper-right",
      "upper-left",
    ];
  if (bottom < edge)
    return [
      "above",
      "upper-right",
      "upper-left",
      "right",
      "left",
      "below",
      "lower-right",
      "lower-left",
    ];
  if (left < edge)
    return [
      "right",
      "upper-right",
      "lower-right",
      "above",
      "below",
      "left",
      "upper-left",
      "lower-left",
    ];
  if (right < edge)
    return [
      "left",
      "upper-left",
      "lower-left",
      "above",
      "below",
      "right",
      "upper-right",
      "lower-right",
    ];
  return top > viewport.height / 2
    ? [
        "above",
        "upper-right",
        "upper-left",
        "right",
        "left",
        "below",
        "lower-right",
        "lower-left",
      ]
    : [
        "below",
        "lower-right",
        "lower-left",
        "right",
        "left",
        "above",
        "upper-right",
        "upper-left",
      ];
};

const overflowFor = (
  points: readonly QuickActionPoint[],
  viewport: Required<QuickActionViewport>,
  radius: number,
) => {
  const left = viewport.offsetLeft + viewport.safeInset + radius;
  const top = viewport.offsetTop + viewport.safeInset + radius;
  const right =
    viewport.offsetLeft + viewport.width - viewport.safeInset - radius;
  const bottom =
    viewport.offsetTop + viewport.height - viewport.safeInset - radius;
  return points.reduce(
    (overflow, point) =>
      overflow +
      Math.max(0, left - point.x) +
      Math.max(0, point.x - right) +
      Math.max(0, top - point.y) +
      Math.max(0, point.y - bottom),
    0,
  );
};

export const resolveQuickActionLayout = (
  anchor: QuickActionPoint,
  viewportInput: QuickActionViewport,
): QuickActionLayout => {
  const viewport: Required<QuickActionViewport> = {
    height: Math.max(1, viewportInput.height),
    offsetLeft: viewportInput.offsetLeft ?? 0,
    offsetTop: viewportInput.offsetTop ?? 0,
    safeInset: viewportInput.safeInset ?? 16,
    width: Math.max(1, viewportInput.width),
  };
  const hitRadius = 32;
  const preference = directionPreference(anchor, viewport);
  const candidates = preference.map((direction, priority) => {
    const points = templates[direction].map((point) => ({
      x: anchor.x + point.x,
      y: anchor.y + point.y,
    }));
    return {
      direction,
      points,
      score: overflowFor(points, viewport, hitRadius) * 10_000 + priority,
    };
  });
  const selected = candidates.reduce((best, candidate) =>
    candidate.score < best.score ? candidate : best,
  );
  const minimumX = viewport.offsetLeft + viewport.safeInset + hitRadius;
  const maximumX =
    viewport.offsetLeft + viewport.width - viewport.safeInset - hitRadius;
  const minimumY = viewport.offsetTop + viewport.safeInset + hitRadius;
  const maximumY =
    viewport.offsetTop + viewport.height - viewport.safeInset - hitRadius;

  return {
    anchor,
    direction: selected.direction,
    hitRadius,
    positions: selected.points.map((point, index) => ({
      action: quickActionNames[index]!,
      x: clamp(point.x, minimumX, maximumX),
      y: clamp(point.y, minimumY, maximumY),
    })),
  };
};

export const resolveQuickActionCandidate = (
  point: QuickActionPoint,
  layout: QuickActionLayout,
  current: QuickActionName | null,
): QuickActionName | null => {
  if (Math.hypot(point.x - layout.anchor.x, point.y - layout.anchor.y) <= 24)
    return null;

  if (current !== null) {
    const active = layout.positions.find(({ action }) => action === current);
    if (
      active !== undefined &&
      Math.hypot(point.x - active.x, point.y - active.y) <=
        layout.hitRadius + 10
    ) {
      return current;
    }
  }

  const nearest = layout.positions
    .map((position) => ({
      action: position.action,
      distance: Math.hypot(point.x - position.x, point.y - position.y),
    }))
    .sort((left, right) => left.distance - right.distance)[0];

  return nearest !== undefined && nearest.distance <= layout.hitRadius
    ? nearest.action
    : null;
};
