// @vitest-environment jsdom
/// <reference lib="dom" />

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CatalogMedia } from "./catalog-media";

import type { PublicMedia } from "@moya/contracts";

const media = {
  id: "media-001",
  kind: "image",
  src: "https://media.example.invalid/catalog-001.jpg",
  alt: "碑刻公开图像",
  width: 1200,
  height: 1600,
} as PublicMedia;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("CatalogMedia", () => {
  it("renders only the PublicMedia runtime URL and intrinsic dimensions", () => {
    act(() => root.render(<CatalogMedia media={media} />));

    const image = container.querySelector("img");
    expect(image?.getAttribute("src")).toBe(media.src);
    expect(image?.getAttribute("width")).toBe("1200");
    expect(image?.getAttribute("height")).toBe("1600");
    expect(container.innerHTML).not.toMatch(/objectKey|object_key|bucket/i);
  });

  it("uses distinct safe fallbacks for absent and failed media", () => {
    act(() => root.render(<CatalogMedia />));
    expect(container.textContent).toContain("暂无公开图像");
    expect(
      container.querySelector('[data-media-state="missing"]'),
    ).toBeTruthy();

    act(() => root.render(<CatalogMedia media={media} />));
    const image = container.querySelector("img");
    expect(image).toBeTruthy();
    act(() => image?.dispatchEvent(new Event("error")));

    expect(container.textContent).toContain("图像暂不可用");
    expect(
      container.querySelector('[data-media-state="unavailable"]'),
    ).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });
});
