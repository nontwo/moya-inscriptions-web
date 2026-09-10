import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ProductionCosStorageUrlResolver,
  productionCosOptions,
} from "@moya/backend-production/internal/production-cos";
import type { CosReadOptions } from "@moya/backend-production/internal/cos-read";
import type { CosSdkClient } from "@moya/backend-production/internal/cos-sdk";

const now = 1_788_820_000_000;
const options = (): CosReadOptions => ({
  bucket: "synthetic-example-1250000000",
  region: "ap-guangzhou",
  mediaOrigin: "https://media.example.invalid",
  credentials: async () => ({
    secretId: "synthetic-unit-id",
    secretKey: "synthetic-unit-secret",
  }),
});
const locator = {
  mediaId: "media-production-any-count",
  objectKey: "catalog-originals/approved existing/原圖 100%.webp",
};

afterEach(() => vi.useRealTimers());

describe("production COS signing without Pilot policy", () => {
  it("signs more than 20 authorized database keys without a manifest or network", async () => {
    const network = vi.fn(() => {
      throw new Error("unexpected network");
    });
    const resolver = new ProductionCosStorageUrlResolver(options(), {
      now: () => now,
      nativeRequest: network,
    });
    const locators = Array.from({ length: 35 }, (_, index) => ({
      mediaId: `catalog-media-${index}`,
      objectKey: `originals/任意批准前缀/${index}.webp`,
    }));
    const result = await resolver.resolveMany(locators);
    expect(result.size).toBe(35);
    expect(
      new URL(result.get("catalog-media-34")!).searchParams.get("q-sign-time"),
    ).toBe(`${now / 1000};${now / 1000 + 300}`);
    expect(network).not.toHaveBeenCalled();
    expect(resolver).not.toHaveProperty("ensureObject");
  });

  it("preserves approved keys and refreshes short signatures on every read", async () => {
    let time = now;
    const resolver = new ProductionCosStorageUrlResolver(options(), {
      now: () => time,
    });
    const first = new URL(
      (await resolver.resolveMany([locator])).get(locator.mediaId)!,
    );
    expect(decodeURIComponent(first.pathname.slice(1))).toBe(locator.objectKey);
    expect(first.origin).toBe(options().mediaOrigin);
    expect(first.searchParams.get("response-cache-control")).toBe("no-store");
    time += 350_000;
    expect(
      (await resolver.resolveMany([locator])).get(locator.mediaId),
    ).not.toBe(first.href);
  });

  it("bounds signed STS reads by credential expiry and signs the encoded token", async () => {
    const resolver = new ProductionCosStorageUrlResolver(
      {
        ...options(),
        credentials: async () => ({
          secretId: "synthetic-unit-id",
          secretKey: "synthetic-unit-secret",
          securityToken: ["synthetic-unit-token", "+/="].join(""),
          expiresAt: now / 1000 + 90,
        }),
      },
      { now: () => now },
    );
    const url = new URL(
      (await resolver.resolveMany([locator])).get(locator.mediaId)!,
    );
    expect(url.searchParams.get("q-sign-time")).toBe(
      `${now / 1000};${now / 1000 + 90}`,
    );
    expect(url.searchParams.get("x-cos-security-token")).toBe(
      ["synthetic-unit-token", "+/="].join(""),
    );
    expect(url.searchParams.get("q-url-param-list")).toContain(
      "x-cos-security-token",
    );
  });

  it.each([
    "",
    "/outside",
    "originals/../outside",
    "originals/./outside",
    "originals\\outside",
    "originals/\u0000outside",
  ])(
    "rejects unsafe object key before credential access",
    async (objectKey) => {
      const credentials = vi.fn(options().credentials);
      const resolver = new ProductionCosStorageUrlResolver({
        ...options(),
        credentials,
      });
      await expect(
        resolver.resolveMany([{ ...locator, objectKey }]),
      ).rejects.toThrow("COS object key invalid");
      expect(credentials).not.toHaveBeenCalled();
    },
  );

  it.each([
    { signedUrlTtlSeconds: 59 },
    { signedUrlTtlSeconds: 601 },
    { requestTimeoutMs: 0 },
    { requestTimeoutMs: 120_001 },
    { bucket: "wrong" },
    { region: "wrong" },
    { mediaOrigin: "http://media.example.invalid" },
  ])("fails closed on invalid storage configuration", (invalid) => {
    expect(
      () => new ProductionCosStorageUrlResolver({ ...options(), ...invalid }),
    ).toThrow(/^COS /);
  });

  it("redacts credential and SDK failures", async () => {
    const resolver = new ProductionCosStorageUrlResolver({
      ...options(),
      credentials: async () => {
        throw new Error("unit-only-private-detail");
      },
    });
    await expect(resolver.resolveMany([locator])).rejects.toThrow(
      /^COS credentials unavailable$/,
    );
    const failed = new ProductionCosStorageUrlResolver(options(), {
      now: () => now,
      sdkFactory: () => {
        throw new Error("unit-only-signed-request");
      },
    });
    await expect(failed.resolveMany([locator])).rejects.toThrow(
      /^COS URL signing failed$/,
    );
  });

  it("applies an absolute deadline to stalled credential resolution and SDK callbacks", async () => {
    vi.useFakeTimers();
    const waiting = new ProductionCosStorageUrlResolver({
      ...options(),
      requestTimeoutMs: 10,
      credentials: () => new Promise(() => {}),
    });
    const credentials = expect(waiting.resolveMany([locator])).rejects.toThrow(
      /^COS URL signing failed$/,
    );
    await vi.advanceTimersByTimeAsync(10);
    await credentials;
    const stalled = new ProductionCosStorageUrlResolver(
      { ...options(), requestTimeoutMs: 10 },
      {
        now: () => now,
        sdkFactory: () =>
          ({ getObjectUrl: () => {} }) as unknown as CosSdkClient,
      },
    );
    const callback = expect(stalled.resolveMany([locator])).rejects.toThrow(
      /^COS URL signing failed$/,
    );
    await vi.advanceTimersByTimeAsync(10);
    await callback;
  });
});

describe("production COS environment", () => {
  const environment = {
    COS_BUCKET: "synthetic-example-1250000000",
    COS_REGION: "ap-guangzhou",
    COS_MEDIA_ORIGIN: "https://media.example.invalid",
    COS_SECRET_ID: "synthetic-unit-id",
    COS_SECRET_KEY: "synthetic-unit-secret",
  };

  it.each(Object.keys(environment))(
    "requires %s without reading files or making cloud requests",
    (key) => {
      expect(() =>
        productionCosOptions({ ...environment, [key]: undefined }),
      ).toThrow(`Production COS configuration missing or invalid: ${key}`);
    },
  );

  it("does not use Pilot files and rejects malformed optional limits or partial STS", () => {
    expect(
      () =>
        new ProductionCosStorageUrlResolver(
          productionCosOptions({
            ...environment,
            MOYA_PILOT_SCOPE_FILE: "unused",
            MOYA_PILOT_MEDIA_FILE: "unused",
          }),
        ),
    ).not.toThrow();
    expect(() =>
      productionCosOptions({
        ...environment,
        COS_SECURITY_TOKEN: "synthetic-unit-token",
      }),
    ).toThrow("COS_CREDENTIAL_EXPIRES_AT");
    expect(() =>
      productionCosOptions({ ...environment, COS_REQUEST_TIMEOUT_MS: "1e3" }),
    ).toThrow("COS_REQUEST_TIMEOUT_MS");
  });
});
