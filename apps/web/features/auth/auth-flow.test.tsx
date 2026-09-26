// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth-api", () => ({
  authRequest: vi.fn(async (path: string) => {
    if (path === "capabilities")
      return {
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
      };
    if (path === "challenges")
      return {
        status: 200,
        body: {
          challengeId: "challenge-0123456789abcdef0123456789abcdef",
          maskedTarget: "p***@example.com",
          resendAvailableAt: "2099-01-01T00:01:00.000Z",
          continuationToken: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ1234567",
        },
      };
    return { status: 503, body: null };
  }),
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

  it("keeps six digits when a spaced code is entered in the single field", async () => {
    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<AuthFlow mode="sign-in" returnTo="/" />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const email = container.querySelector(
      "input[autocomplete='email']",
    ) as HTMLInputElement;
    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    setValue?.call(email, "person@example.com");
    await act(async () => {
      email.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const send = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "发送验证码",
    );
    await act(async () => {
      send?.click();
    });
    const code = container.querySelector(
      "input[autocomplete='one-time-code']",
    ) as HTMLInputElement;
    expect(code).not.toBeNull();
    setValue?.call(code, "12 3456");
    await act(async () => {
      code.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(code.value).toBe("123456");
    root.unmount();
  });

  // A phone on the Development LAN origin (plain HTTP) is not a secure
  // context, so crypto.randomUUID does not exist there.
  it("sends a code on a plain-HTTP LAN origin, where crypto.randomUUID does not exist", async () => {
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
    try {
      container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(<AuthFlow mode="sign-in" returnTo="/" />);
      });
      await act(async () => {
        await Promise.resolve();
      });
      const email = container.querySelector(
        "input[autocomplete='email']",
      ) as HTMLInputElement;
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(email, "phone@example.com");
      await act(async () => {
        email.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const send = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "发送验证码",
      );
      await act(async () => {
        send?.click();
      });
      expect(
        container.querySelector("input[autocomplete='one-time-code']"),
      ).not.toBeNull();
      const { authRequest } = await import("./auth-api");
      const sent = vi
        .mocked(authRequest)
        .mock.calls.find(([path]) => path === "challenges");
      expect(
        (sent?.[1]?.body as { idempotencyKey?: string } | undefined)
          ?.idempotencyKey,
      ).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      );
      root.unmount();
    } finally {
      delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
  });
});
