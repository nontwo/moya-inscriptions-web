// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./auth-api", () => ({
  authRequest: vi.fn(),
}));

import { authRequest } from "./auth-api";
import { AccountSecurity } from "./account-security";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const request = vi.mocked(authRequest);

const account = {
  userId: "user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  email: {
    channel: "email" as const,
    state: "verified" as const,
    masked: "a***@example.com",
    version: 1,
    usable: true,
  },
  phone: {
    channel: "phone" as const,
    state: "unbound" as const,
    masked: null,
    version: 0,
    usable: false,
  },
  capabilities: {
    profile: "full-local" as const,
    email: { available: true, reason: null },
    phone: { available: true, reason: null },
    developmentOnly: true,
  },
};

const challenge = {
  challengeId: "challenge-0123456789abcdef0123456789abcdef",
  continuationToken: "a".repeat(43),
  maskedTarget: "a***@example.com",
};

const setValue = (element: HTMLInputElement, value: string): void => {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
};

describe("AccountSecurity", () => {
  let container: HTMLDivElement;
  afterEach(() => {
    container.remove();
    request.mockReset();
  });

  it("binds a phone to the current account instead of registering", async () => {
    const purposes: unknown[] = [];
    request.mockImplementation(async (path, init) => {
      const body = init?.body as { purpose?: string } | undefined;
      if (body?.purpose !== undefined) purposes.push(body.purpose);
      if (path === "account") return { status: 200, body: account };
      if (path === "challenges" && body?.purpose === "reauthenticate")
        return { status: 200, body: challenge };
      if (path === "challenges/verify")
        return {
          status: 200,
          body: { outcome: "reauthenticated", reauthToken: "b".repeat(43) },
        };
      if (path === "challenges" && body?.purpose === "link")
        return {
          status: 200,
          body: { ...challenge, maskedTarget: "138****8000" },
        };
      if (path === "factors/complete")
        return {
          status: 200,
          body: {
            outcome: "updated",
            account: {
              ...account,
              phone: {
                channel: "phone",
                state: "verified",
                masked: "138****8000",
                version: 1,
                usable: true,
              },
            },
          },
        };
      return {
        status: 500,
        body: { error: { message: "AUTH_PROOF_REJECTED" } },
      };
    });
    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<AccountSecurity />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const bind = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "绑定",
    );
    expect(container.querySelector("a[href^='/login']")).toBeNull();
    await act(async () => {
      bind?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const proof = container.querySelector(
      "input[autocomplete='one-time-code']",
    ) as HTMLInputElement;
    await act(async () => {
      setValue(proof, "123456");
    });
    const continueProof = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "继续",
    );
    await act(async () => {
      continueProof?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const phone = container.querySelector(
      "input[autocomplete='tel']",
    ) as HTMLInputElement;
    await act(async () => {
      setValue(phone, "13800138000");
    });
    const send = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "发送验证码",
    );
    await act(async () => {
      send?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const factor = container.querySelector(
      "input[autocomplete='one-time-code']",
    ) as HTMLInputElement;
    await act(async () => {
      setValue(factor, "654321");
    });
    const finish = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "继续",
    );
    await act(async () => {
      finish?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(purposes).toEqual(["reauthenticate", "link"]);
    expect(request.mock.calls.some(([path]) => path === "registrations")).toBe(
      false,
    );
    expect(container.textContent).toContain(
      "user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" === account.userId
        ? "138****8000"
        : "",
    );
    expect(container.textContent).toContain("已验证");
    root.unmount();
  });

  it("shows last-factor protection without creating an account", async () => {
    request.mockImplementation(async (path, init) => {
      const body = init?.body as { purpose?: string } | undefined;
      if (path === "account")
        return {
          status: 200,
          body: {
            ...account,
            phone: {
              ...account.phone,
              state: "unavailable",
            },
            capabilities: {
              ...account.capabilities,
              phone: { available: false, reason: "off" },
            },
          },
        };
      if (path === "challenges" && body?.purpose === "reauthenticate")
        return { status: 200, body: challenge };
      if (path === "challenges/verify")
        return {
          status: 200,
          body: { outcome: "reauthenticated", reauthToken: "b".repeat(43) },
        };
      if (path === "factors/unlink")
        return {
          status: 409,
          body: { error: { message: "AUTH_LAST_FACTOR" } },
        };
      return {
        status: 500,
        body: { error: { message: "AUTH_PROOF_REJECTED" } },
      };
    });
    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<AccountSecurity />);
    });
    await act(async () => {
      await Promise.resolve();
    });
    const unlink = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "解除",
    );
    await act(async () => {
      unlink?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const proof = container.querySelector(
      "input[autocomplete='one-time-code']",
    ) as HTMLInputElement;
    await act(async () => {
      setValue(proof, "123456");
    });
    const continueProof = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "继续",
    );
    await act(async () => {
      continueProof?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain("至少需要保留一种可用的登录方式");
    expect(request.mock.calls.some(([path]) => path === "registrations")).toBe(
      false,
    );
    expect(
      request.mock.calls.some(([, init]) => {
        const body = init?.body as { purpose?: string } | undefined;
        return body?.purpose === "register" || body?.purpose === "sign_in";
      }),
    ).toBe(false);
    root.unmount();
  });

  // A phone on the Development LAN origin (plain HTTP) is not a secure
  // context, so crypto.randomUUID does not exist there.
  it("starts binding on a plain-HTTP LAN origin, where crypto.randomUUID does not exist", async () => {
    request.mockImplementation(async (path, init) => {
      const body = init?.body as { purpose?: string } | undefined;
      if (path === "account") return { status: 200, body: account };
      if (path === "challenges" && body?.purpose === "reauthenticate")
        return { status: 200, body: challenge };
      return {
        status: 500,
        body: { error: { message: "AUTH_PROOF_REJECTED" } },
      };
    });
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: undefined,
    });
    try {
      container = document.createElement("div");
      document.body.append(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(<AccountSecurity />);
      });
      await act(async () => {
        await Promise.resolve();
      });
      const bind = [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "绑定",
      );
      await act(async () => {
        bind?.click();
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(
        container.querySelector("input[autocomplete='one-time-code']"),
      ).not.toBeNull();
      const sent = request.mock.calls.find(
        ([path, init]) =>
          path === "challenges" &&
          (init?.body as { purpose?: string } | undefined)?.purpose ===
            "reauthenticate",
      );
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
