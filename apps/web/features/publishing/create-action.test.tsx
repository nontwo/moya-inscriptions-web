// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { author, shell } = vi.hoisted(() => ({
  author: {
    checking: false,
    viewer: null as { id: string } | null,
    signInHref: "/dev/community",
  },
  shell: { openEditor: vi.fn(), openProfile: vi.fn() },
}));
vi.mock("../authors/author-context", () => ({ useAuthors: () => author }));
vi.mock("../product-shell/product-shell", () => ({
  useProductShell: () => shell,
}));

import { CreateWorkAction } from "./create-action";
import { PublishingEntryProvider } from "./publishing-entry";

import type { Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const roots: Root[] = [];
const render = (withProvider = true) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() =>
    root.render(
      withProvider ? (
        <PublishingEntryProvider>
          <CreateWorkAction />
        </PublishingEntryProvider>
      ) : (
        <CreateWorkAction />
      ),
    ),
  );
  const button = container.querySelector<HTMLButtonElement>(
    "[data-create-work-action]",
  );
  if (button === null) throw new Error("Missing create action");
  return button;
};

beforeEach(() => {
  author.checking = false;
  author.viewer = null;
});
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("CreateWorkAction", () => {
  it("is one labelled plus action instead of the dock Search trigger", () => {
    const button = render();
    expect(button.getAttribute("aria-label")).toBe("发布作品");
    expect(button.type).toBe("button");
    const icon = button.querySelector("svg[data-create-work-icon]");
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    expect(icon?.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(icon?.querySelector("path")?.getAttribute("d")).toBe(
      "M12 5v14m-7-7h14",
    );
    // No shared UI icon name is needed, so the frozen icon set is unchanged.
    expect(button.querySelector(".yoyi-icon")).toBeNull();
    expect(button.hasAttribute("data-search-trigger")).toBe(false);
    expect(button.querySelector('[data-icon="search"]')).toBeNull();
  });

  it("opens a new work editor for a signed-in author", () => {
    author.viewer = { id: `user-${"a".repeat(32)}` };
    const button = render();
    act(() => button.click());
    expect(shell.openEditor).toHaveBeenCalledExactlyOnceWith(
      { type: "new" },
      button,
    );
    expect(shell.openProfile).not.toHaveBeenCalled();
  });

  it("sends a guest to the existing sign-in center instead of an editor", () => {
    const button = render();
    act(() => button.click());
    expect(shell.openProfile).toHaveBeenCalledExactlyOnceWith(null, button);
    expect(shell.openEditor).not.toHaveBeenCalled();
  });

  it("waits for the session check before acting", () => {
    author.checking = true;
    const button = render();
    expect(button.disabled).toBe(true);
    act(() => button.click());
    expect(shell.openEditor).not.toHaveBeenCalled();
    expect(shell.openProfile).not.toHaveBeenCalled();
  });

  it("exists only inside the publishing composition", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(false)).toThrow(
      "Publishing entry requires its provider",
    );
  });
});
