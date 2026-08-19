// @vitest-environment jsdom
/// <reference lib="dom" />

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DemoCalligraphySurface,
  DemoInscriptionSurface,
  DemoTopicsSurface,
} from "./demo-surfaces";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const updateSearch = (label: string, value: string) => {
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  )!;
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  act(() => input.dispatchEvent(new Event("input", { bubbles: true })));
};

describe("focused Synthetic T02 surfaces", () => {
  it("keeps inscription search, clear and empty behavior local", () => {
    const onOpenDetail = vi.fn();
    act(() =>
      root.render(
        <DemoInscriptionSurface
          onOpenDetail={onOpenDetail}
          onOpenSettings={vi.fn()}
        />,
      ),
    );

    updateSearch("搜索碑刻", "云峰");
    expect(document.body.textContent).toContain("云峰山题名");
    expect(document.body.textContent).not.toContain("石门东侧残刻");
    act(() =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((item) => item.textContent?.includes("云峰山题名"))
        ?.click(),
    );
    expect(onOpenDetail).toHaveBeenCalledOnce();

    updateSearch("搜索碑刻", "不存在的碑刻");
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      "未找到碑刻",
    );
    act(() =>
      document
        .querySelector<HTMLButtonElement>('button[aria-label="清除搜索"]')
        ?.click(),
    );
    expect(document.body.textContent).toContain("石门东侧残刻");
  });

  it("keeps calligraphy category and text filters local", () => {
    act(() =>
      root.render(
        <DemoCalligraphySurface
          onOpenDetail={vi.fn()}
          onOpenSettings={vi.fn()}
        />,
      ),
    );

    act(() =>
      [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
        .find((item) => item.textContent === "拓本")
        ?.click(),
    );
    expect(document.body.textContent).toContain("集字圣教序");
    expect(document.body.textContent).not.toContain("秋山札");

    updateSearch("筛选书帖", "曹全");
    expect(document.body.textContent).toContain("曹全碑拓");
    expect(document.body.textContent).not.toContain("集字圣教序");
    updateSearch("筛选书帖", "不存在");
    expect(document.querySelector('[role="status"]')?.textContent).toBe(
      "没有符合筛选的书帖",
    );
  });

  it("keeps Topic identity in the DEMO namespace", () => {
    const onOpenTopic = vi.fn();
    act(() => root.render(<DemoTopicsSurface onOpenTopic={onOpenTopic} />));
    const topic = document.querySelector<HTMLButtonElement>(
      "[data-demo-topic-id]",
    )!;
    expect(topic.dataset.demoTopicId).toBeTruthy();
    expect(topic.hasAttribute("href")).toBe(false);
    act(() => topic.click());
    expect(onOpenTopic).toHaveBeenCalledWith(topic.dataset.demoTopicId);
  });
});
