import { describe, expect, it, vi } from "vitest";

import {
  createPrimaryNavigationScrollState,
  PRIMARY_NAVIGATION_IDLE_EXPAND_MS,
  resolvePrimaryNavigationScrollState,
  resolvePrimaryNavigationViewportInset,
  synchronizePrimaryNavigationViewportInset,
} from "./primary-navigation-motion";

describe("primary navigation motion", () => {
  it("accumulates downward intent to 12px before minimizing", () => {
    let state = createPrimaryNavigationScrollState(100);
    state = resolvePrimaryNavigationScrollState(state, 106);
    expect(state.minimized).toBe(false);
    state = resolvePrimaryNavigationScrollState(state, 111);
    expect(state.minimized).toBe(false);
    state = resolvePrimaryNavigationScrollState(state, 112);
    expect(state.minimized).toBe(true);
  });

  it("uses 24px upward hysteresis and always expands near the top", () => {
    let state = createPrimaryNavigationScrollState(200, true);
    state = resolvePrimaryNavigationScrollState(state, 188);
    expect(state.minimized).toBe(true);
    state = resolvePrimaryNavigationScrollState(state, 176);
    expect(state.minimized).toBe(false);

    state = createPrimaryNavigationScrollState(20, true);
    expect(resolvePrimaryNavigationScrollState(state, 8).minimized).toBe(false);
  });

  it("resets intent when scroll direction changes", () => {
    let state = createPrimaryNavigationScrollState(100);
    state = resolvePrimaryNavigationScrollState(state, 108);
    state = resolvePrimaryNavigationScrollState(state, 104);
    expect(state.intent).toBe(-4);
    expect(state.minimized).toBe(false);
  });

  it("preserves the canonical 400ms idle expansion period", () => {
    expect(PRIMARY_NAVIGATION_IDLE_EXPAND_MS).toBe(400);
  });

  it("clamps the visual viewport inset and deduplicates root writes", () => {
    expect(resolvePrimaryNavigationViewportInset(844, 760, 20)).toBe(64);
    expect(resolvePrimaryNavigationViewportInset(844, 900, 0)).toBe(0);

    const setProperty = vi.fn();
    const removeProperty = vi.fn();
    let value = "";
    const root = {
      style: {
        getPropertyValue: vi.fn(() => value),
        removeProperty: (...arguments_: [string]) => {
          value = "";
          removeProperty(...arguments_);
        },
        setProperty: (...arguments_: [string, string]) => {
          value = arguments_[1];
          setProperty(...arguments_);
        },
      },
    } as unknown as HTMLElement;

    expect(synchronizePrimaryNavigationViewportInset(root, 64)).toBe(true);
    expect(synchronizePrimaryNavigationViewportInset(root, 64)).toBe(false);
    expect(setProperty).toHaveBeenCalledOnce();
    expect(synchronizePrimaryNavigationViewportInset(root, null)).toBe(true);
    expect(synchronizePrimaryNavigationViewportInset(root, null)).toBe(false);
    expect(removeProperty).toHaveBeenCalledOnce();
  });
});
