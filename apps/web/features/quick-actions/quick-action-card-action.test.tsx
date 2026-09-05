// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ContentQuickActionsProvider } from "./content-quick-actions";
import {
  QuickActionCardAction,
  QUICK_ACTION_GESTURE_TIMING,
} from "./quick-action-card-action";

import type { CatalogId, CatalogSummary } from "@moya/contracts";
import type { ContentQuickActionEnvironment } from "./quick-action-types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReturnType<typeof createRoot>[] = [];
const item = {
  aliases: [],
  id: "qa-catalog-01" as CatalogId,
  kind: "calligraphy",
  title: "秋山札",
} as CatalogSummary;

const pointer = (
  target: Element,
  type: "pointercancel" | "pointerdown" | "pointermove" | "pointerup",
  properties: Partial<{
    button: number;
    clientX: number;
    clientY: number;
    isPrimary: boolean;
    pointerId: number;
    pointerType: string;
  }> = {},
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: { value: properties.button ?? 0 },
    clientX: { value: properties.clientX ?? 195 },
    clientY: { value: properties.clientY ?? 500 },
    isPrimary: { value: properties.isPrimary ?? true },
    pointerId: { value: properties.pointerId ?? 1 },
    pointerType: { value: properties.pointerType ?? "touch" },
  });
  act(() => target.dispatchEvent(event));
};

const renderAction = (
  overrides: Partial<ContentQuickActionEnvironment> = {},
) => {
  const container = document.createElement("article");
  document.body.append(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  const adapter = {
    favorite: vi.fn(),
    like: vi.fn(),
    share: vi.fn(),
    unfavorite: vi.fn(),
    unlike: vi.fn(),
  };
  const onEvent = vi.fn();
  const onOpenCatalog = vi.fn();
  const environment: ContentQuickActionEnvironment = {
    adapter,
    favoriteIds: [],
    likedIds: [],
    onEvent,
    ...overrides,
  };
  act(() =>
    root.render(
      <ContentQuickActionsProvider environment={environment}>
        <QuickActionCardAction
          className="card-action"
          item={item}
          onOpenCatalog={onOpenCatalog}
        />
      </ContentQuickActionsProvider>,
    ),
  );
  const button = container.querySelector("button")!;
  return { adapter, button, container, onEvent, onOpenCatalog };
};

const quickActionCenter = (action: string) => {
  const button = document.body.querySelector<HTMLElement>(
    `[data-quick-action="${action}"]`,
  );
  if (button === null) throw new Error(`Missing ${action} quick action`);
  return {
    x: Number.parseFloat(button.style.getPropertyValue("--quick-action-x")),
    y: Number.parseFloat(button.style.getPropertyValue("--quick-action-y")),
  };
};

describe("QuickActionCardAction", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: null,
    });
  });

  afterEach(() => {
    for (const root of mountedRoots.splice(0)) act(() => root.unmount());
    document.body.replaceChildren();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("preserves a short click and cancels a moving pre-press", () => {
    const first = renderAction();
    pointer(first.button, "pointerdown");
    pointer(first.button, "pointerup");
    act(() => first.button.click());
    expect(first.onOpenCatalog).toHaveBeenCalledOnce();

    const second = renderAction();
    pointer(second.button, "pointerdown");
    pointer(second.button, "pointermove", { clientX: 220 });
    act(() => vi.advanceTimersByTime(QUICK_ACTION_GESTURE_TIMING.longPressMs));
    expect(document.body.querySelector("[data-quick-action-menu]")).toBeNull();
    act(() => second.button.click());
    expect(second.onOpenCatalog).not.toHaveBeenCalled();
  });

  it("suppresses native context menus and dragging on enabled cards", () => {
    const view = renderAction();
    const contextMenu = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });
    const dragStart = new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      expect(view.button.dispatchEvent(contextMenu)).toBe(false);
      expect(view.button.dispatchEvent(dragStart)).toBe(false);
    });
  });

  it("blocks page scrolling only after opening and yields to multi-touch", () => {
    const view = renderAction();
    expect(
      window.dispatchEvent(
        new Event("touchmove", { bubbles: true, cancelable: true }),
      ),
    ).toBe(true);

    pointer(view.button, "pointerdown");
    act(() => vi.advanceTimersByTime(QUICK_ACTION_GESTURE_TIMING.longPressMs));
    expect(
      document.body.querySelector("[data-quick-action-menu]"),
    ).not.toBeNull();

    const touchMove = new Event("touchmove", {
      bubbles: true,
      cancelable: true,
    });
    expect(window.dispatchEvent(touchMove)).toBe(false);

    pointer(view.button, "pointerdown", {
      isPrimary: false,
      pointerId: 2,
    });
    expect(document.body.querySelector("[data-quick-action-menu]")).toBeNull();
    expect(view.onEvent).toHaveBeenLastCalledWith({
      contentId: item.id,
      type: "cancelled",
    });
  });

  it("opens after a stationary hold, slides to favorite and commits on release", () => {
    const view = renderAction();
    pointer(view.button, "pointerdown");
    act(() => vi.advanceTimersByTime(QUICK_ACTION_GESTURE_TIMING.longPressMs));

    const menu = document.body.querySelector("[data-quick-action-menu]");
    expect(menu).not.toBeNull();
    expect(document.body.querySelectorAll("[data-quick-action]")).toHaveLength(
      3,
    );
    expect(menu?.textContent).toBe("");
    const center = quickActionCenter("favorite");
    pointer(view.button, "pointermove", {
      clientX: center.x,
      clientY: center.y,
    });
    expect(
      document.body
        .querySelector('[data-quick-action="favorite"]')
        ?.getAttribute("data-candidate"),
    ).toBe("true");
    pointer(view.button, "pointerup", {
      clientX: center.x,
      clientY: center.y,
    });

    expect(view.adapter.favorite).toHaveBeenCalledWith(item);
    expect(view.onOpenCatalog).not.toHaveBeenCalled();
    expect(document.body.querySelector("[data-quick-action-menu]")).toBeNull();
    expect(view.onEvent.mock.calls.map(([event]) => event.type)).toEqual([
      "opened",
      "candidate",
      "committed",
    ]);
  });

  it("cancels from the center dead zone and on viewport change", () => {
    const view = renderAction();
    pointer(view.button, "pointerdown");
    act(() => vi.advanceTimersByTime(QUICK_ACTION_GESTURE_TIMING.longPressMs));
    pointer(view.button, "pointerup");
    expect(view.adapter.like).not.toHaveBeenCalled();
    expect(view.onEvent).toHaveBeenLastCalledWith({
      contentId: item.id,
      type: "cancelled",
    });

    pointer(view.button, "pointerdown", { pointerId: 2 });
    act(() => vi.advanceTimersByTime(QUICK_ACTION_GESTURE_TIMING.longPressMs));
    act(() => window.dispatchEvent(new Event("resize")));
    expect(document.body.querySelector("[data-quick-action-menu]")).toBeNull();
    expect(view.onEvent).toHaveBeenLastCalledWith({
      contentId: item.id,
      type: "cancelled",
    });
  });

  it("previews an unlike without changing the shared icon system", () => {
    const view = renderAction({ likedIds: [item.id] });
    pointer(view.button, "pointerdown");
    act(() => vi.advanceTimersByTime(QUICK_ACTION_GESTURE_TIMING.longPressMs));
    const like = document.body.querySelector<HTMLElement>(
      '[data-quick-action="like"]',
    )!;
    expect(like.getAttribute("aria-label")).toBe("取消喜欢");
    const center = quickActionCenter("like");
    pointer(view.button, "pointermove", {
      clientX: center.x,
      clientY: center.y,
    });
    expect(like.querySelector("svg")?.getAttribute("data-filled")).toBe(
      "false",
    );
    pointer(view.button, "pointerup", {
      clientX: center.x,
      clientY: center.y,
    });
    expect(view.adapter.unlike).toHaveBeenCalledWith(item);
  });
});
