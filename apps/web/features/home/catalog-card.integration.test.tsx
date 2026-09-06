// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { CatalogCard } from "./catalog-card";

import type { Root } from "react-dom/client";
import type {
  CatalogId,
  CatalogSummary,
  MediaId,
  PublicMedia,
} from "@moya/contracts";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const roots: Root[] = [];
const media = {
  alt: "横幅图像",
  height: 300,
  id: "media-failed" as MediaId,
  kind: "image",
  src: "/failed-media.svg",
  width: 900,
} as PublicMedia;
const item = {
  aliases: [],
  id: "catalog-failed-media" as CatalogId,
  kind: "inscription",
  representativeMedia: media,
  title: "失败媒体条目",
} as CatalogSummary;

const renderCard = (variant: "feed" | "inscription") => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(<CatalogCard item={item} variant={variant} />));
  act(() =>
    container
      .querySelector("img")
      ?.dispatchEvent(new Event("error", { bubbles: true })),
  );
  return container.querySelector<HTMLElement>(
    '[data-catalog-media-state="failed"]',
  )!;
};

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe("CatalogCard failed media geometry", () => {
  it("preserves source geometry for R03 Home feed cards", () => {
    expect(renderCard("feed").style.aspectRatio).toBe("900 / 300");
  });

  it("does not override the deferred Inscriptions fallback geometry", () => {
    expect(renderCard("inscription").style.aspectRatio).toBe("");
  });
});

describe("CatalogCard unchanged activation without quick actions", () => {
  const renderButton = () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    let opened = 0;
    act(() =>
      root.render(
        <CatalogCard
          item={item}
          variant="feed"
          onOpenCatalog={() => {
            opened += 1;
          }}
        />,
      ),
    );
    return { button: container.querySelector("button")!, count: () => opened };
  };
  const send = (button: HTMLButtonElement, name: string, x = 0, y = 0) => {
    const event = new MouseEvent(name, {
      bubbles: true,
      clientX: x,
      clientY: y,
    });
    act(() => button.dispatchEvent(event));
  };
  it("keeps the 8px vertical guard and leaves horizontal-only clicks unchanged", () => {
    const view = renderButton();
    send(view.button, "pointerdown");
    send(view.button, "pointermove", 0, 9);
    send(view.button, "pointerup", 0, 9);
    act(() => view.button.click());
    expect(view.count()).toBe(0);
    send(view.button, "pointerdown");
    send(view.button, "pointermove", 40, 0);
    send(view.button, "pointerup", 40, 0);
    act(() => view.button.click());
    expect(view.count()).toBe(1);
    expect(view.button.hasAttribute("data-quick-actions")).toBe(false);
  });
});
