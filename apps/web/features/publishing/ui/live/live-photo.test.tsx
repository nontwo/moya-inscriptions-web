// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LivePhotoFrame } from "./live-photo";

import type { Root } from "react-dom/client";
import type { LivePhotoMotion } from "./live-photo";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const MOTION_SRC = `/api/community/publishing/media/item-${"a".repeat(32)}/motion/base`;
const withAudio: LivePhotoMotion = { motionSrc: MOTION_SRC, hasAudio: true };
const silent: LivePhotoMotion = { motionSrc: MOTION_SRC, hasAudio: false };

const roots: Root[] = [];
const observers: {
  readonly callback: IntersectionObserverCallback;
  readonly targets: Element[];
  disconnected: boolean;
}[] = [];

let play: ReturnType<typeof vi.fn>;
let pause: ReturnType<typeof vi.fn>;
let load: ReturnType<typeof vi.fn>;

beforeEach(() => {
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  load = vi.fn();
  Object.defineProperties(HTMLMediaElement.prototype, {
    play: { configurable: true, value: play },
    pause: { configurable: true, value: pause },
    load: { configurable: true, value: load },
  });
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      readonly record;
      constructor(callback: IntersectionObserverCallback) {
        this.record = {
          callback,
          targets: [] as Element[],
          disconnected: false,
        };
        observers.push(this.record);
      }
      observe(target: Element) {
        this.record.targets.push(target);
      }
      disconnect() {
        this.record.disconnected = true;
      }
      unobserve() {}
      takeRecords() {
        return [];
      }
    },
  );
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  observers.splice(0);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
});

const render = (motion: LivePhotoMotion, active = true) => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const draw = (nextActive: boolean, nextMotion = motion) =>
    act(() =>
      root.render(
        <LivePhotoFrame active={nextActive} motion={nextMotion}>
          <img alt="实况静态图" src="/still.jpg" />
        </LivePhotoFrame>,
      ),
    );
  draw(active);
  const query = <T extends Element>(selector: string) =>
    container.querySelector<T>(selector);
  return {
    container,
    draw,
    video: () => query<HTMLVideoElement>("[data-live-video]"),
    playButton: () => query<HTMLButtonElement>("[data-live-photo-play]"),
    soundButton: () => query<HTMLButtonElement>("[data-live-photo-sound]"),
    state: () => query<HTMLElement>("[data-live-photo]")?.dataset.livePlayback,
  };
};

const startPlayback = async (view: ReturnType<typeof render>) => {
  await act(async () => view.playButton()!.click());
  act(() => {
    view.video()!.dispatchEvent(new Event("playing"));
  });
};

describe("LivePhotoFrame", () => {
  it("shows the still with an explicit control and never loads or plays motion by itself", () => {
    const view = render(withAudio);
    expect(view.container.querySelector("img")?.getAttribute("alt")).toBe(
      "实况静态图",
    );
    expect(view.playButton()?.textContent).toBe("播放实况");
    const video = view.video()!;
    expect(video.hasAttribute("src")).toBe(false);
    expect(video.getAttribute("preload")).toBe("none");
    expect(video.hasAttribute("autoplay")).toBe(false);
    expect(play).not.toHaveBeenCalled();
    // The sound toggle only exists while motion runs.
    expect(view.soundButton()).toBeNull();
  });

  it("sets the motion source only on activation and plays inline, muted first", async () => {
    const view = render(withAudio);
    await act(async () => view.playButton()!.click());
    const video = view.video()!;
    expect(video.getAttribute("src")).toBe(MOTION_SRC);
    expect(video.muted).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(play).toHaveBeenCalledOnce();
    // The still stays visible until motion frames actually play.
    expect(video.dataset.visible).toBe("false");
    act(() => {
      video.dispatchEvent(new Event("playing"));
    });
    expect(view.state()).toBe("playing");
    expect(video.dataset.visible).toBe("true");
    expect(view.playButton()?.textContent).toBe("停止实况");
  });

  it("offers the sound toggle only when the motion has audio", async () => {
    const view = render(withAudio);
    await startPlayback(view);
    const sound = view.soundButton()!;
    expect(sound.textContent).toBe("声音");
    expect(sound.getAttribute("aria-pressed")).toBe("false");
    act(() => sound.click());
    expect(view.video()!.muted).toBe(false);
    expect(view.soundButton()!.getAttribute("aria-pressed")).toBe("true");

    const quiet = render(silent);
    await startPlayback(quiet);
    expect(quiet.state()).toBe("playing");
    expect(quiet.soundButton()).toBeNull();
  });

  it("starts muted again after a stop even if sound was turned on", async () => {
    const view = render(withAudio);
    await startPlayback(view);
    act(() => view.soundButton()!.click());
    act(() => view.playButton()!.click());
    expect(view.state()).toBe("idle");
    expect(view.video()!.hasAttribute("src")).toBe(false);
    await act(async () => view.playButton()!.click());
    expect(view.video()!.muted).toBe(true);
  });

  it("pauses, releases the motion and returns to the still when it becomes inactive", async () => {
    const view = render(withAudio);
    await startPlayback(view);
    const video = view.video()!;
    view.draw(false);
    expect(pause).toHaveBeenCalled();
    expect(video.hasAttribute("src")).toBe(false);
    expect(load).toHaveBeenCalled();
    expect(view.video()).toBeNull();
    expect(view.state()).toBe("idle");
  });

  it("stops when the frame leaves the view", async () => {
    const view = render(silent);
    await startPlayback(view);
    const observer = observers.find(
      (entry) => !entry.disconnected && entry.targets.length > 0,
    )!;
    act(() =>
      observer.callback(
        [
          {
            isIntersecting: true,
            intersectionRatio: 0.2,
            target: observer.targets[0]!,
          } as unknown as IntersectionObserverEntry,
        ],
        {} as IntersectionObserver,
      ),
    );
    expect(view.state()).toBe("idle");
    expect(view.video()!.hasAttribute("src")).toBe(false);
  });

  it("stops when the page hides", async () => {
    const view = render(silent);
    await startPlayback(view);
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(view.state()).toBe("idle");
    expect(pause).toHaveBeenCalled();
    expect(view.video()!.hasAttribute("src")).toBe(false);
  });

  it("releases the motion on unmount (an overlay closing)", async () => {
    const view = render(silent);
    await startPlayback(view);
    const video = view.video()!;
    act(() => roots.pop()!.unmount());
    expect(pause).toHaveBeenCalled();
    expect(video.hasAttribute("src")).toBe(false);
  });

  it("keeps the still and says so when the motion cannot be decoded", async () => {
    const view = render(withAudio);
    // The polite status exists before the failure, so its text is announced.
    const status = view.container.querySelector("[data-live-photo-status]");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toBe("");
    await act(async () => view.playButton()!.click());
    act(() => {
      view.video()!.dispatchEvent(new Event("error"));
    });
    expect(view.state()).toBe("failed");
    const failure = view.container.querySelector("[data-live-photo-failure]");
    expect(failure).toBe(status);
    expect(failure?.textContent).toBe("动态影像无法播放");
    expect(view.container.querySelector("img")).not.toBeNull();
    expect(view.video()!.hasAttribute("src")).toBe(false);
    expect(view.playButton()).toBeNull();
    expect(view.soundButton()).toBeNull();
  });

  it("treats a refused play() as a playback failure", async () => {
    play.mockImplementationOnce(() =>
      Promise.reject(new DOMException("unsupported", "NotSupportedError")),
    );
    const view = render(silent);
    await act(async () => view.playButton()!.click());
    expect(view.state()).toBe("failed");
  });

  it("ignores a late rejection from a playback that was already stopped", async () => {
    let reject: (error: unknown) => void = () => undefined;
    play.mockImplementationOnce(
      () =>
        new Promise<void>((_, fail) => {
          reject = fail;
        }),
    );
    const view = render(silent);
    await act(async () => view.playButton()!.click());
    act(() => view.playButton()!.click());
    await act(async () => reject(new DOMException("aborted", "AbortError")));
    expect(view.state()).toBe("idle");
  });

  it("hands the focus to the failure message when 播放实况 disappears", async () => {
    const view = render(silent);
    const button = view.playButton()!;
    button.focus();
    await act(async () => button.click());
    expect(document.activeElement).toBe(button);
    act(() => {
      view.video()!.dispatchEvent(new Event("error"));
    });
    expect(view.playButton()).toBeNull();
    expect(document.activeElement).toBe(
      view.container.querySelector("[data-live-photo-failure]"),
    );
  });

  it("returns the focus from 声音 to 播放实况 when the motion ends", async () => {
    const view = render(withAudio);
    await startPlayback(view);
    view.soundButton()!.focus();
    act(() => {
      view.video()!.dispatchEvent(new Event("ended"));
    });
    expect(view.soundButton()).toBeNull();
    expect(document.activeElement).toBe(view.playButton());

    // A stop while the focus is elsewhere never takes it.
    const outside = document.createElement("button");
    document.body.append(outside);
    await startPlayback(view);
    outside.focus();
    view.draw(false);
    expect(document.activeElement).toBe(outside);
  });

  it("returns to the still after one pass", async () => {
    const view = render(silent);
    await startPlayback(view);
    act(() => {
      view.video()!.dispatchEvent(new Event("ended"));
    });
    expect(view.state()).toBe("idle");
    expect(view.video()!.dataset.visible).toBe("false");
    expect(view.playButton()?.textContent).toBe("播放实况");
  });
});
