import { describe, expect, it } from "vitest";
import {
  resolveQuickActionCandidate,
  resolveQuickActionLayout,
} from "./quick-action-layout";

describe("bounded fan layout and hit testing", () => {
  it.each([3, 5])(
    "keeps targets visible and selectable in a %sx visual viewport",
    (scale) => {
      const viewport = {
        width: 390 / scale,
        height: 844 / scale,
        offsetLeft: 50,
        offsetTop: 80,
        scale,
      };
      const layout = resolveQuickActionLayout(
        { x: 50 + viewport.width / 2, y: 80 + viewport.height / 2 },
        viewport,
      );
      for (const position of layout.positions) {
        expect(position.x - layout.hitRadius).toBeGreaterThanOrEqual(
          50 + 16 / scale,
        );
        expect(position.x + layout.hitRadius).toBeLessThanOrEqual(
          50 + viewport.width - 16 / scale,
        );
        expect(position.y - layout.hitRadius).toBeGreaterThanOrEqual(
          80 + 16 / scale,
        );
        expect(position.y + layout.hitRadius).toBeLessThanOrEqual(
          80 + viewport.height - 16 / scale,
        );
        for (const previous of layout.positions)
          expect(
            resolveQuickActionCandidate(position, layout, previous.action),
          ).toBe(position.action);
      }
      expect(layout.hitRadius * scale).toBe(32);
    },
  );
  for (const size of [
    [390, 844],
    [834, 1194],
    [1194, 834],
    [1280, 720],
  ]) {
    const [width, height] = size as [number, number];
    it(`keeps all hit targets within safe visual bounds at ${width}x${height}`, () => {
      const viewport = {
        width,
        height,
        offsetLeft: 30,
        offsetTop: 50,
        insets: { left: 20, top: 44, right: 20, bottom: 34 },
      };
      for (const x of [31, 30 + width / 2, 29 + width])
        for (const y of [51, 50 + height / 2, 49 + height]) {
          const layout = resolveQuickActionLayout({ x, y }, viewport);
          expect(layout.positions.map((p) => p.action)).toEqual([
            "like",
            "favorite",
            "share",
          ]);
          for (const p of layout.positions) {
            expect(p.x - 32).toBeGreaterThanOrEqual(50);
            expect(p.y - 32).toBeGreaterThanOrEqual(94);
            expect(p.x + 32).toBeLessThanOrEqual(30 + width - 20);
            expect(p.y + 32).toBeLessThanOrEqual(50 + height - 34);
            expect(resolveQuickActionCandidate(p, layout, null)).toBe(p.action);
            for (const previous of layout.positions) {
              expect(
                resolveQuickActionCandidate(p, layout, previous.action),
              ).toBe(p.action);
            }
          }
        }
    });
    it.each([3, 5])(
      `keeps safe insets and hit geometry at ${width}x${height}, %sx`,
      (scale) => {
        const viewport = {
          width: width / scale,
          height: height / scale,
          scale,
          offsetLeft: 30,
          offsetTop: 50,
          insets: { left: 20, top: 44, right: 20, bottom: 34 },
        };
        for (const px of [1, width / 2, width - 1])
          for (const py of [1, height / 2, height - 1]) {
            const layout = resolveQuickActionLayout(
              { x: 30 + px / scale, y: 50 + py / scale },
              viewport,
            );
            const rounded = (value: number) => Number(value.toFixed(6));
            for (const position of layout.positions) {
              expect(
                rounded((position.x - 30 - layout.hitRadius) * scale),
              ).toBeGreaterThanOrEqual(20);
              expect(
                rounded((position.x - 30 + layout.hitRadius) * scale),
              ).toBeLessThanOrEqual(width - 20);
              expect(
                rounded((position.y - 50 - layout.hitRadius) * scale),
              ).toBeGreaterThanOrEqual(44);
              expect(
                rounded((position.y - 50 + layout.hitRadius) * scale),
              ).toBeLessThanOrEqual(height - 34);
              for (const previous of layout.positions)
                expect(
                  resolveQuickActionCandidate(
                    position,
                    layout,
                    previous.action,
                  ),
                ).toBe(position.action);
            }
          }
      },
    );
  }
  it("prioritizes the 24px center and retains an existing candidate within hysteresis", () => {
    const layout = resolveQuickActionLayout(
      { x: 195, y: 500 },
      { width: 390, height: 844 },
    );
    const favorite = layout.positions[1]!;
    expect(
      resolveQuickActionCandidate({ x: 219, y: 500 }, layout, "favorite"),
    ).toBeNull();
    expect(
      resolveQuickActionCandidate(
        { x: favorite.x + 39, y: favorite.y },
        layout,
        "favorite",
      ),
    ).toBe("favorite");
    expect(
      resolveQuickActionCandidate({ x: 0, y: 0 }, layout, "favorite"),
    ).toBeNull();
  });
});
