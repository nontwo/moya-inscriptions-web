import { describe, expect, it } from "vitest";
import { mediaDotWindow } from "./media-dot-window";
describe("album dot window", () => {
  it("keeps the active image reachable in a bounded, ordered window", () => {
    for (const total of [0, 1, 3, 5, 6, 50])
      for (let active = 0; active < Math.max(1, total); active++) {
        const dots = mediaDotWindow(total, active);
        expect(dots.length).toBe(Math.min(5, total));
        if (total)
          expect(dots.some((dot) => dot.index === active && !dot.edge)).toBe(
            true,
          );
        expect(dots.every((dot) => dot.index >= 0 && dot.index < total)).toBe(
          true,
        );
      }
    expect(mediaDotWindow(50, 0).at(-1)).toEqual({ index: 4, edge: true });
    expect(mediaDotWindow(50, 49)[0]).toEqual({ index: 45, edge: true });
  });
});
