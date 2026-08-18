// @vitest-environment jsdom
/// <reference lib="dom" />

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  homeLayoutPreferenceKey,
  presentationPreferenceBootstrap,
  themePreferenceKey,
} from "./presentation-preferences";

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-home-layout");
  vi.restoreAllMocks();
});

describe("T02 presentation preference bootstrap", () => {
  it("applies valid stored preferences before paint", () => {
    window.localStorage.setItem(themePreferenceKey, "dark");
    window.localStorage.setItem(homeLayoutPreferenceKey, "single");

    Function(presentationPreferenceBootstrap)();

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.homeLayout).toBe("single");
  });

  it("falls back to system and double for invalid or blocked storage", () => {
    window.localStorage.setItem(themePreferenceKey, "sepia");
    window.localStorage.setItem(homeLayoutPreferenceKey, "triple");
    Function(presentationPreferenceBootstrap)();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.documentElement.dataset.homeLayout).toBe("double");

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked");
    });
    document.documentElement.dataset.theme = "dark";
    Function(presentationPreferenceBootstrap)();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(document.documentElement.dataset.homeLayout).toBe("double");
  });
});
