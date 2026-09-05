// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuickActionCardAction } from "./quick-action-card-action";
import type { CatalogId, CatalogSummary } from "@moya/contracts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const roots: ReturnType<typeof createRoot>[] = [];
const item = {
  id: "qa-one" as CatalogId,
  title: "QA",
  aliases: [],
  kind: "calligraphy",
} satisfies CatalogSummary;
const point = { clientX: 180, clientY: 400 };
const send = (
  target: EventTarget,
  type: string,
  props: Record<string, unknown> = {},
) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(
    event,
    Object.fromEntries(
      Object.entries({
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        ...point,
        ...props,
      }).map(([key, value]) => [key, { value }]),
    ),
  );
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};
const render = (likedIds: readonly string[] = []) => {
  const container = document.createElement("article");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const onAction = vi.fn();
  const onOpen = vi.fn();
  act(() =>
    root.render(
      <QuickActionCardAction
        className="card"
        item={item}
        environment={{ likedIds, favoriteIds: [], onAction }}
        onOpenCatalog={onOpen}
      />,
    ),
  );
  const button = container.querySelector("button")!;
  let captured = false;
  button.setPointerCapture = vi.fn(() => {
    captured = true;
  });
  button.hasPointerCapture = vi.fn(() => captured);
  button.releasePointerCapture = vi.fn(() => {
    captured = false;
    const event = new Event("lostpointercapture", { bubbles: true });
    Object.defineProperty(event, "pointerId", { value: 1 });
    button.dispatchEvent(event);
  });
  return { root, button, container, onAction, onOpen };
};
const menu = () => document.querySelector("[data-quick-action-menu]");
const wait = (ms = 400) => act(() => vi.advanceTimersByTime(ms));
const position = (action: string) => {
  const node = document.querySelector<HTMLElement>(
    `[data-quick-action="${action}"]`,
  )!;
  return {
    clientX: Number.parseFloat(node.style.left),
    clientY: Number.parseFloat(node.style.top),
  };
};
const click = (button: HTMLButtonElement, detail = 1) =>
  act(() => {
    button.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail }),
    );
  });

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
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("bounded QA gesture", () => {
  it("opens at 400ms, never 399ms, and does not change card markup geometry", () => {
    const view = render();
    send(view.button, "pointerdown");
    wait(399);
    expect(menu()).toBeNull();
    expect(view.button.dataset.quickActionPhase).toBe("holding");
    wait(1);
    expect(menu()).not.toBeNull();
    expect(view.container.children).toHaveLength(1);
  });
  it("keeps short taps and cancels movement beyond the 10px tolerance", () => {
    const v = render();
    send(v.button, "pointerdown");
    send(window, "pointerup");
    click(v.button);
    expect(v.onOpen).toHaveBeenCalledOnce();
    send(v.button, "pointerdown");
    send(window, "pointermove", { clientX: 191 });
    wait();
    expect(menu()).toBeNull();
    click(v.button);
    expect(v.onOpen).toHaveBeenCalledOnce();
  });
  it.each(["like", "favorite", "share"])(
    "commits %s once on release, not on candidate selection",
    (action) => {
      const v = render();
      send(v.button, "pointerdown");
      wait();
      const target = position(action);
      send(window, "pointermove", target);
      expect(v.onAction).not.toHaveBeenCalled();
      expect(
        document
          .querySelector(`[data-quick-action="${action}"]`)
          ?.getAttribute("data-candidate"),
      ).toBe("true");
      send(window, "pointerup", target);
      send(window, "pointerup", target);
      click(v.button);
      expect(v.onAction).toHaveBeenCalledExactlyOnceWith(action, item.id);
      expect(v.onOpen).not.toHaveBeenCalled();
      expect(menu()).toBeNull();
      expect(v.button.releasePointerCapture).toHaveBeenCalledOnce();
    },
  );
  it("shows current liked state and previews reversal", () => {
    const v = render([item.id]);
    send(v.button, "pointerdown");
    wait();
    const target = document.querySelector('[data-quick-action="like"]')!;
    expect(target.getAttribute("aria-label")).toBe("取消喜欢");
    expect(target.querySelector("svg")?.getAttribute("data-filled")).toBe(
      "true",
    );
    send(window, "pointermove", position("like"));
    expect(target.querySelector("svg")?.getAttribute("data-filled")).toBe(
      "false",
    );
  });
  it.each([point, { clientX: 0, clientY: 0 }])(
    "cancels release in center/outside: %o",
    (release) => {
      const v = render();
      send(v.button, "pointerdown");
      wait();
      send(window, "pointermove", position("favorite"));
      send(window, "pointerup", release);
      expect(v.onAction).not.toHaveBeenCalled();
      expect(menu()).toBeNull();
    },
  );
  for (const time of [200, 450]) {
    it.each([
      "blur",
      "pagehide",
      "resize",
      "orientationchange",
      "scroll",
      "wheel",
      "keydown",
    ])(`cancels %s at ${time}ms`, (type) => {
      const v = render();
      send(v.button, "pointerdown");
      wait(time);
      send(window, type);
      wait();
      expect(menu()).toBeNull();
      expect(v.onAction).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
    it.each(["pointercancel", "lostpointercapture"])(
      `cleans %s at ${time}ms`,
      (type) => {
        const v = render();
        send(v.button, "pointerdown");
        wait(time);
        send(v.button, type);
        wait();
        expect(menu()).toBeNull();
        expect(v.onAction).not.toHaveBeenCalled();
      },
    );
    it(`cancels page hiding, outside second pointer and native multi-touch at ${time}ms`, () => {
      const v = render();
      for (const cancel of [
        () => {
          Object.defineProperty(document, "visibilityState", {
            configurable: true,
            value: "hidden",
          });
          send(document, "visibilitychange");
        },
        () =>
          send(document.body, "pointerdown", {
            pointerId: 2,
            isPrimary: false,
          }),
        () => send(window, "touchstart", { touches: [{}, {}] }),
      ]) {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        send(v.button, "pointerdown");
        wait(time);
        cancel();
        wait();
        expect(menu()).toBeNull();
        expect(v.onAction).not.toHaveBeenCalled();
      }
    });
    it(`cleans unmount and observers at ${time}ms`, () => {
      const v = render();
      send(v.button, "pointerdown");
      wait(time);
      act(() => v.root.unmount());
      roots.pop();
      wait();
      expect(menu()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      expect(v.onAction).not.toHaveBeenCalled();
    });
    it.each(["hidden", "inert", "aria-hidden"])(
      `cancels a %s ancestor at ${time}ms`,
      async (attribute) => {
        const v = render();
        send(v.button, "pointerdown");
        wait(time);
        await act(async () => {
          v.container.setAttribute(attribute, "true");
          await Promise.resolve();
        });
        wait();
        expect(menu()).toBeNull();
        expect(v.onAction).not.toHaveBeenCalled();
      },
    );
  }
  it("releases an outside mouse up before the hold expires", () => {
    const v = render();
    send(v.button, "pointerdown", { pointerType: "mouse" });
    send(document.body, "pointerup", { pointerType: "mouse" });
    wait();
    expect(menu()).toBeNull();
  });
  it.each([true, false])(
    "allows a new click and keyboard activation with prior tail click=%s",
    (tail) => {
      const v = render();
      send(v.button, "pointerdown");
      wait();
      send(window, "pointerup");
      if (tail) click(v.button);
      click(v.button, 0);
      expect(v.onOpen).toHaveBeenCalledOnce();
      send(v.button, "pointerdown");
      send(window, "pointerup");
      click(v.button);
      expect(v.onOpen).toHaveBeenCalledTimes(2);
    },
  );
  it("blocks only opened single-touch movement and releases all blocking on second finger", () => {
    const v = render();
    send(v.button, "pointerdown");
    expect(
      send(v.button, "touchmove", { touches: [{}] }).defaultPrevented,
    ).toBe(false);
    wait();
    expect(
      send(v.button, "touchmove", { touches: [{}] }).defaultPrevented,
    ).toBe(true);
    expect(
      send(v.button, "touchmove", { touches: [{}, {}] }).defaultPrevented,
    ).toBe(false);
    expect(menu()).toBeNull();
    expect(
      send(v.button, "touchmove", { touches: [{}] }).defaultPrevented,
    ).toBe(false);
    // This synthetic assertion is cleanup evidence, not proof of native pinch.
  });
  it("suppresses a cancelled pointer's delayed tail click without swallowing the next sequence", () => {
    const v = render();
    send(v.button, "pointerdown");
    send(window, "pointermove", { clientX: 210 });
    wait(2000);
    send(window, "pointerup");
    click(v.button);
    expect(v.onOpen).not.toHaveBeenCalled();
    send(v.button, "pointerdown");
    send(window, "pointerup");
    click(v.button);
    expect(v.onOpen).toHaveBeenCalledOnce();
  });
  it("keeps a pointer tail suppressed when Tab cancels the gesture, while allowing keyboard activation", () => {
    const v = render();
    send(v.button, "pointerdown");
    wait();
    send(v.button, "keydown", { key: "Tab" });
    expect(menu()).toBeNull();
    send(window, "pointerup");
    click(v.button);
    expect(v.onOpen).not.toHaveBeenCalled();
    click(v.button, 0);
    expect(v.onOpen).toHaveBeenCalledOnce();
  });
  it("clears the non-layout QA share feedback", () => {
    const v = render();
    send(v.button, "pointerdown");
    wait();
    send(window, "pointerup", position("share"));
    expect(v.container.querySelector('[role="status"]')?.textContent).toBe(
      "QA：分享动作已触发（未分享）",
    );
    wait(1800);
    expect(v.container.querySelector('[role="status"]')).toBeNull();
  });
  it.each([200, 450])(
    "cancels a changed card identity at %sms without opening the replacement on the old tail click",
    (time) => {
      const v = render();
      send(v.button, "pointerdown");
      wait(time);
      const replacement = { ...item, id: "qa-two" as CatalogId };
      act(() =>
        v.root.render(
          <QuickActionCardAction
            className="card"
            item={replacement}
            environment={{
              likedIds: [],
              favoriteIds: [],
              onAction: v.onAction,
            }}
            onOpenCatalog={v.onOpen}
          />,
        ),
      );
      wait();
      expect(menu()).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      send(window, "pointerup");
      click(v.button);
      expect(v.onOpen).not.toHaveBeenCalled();
      expect(v.onAction).not.toHaveBeenCalled();
      send(v.button, "pointerdown");
      send(window, "pointerup");
      click(v.button);
      expect(v.onOpen).toHaveBeenCalledExactlyOnceWith(replacement, v.button);
    },
  );
});
