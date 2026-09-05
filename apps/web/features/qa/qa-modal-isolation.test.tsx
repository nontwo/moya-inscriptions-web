// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQaModalIsolation } from "./qa-modal-isolation";

import type { RefObject } from "react";
import type { Root } from "react-dom/client";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
const flushFrames = () =>
  act(() => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  });

const Modal = ({
  open,
  openerRef,
  name,
  onClose,
  onSwitch,
  onSettings,
}: {
  readonly open: boolean;
  readonly openerRef: RefObject<HTMLButtonElement | null>;
  readonly name: string;
  readonly onClose: () => void;
  readonly onSwitch: () => void;
  readonly onSettings: () => void;
}) => {
  const overlayRef = useRef<HTMLElement>(null);
  const initialFocusRef = useRef<HTMLButtonElement>(null);
  const { close } = useQaModalIsolation({
    open,
    overlayRef,
    initialFocusRef,
    openerRef,
    onRequestClose: onClose,
  });
  return open ? (
    <section ref={overlayRef} role="dialog" aria-label={name} tabIndex={-1}>
      <button ref={initialFocusRef} data-close={name} onClick={close}>
        关闭{name}
      </button>
      <button data-switch={name} onClick={onSwitch}>
        切换
      </button>
      <button data-settings={name} onClick={onSettings}>
        设置
      </button>
      <button tabIndex={-1}>非 Tab 目标</button>
      <div inert>
        <button>不可交互</button>
      </div>
    </section>
  ) : null;
};

const Fixture = () => {
  const [active, setActive] = useState<"search" | "user" | null>(null);
  const [settings, setSettings] = useState(false);
  const searchRef = useRef<HTMLButtonElement>(null);
  const userRef = useRef<HTMLButtonElement>(null);
  return (
    <div
      data-t02p-qa-harness=""
      data-product-shell=""
      data-settings-open={String(settings)}
    >
      <aside data-qa-controls="">QA</aside>
      <div data-primary-navigation-pager="">主页面</div>
      <nav data-primary-navigation-dock="">
        <button
          data-open="search"
          ref={searchRef}
          onClick={() => setActive("search")}
        >
          搜索
        </button>
      </nav>
      <button
        data-user-trigger=""
        data-open="user"
        ref={userRef}
        onClick={() => setActive("user")}
      >
        用户
      </button>
      <div data-t02p-qa-search="">
        <Modal
          name="search"
          open={active === "search"}
          openerRef={searchRef}
          onClose={() => setActive(null)}
          onSwitch={() => setActive("user")}
          onSettings={() => setSettings(true)}
        />
      </div>
      <div data-qa-user-interface="">
        <Modal
          name="user"
          open={active === "user"}
          openerRef={userRef}
          onClose={() => setActive(null)}
          onSwitch={() => setActive("search")}
          onSettings={() => setSettings(true)}
        />
      </div>
      {settings ? (
        <section data-settings-overlay="">
          <button data-settings-back="" onClick={() => setSettings(false)}>
            返回
          </button>
          <button data-remove-user="" onClick={() => setActive(null)}>
            关闭下层
          </button>
        </section>
      ) : null}
    </div>
  );
};

const get = (selector: string) => {
  const found = document.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error(`Missing ${selector}`);
  return found;
};
const click = (selector: string) => act(() => get(selector).click());

describe("shared QA modal isolation", () => {
  beforeEach(() => {
    frames = new Map();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      const id = ++frameId;
      frames.set(id, callback);
      return id;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation((id) => {
      frames.delete(id);
    });
    document.body.style.overflow = "clip";
    const container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() => root?.render(<Fixture />));
  });
  afterEach(() => {
    act(() => root?.unmount());
    flushFrames();
    document.body.replaceChildren();
    document.body.style.overflow = "";
    vi.restoreAllMocks();
  });

  it("switches surfaces without old-opener focus stealing or intermediate body unlock", () => {
    click('[data-open="search"]');
    expect(document.activeElement).toBe(get('[data-close="search"]'));
    click('[data-switch="search"]');
    expect(document.body.style.overflow).toBe("hidden");
    expect(document.activeElement).toBe(get('[data-close="user"]'));
    flushFrames();
    expect(document.activeElement).toBe(get('[data-close="user"]'));
    expect(document.body.style.overflow).toBe("hidden");
    expect(get("[data-primary-navigation-dock]").inert).toBe(true);
    expect(get("[data-qa-user-interface]").hasAttribute("inert")).toBe(false);
    click('[data-close="user"]');
    flushFrames();
    expect(document.activeElement).toBe(get('[data-open="user"]'));
    expect(document.body.style.overflow).toBe("clip");
    expect(get("[data-primary-navigation-dock]").hasAttribute("inert")).toBe(
      false,
    );
  });

  it("preserves background locking and leaves Escape to Settings while it is above User", () => {
    click('[data-open="user"]');
    click('[data-settings="user"]');
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
      ),
    );
    expect(get('[data-close="user"]')).toBeTruthy();
    expect(document.body.style.overflow).toBe("hidden");
    expect(get("[data-qa-controls]").inert).toBe(true);
    click("[data-settings-back]");
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", cancelable: true }),
      ),
    );
    flushFrames();
    expect(document.querySelector('[data-close="user"]')).toBeNull();
    expect(document.activeElement).toBe(get('[data-open="user"]'));
    expect(document.body.style.overflow).toBe("clip");
  });

  it("keeps body locked if an upper Settings layer outlives its lower QA surface", async () => {
    click('[data-open="user"]');
    click('[data-settings="user"]');
    click("[data-remove-user]");
    flushFrames();
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => get("[data-settings-back]").click());
    flushFrames();
    expect(document.body.style.overflow).toBe("clip");
  });

  it("releases a waiting upper-owner lock when the entire shell unmounts", async () => {
    click('[data-open="search"]');
    get("[data-product-shell]").setAttribute("data-detail-open", "true");
    click('[data-close="search"]');
    flushFrames();
    expect(document.body.style.overflow).toBe("hidden");
    await act(async () => root?.render(null));
    flushFrames();
    expect(document.body.style.overflow).toBe("clip");
    expect(frames.size).toBe(0);
    const completedFrameId = frameId;
    await act(async () => document.body.append(document.createElement("div")));
    expect(frameId).toBe(completedFrameId);
  });

  it("excludes negative-tabindex and inert descendants from the Tab loop", () => {
    click('[data-open="user"]');
    get('[data-settings="user"]').focus();
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
      ),
    );
    expect(document.activeElement).toBe(get('[data-close="user"]'));
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          shiftKey: true,
          cancelable: true,
        }),
      ),
    );
    expect(document.activeElement).toBe(get('[data-settings="user"]'));
  });

  it.each(["detail", "topic", "viewer"])(
    "leaves keys and initial/opener focus to an upper %s owner",
    async (kind) => {
      const shell = get("[data-product-shell]");
      const upper = document.createElement("button");
      shell.append(upper);
      shell.setAttribute(`data-${kind}-open`, "true");
      upper.focus();
      click('[data-open="search"]');
      expect(document.activeElement).toBe(upper);
      for (const [key, shiftKey] of [
        ["Tab", false],
        ["Tab", true],
        ["Escape", false],
      ] as const) {
        const event = new KeyboardEvent("keydown", {
          key,
          shiftKey,
          cancelable: true,
        });
        act(() => document.dispatchEvent(event));
        expect(event.defaultPrevented).toBe(false);
        expect(document.activeElement).toBe(upper);
        expect(get('[data-close="search"]')).toBeTruthy();
      }
      click('[data-close="search"]');
      flushFrames();
      expect(document.activeElement).toBe(upper);
      expect(document.body.style.overflow).toBe("hidden");
      await act(async () => shell.setAttribute(`data-${kind}-open`, "false"));
      flushFrames();
      expect(document.body.style.overflow).toBe("clip");
    },
  );

  it("suspends on inherited isolation, resumes focus, and cancels a stale resume frame", async () => {
    click('[data-open="search"]');
    const lower = get("[data-t02p-qa-search]");
    const upper = document.createElement("button");
    get("[data-product-shell]").append(upper);
    await act(async () => lower.setAttribute("inert", ""));
    upper.focus();
    const tab = new KeyboardEvent("keydown", { key: "Tab", cancelable: true });
    act(() => document.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(false);
    await act(async () => lower.removeAttribute("inert"));
    // Upper reopens before the queued resume gets its frame, even before the
    // MutationObserver delivers that change. The callback must recheck now.
    lower.setAttribute("inert", "");
    flushFrames();
    expect(document.activeElement).toBe(upper);
    await act(async () => {});
    await act(async () => lower.removeAttribute("inert"));
    flushFrames();
    expect(document.activeElement).toBe(get('[data-close="search"]'));
    await act(async () => lower.setAttribute("inert", ""));
    upper.focus();
    await act(async () => lower.removeAttribute("inert"));
    click('[data-close="search"]');
    flushFrames();
    expect(document.activeElement).toBe(get('[data-open="search"]'));
    expect(frames.size).toBe(0);
  });

  it("still traps an interactive empty modal and removes its listener on unmount", () => {
    click('[data-open="search"]');
    const overlay = get('[aria-label="search"]');
    overlay.querySelectorAll("button").forEach((button) => {
      button.disabled = true;
    });
    const event = new KeyboardEvent("keydown", {
      key: "Tab",
      cancelable: true,
    });
    act(() => document.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(overlay);
    act(() => root?.render(null));
    flushFrames();
    const after = new KeyboardEvent("keydown", {
      key: "Tab",
      cancelable: true,
    });
    document.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    expect(document.body.style.overflow).toBe("clip");
    expect(frames.size).toBe(0);
  });
});
