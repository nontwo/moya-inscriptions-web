// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth-api", () => ({
  authRequest: vi.fn(async (path: string) =>
    path === "capabilities"
      ? {
          status: 200,
          body: {
            profile: "email-first",
            email: { available: true, reason: null },
            phone: {
              available: false,
              reason: "Phone sign-in is turned off in this acceptance profile.",
            },
            developmentOnly: true,
          },
        }
      : { status: 503, body: null },
  ),
  safeReturnPath: (value: string) => value,
}));

import { AuthFlow } from "./auth-flow";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe("AuthFlow", () => {
  let container: HTMLDivElement;
  afterEach(() => {
    container.remove();
  });

  it("starts on email and explains a disabled phone channel", async () => {
    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<AuthFlow mode="sign-in" returnTo="/" />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector("h1")?.textContent).toBe("登录");
    expect(container.querySelector("[aria-pressed='true']")?.textContent).toBe(
      "邮箱",
    );
    expect(container.textContent).toContain("手机登录当前不可用");
    expect(
      container.querySelector("a[href='/register?return=%2F']"),
    ).not.toBeNull();
    const code = container.querySelector("input[autocomplete='one-time-code']");
    expect(code).toBeNull();
    root.unmount();
  });
});
