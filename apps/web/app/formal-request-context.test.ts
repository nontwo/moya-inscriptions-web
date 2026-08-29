import { beforeEach, describe, expect, it, vi } from "vitest";

const { headersMock } = vi.hoisted(() => ({
  headersMock: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: headersMock }));

import { readFormalRequestContext } from "./formal-request-context";

const headerValues = (values: Readonly<Record<string, string>>) => {
  const get = vi.fn((name: string) => values[name] ?? null);
  headersMock.mockResolvedValue({ get });
  return get;
};

beforeEach(() => {
  headersMock.mockReset();
});

describe("Formal request context", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "phone"],
    ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", "tablet"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X)", "pc"],
  ] as const)(
    "uses the accepted fallback for a request without viewport hints: %s",
    async (userAgent, expected) => {
      headerValues({ "user-agent": userAgent });

      await expect(readFormalRequestContext()).resolves.toEqual({
        initialPlatform: expected,
      });
    },
  );

  it.each([
    ["767", "phone"],
    ["768", "tablet"],
    ["895", "tablet"],
    ["896", "pc"],
  ] as const)(
    "uses a valid viewport hint at width %s",
    async (width, expected) => {
      headerValues({
        "sec-ch-viewport-width": width,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      });

      await expect(readFormalRequestContext()).resolves.toEqual({
        initialPlatform: expected,
      });
    },
  );

  it("prefers sec-ch-viewport-width over viewport-width", async () => {
    headerValues({
      "sec-ch-viewport-width": "896",
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      "viewport-width": "390",
    });

    await expect(readFormalRequestContext()).resolves.toEqual({
      initialPlatform: "pc",
    });
  });

  it.each(["", "invalid", "0", "-1", "Infinity"])(
    "uses the device fallback for invalid viewport width %o",
    async (width) => {
      headerValues({
        "sec-ch-viewport-width": width,
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X)",
      });

      await expect(readFormalRequestContext()).resolves.toEqual({
        initialPlatform: "pc",
      });
    },
  );

  it("reads only the authorized request headers", async () => {
    const get = headerValues({});

    await readFormalRequestContext();

    expect(get.mock.calls.map(([name]) => name)).toEqual([
      "user-agent",
      "sec-ch-viewport-width",
      "viewport-width",
    ]);
  });
});
