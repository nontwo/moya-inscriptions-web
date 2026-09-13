// @vitest-environment jsdom
import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorDialog } from "./author-dialog";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root | null = null;
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.open = true;
    }),
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: vi.fn(function (this: HTMLDialogElement) {
      this.open = false;
    }),
  });
  window.history.replaceState(
    { screen: "detail" },
    "",
    "/?workId=synthetic#detail",
  );
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
});
const render = async (onClose: () => void, dirty = false) => {
  const element = document.createElement("div");
  document.body.append(element);
  root = createRoot(element);
  await act(async () =>
    root!.render(
      <StrictMode>
        <AuthorDialog title="编辑" onClose={onClose} dirty={dirty}>
          <input aria-label="私有文本" defaultValue="草稿" />
        </AuthorDialog>
      </StrictMode>,
    ),
  );
  return element;
};
describe("author modal history ownership", () => {
  it("registers once under StrictMode and browser Back closes only the modal", async () => {
    const push = vi.spyOn(window.history, "pushState"),
      close = vi.fn(),
      underlying = vi.fn();
    await render(close);
    expect(push).toHaveBeenCalledTimes(1);
    window.addEventListener("popstate", underlying);
    await act(async () => {
      window.history.replaceState(
        { screen: "detail" },
        "",
        window.location.href,
      );
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: { screen: "detail" } }),
      );
    });
    expect(close).toHaveBeenCalledOnce();
    expect(underlying).not.toHaveBeenCalled();
    window.removeEventListener("popstate", underlying);
  });
  it("guards repeated close clicks while Back is pending", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const node = await render(vi.fn());
    await act(async () => {
      node.querySelector("button")!.click();
      node.querySelector("button")!.click();
    });
    expect(back).toHaveBeenCalledTimes(1);
    // A separate actual unmount also neutralizes its own entry, once.
    await act(async () => {
      window.history.replaceState(
        { screen: "detail" },
        "",
        window.location.href,
      );
      root!.unmount();
    });
    root = null;
    expect(back).toHaveBeenCalledTimes(1);
  });
  it("consumes only its own temporary entry on account-change unmount", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {}),
      underlying = vi.fn();
    await render(vi.fn());
    window.addEventListener("popstate", underlying);
    await act(async () => root!.unmount());
    root = null;
    expect(back).toHaveBeenCalledOnce();
    window.history.replaceState({ screen: "detail" }, "", window.location.href);
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: { screen: "detail" } }),
    );
    expect(underlying).not.toHaveBeenCalled();
    window.removeEventListener("popstate", underlying);
  });
  it("preserves unsaved text when abandoning is declined", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false),
      back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const node = await render(vi.fn(), true);
    await act(async () => node.querySelector("button")!.click());
    expect(confirm).toHaveBeenCalledOnce();
    expect(back).not.toHaveBeenCalled();
    expect(node.querySelector("input")?.value).toBe("草稿");
    window.history.replaceState({ screen: "detail" }, "", window.location.href);
  });
});
