import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { request } from "node:https";

import { afterEach, describe, expect, it, vi } from "vitest";

import { requestCosHttps } from "@moya/backend-production/internal/cos-https";
import {
  canonicalCosRequest,
  cosUrlEncode,
  signCosRequest,
} from "@moya/backend-production/internal/cos-signature";
import { PilotCosStorage } from "@moya/backend-production/internal/pilot-cos";

import type {
  CosHttpRequest,
  CosHttpResponse,
  CosHttpSender,
} from "@moya/backend-production/internal/cos-https";
import type { PilotCosOptions } from "@moya/backend-production/internal/pilot-cos";

vi.mock("node:https", () => ({ request: vi.fn() }));

const content = Buffer.from("frozen-pilot-image-bytes");
const digest = createHash("sha256").update(content).digest("hex");
const mediaId = `media_${"a".repeat(32)}`;
const objectKey = `display/v1/${mediaId}/${digest}.webp`;
const now = 1_788_820_000_000;
const options = (): PilotCosOptions => ({
  bucket: "pilot-example-1250000000",
  region: "ap-guangzhou",
  mediaOrigin: "https://media.example.invalid",
  objects: [{ mediaId, objectKey, sha256: digest, sizeBytes: content.length }],
  credentials: async () => ({
    secretId: "unit-only-id",
    secretKey: "unit-only-secret",
  }),
});
const response = (
  statusCode: number,
  body = Buffer.alloc(0),
): CosHttpResponse => ({
  statusCode,
  headers: {},
  body,
});
const queueSender = (...responses: CosHttpResponse[]) => {
  const calls: CosHttpRequest[] = [];
  const sender: CosHttpSender = async (input) => {
    calls.push(input);
    const next = responses.shift();
    if (!next) throw new Error("Unexpected request");
    return next;
  };
  return { calls, sender };
};
const neverVersioned = () =>
  response(200, Buffer.from("<VersioningConfiguration/>"));

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("COS XML signing", () => {
  const officialDownload = {
    method: "GET" as const,
    pathname: "/exampleobject(腾讯云)",
    headers: {
      Date: "Thu, 16 May 2019 06:55:53 GMT",
      Host: "examplebucket-1250000000.cos.ap-beijing.myqcloud.com",
    },
    query: {
      "response-content-type": "application/octet-stream",
      "response-cache-control": "max-age=600",
    },
  };

  it("matches Tencent's published download canonical vector", () => {
    // https://cloud.tencent.com/document/product/436/7778, example two.
    // Tencent masks the secret and signature; this is the published SHA1 vector.
    expect(canonicalCosRequest(officialDownload)).toMatchObject({
      headerList: "date;host",
      parameterList: "response-cache-control;response-content-type",
      httpStringSha1: "54ecfe22f59d3514fdc764b87a32d8133ea611e6",
    });
    expect(cosUrlEncode("!'()* /中")).toBe("%21%27%28%29%2A%20%2F%E4%B8%AD");
  });

  it("uses the hex text of SignKey in the second HMAC", () => {
    // Expected signature independently calculated with Python hashlib/hmac;
    // the credential is synthetic and has no cloud authority.
    expect(
      signCosRequest({
        ...officialDownload,
        secretId: "unit-only-id",
        secretKey: "unit-only-secret",
        startsAt: 1557989753,
        expiresAt: 1557996953,
      }),
    ).toContain("q-signature=d09793bd538553f0e97bca0a307a4d18e9a206ad");
    expect(() =>
      canonicalCosRequest({
        ...officialDownload,
        headers: { HOST: "a", host: "b" },
      }),
    ).toThrow("duplicate canonical");
    expect(() =>
      signCosRequest({
        ...officialDownload,
        secretId: "id",
        secretKey: "key",
        startsAt: 20,
        expiresAt: 20,
      }),
    ).toThrow("configuration invalid");
  });
});

describe("bounded Pilot COS operations", () => {
  it("uploads only missing objects and verifies actual GET bytes", async () => {
    const queue = queueSender(
      response(404),
      neverVersioned(),
      response(200),
      response(200, content),
    );
    const storage = new PilotCosStorage(options(), {
      sender: queue.sender,
      now: () => now,
    });
    expect(await storage.ensureObject(objectKey, content)).toEqual({
      objectKey,
      sha256: digest,
      sizeBytes: content.length,
      outcome: "uploaded",
      verifiedAt: new Date(now).toISOString(),
    });
    expect(
      queue.calls.map((call) => [
        call.method,
        call.url.pathname,
        call.url.searchParams.get("versioning"),
      ]),
    ).toEqual([
      ["HEAD", `/${objectKey}`, null],
      ["GET", "/", ""],
      ["PUT", `/${objectKey}`, null],
      ["GET", `/${objectKey}`, null],
    ]);
    const put = queue.calls[2]!;
    expect(put.headers["x-cos-forbid-overwrite"]).toBe("true");
    expect(put.headers.authorization).toContain("x-cos-forbid-overwrite");
    expect(put.headers["content-md5"]).toBe(
      createHash("md5").update(content).digest("base64"),
    );
    expect(put.body).toEqual(content);
  });

  it("replay reuses existing byte-identical objects without PUT", async () => {
    const queue = queueSender(
      response(200),
      response(200, content),
      response(200),
      response(200, content),
    );
    const storage = new PilotCosStorage(options(), { sender: queue.sender });
    expect((await storage.ensureObject(objectKey, content)).outcome).toBe(
      "reused",
    );
    expect((await storage.ensureObject(objectKey, content)).outcome).toBe(
      "reused",
    );
    expect(queue.calls.map((call) => call.method)).toEqual([
      "HEAD",
      "GET",
      "HEAD",
      "GET",
    ]);
  });

  it("rejects different GET bytes even when metadata claims the expected digest", async () => {
    const queue = queueSender(response(200), {
      ...response(200, Buffer.alloc(content.length)),
      headers: { "x-cos-meta-sha256": digest, etag: digest },
    });
    await expect(
      new PilotCosStorage(options(), { sender: queue.sender }).ensureObject(
        objectKey,
        content,
      ),
    ).rejects.toThrow("content conflicts");
    expect(queue.calls.every((call) => call.method !== "PUT")).toBe(true);
  });

  it.each([409, 412])(
    "verifies a concurrent create after HTTP %s instead of overwriting",
    async (status) => {
      const queue = queueSender(
        response(404),
        neverVersioned(),
        response(status),
        response(200, content),
      );
      expect(
        (
          await new PilotCosStorage(options(), {
            sender: queue.sender,
          }).ensureObject(objectKey, content)
        ).outcome,
      ).toBe("reused");
      expect(queue.calls.filter((call) => call.method === "PUT")).toHaveLength(
        1,
      );
    },
  );

  it.each([
    "<VersioningConfiguration><Status>Enabled</Status></VersioningConfiguration>",
    "<VersioningConfiguration><Status>Suspended</Status></VersioningConfiguration>",
    "",
    "<Error/>",
  ])(
    "blocks upload when versioning is enabled, suspended or unknown: %s",
    async (xml) => {
      const queue = queueSender(response(404), response(200, Buffer.from(xml)));
      await expect(
        new PilotCosStorage(options(), { sender: queue.sender }).ensureObject(
          objectKey,
          content,
        ),
      ).rejects.toThrow("never-versioned");
      expect(queue.calls.some((call) => call.method === "PUT")).toBe(false);
    },
  );

  it("treats denied existence reads as uncertainty rather than absent objects", async () => {
    const queue = queueSender(response(403));
    await expect(
      new PilotCosStorage(options(), { sender: queue.sender }).ensureObject(
        objectKey,
        content,
      ),
    ).rejects.toThrow("existence could not be verified");
    expect(queue.calls).toHaveLength(1);
  });

  it("rejects unlisted keys and changed input before making any request", async () => {
    const queue = queueSender();
    const storage = new PilotCosStorage(options(), { sender: queue.sender });
    await expect(storage.ensureObject("../outside", content)).rejects.toThrow(
      "outside",
    );
    await expect(
      storage.ensureObject(objectKey, Buffer.alloc(content.length)),
    ).rejects.toThrow("SHA-256");
    await expect(
      storage.ensureObject(objectKey, Buffer.alloc(1)),
    ).rejects.toThrow("size mismatch");
    expect(queue.calls).toHaveLength(0);
  });

  it("rejects malformed, duplicate and oversized manifests", () => {
    const normal = options();
    expect(
      () =>
        new PilotCosStorage({
          ...normal,
          objects: [...normal.objects, ...normal.objects],
        }),
    ).toThrow("duplicated");
    expect(
      () =>
        new PilotCosStorage({
          ...normal,
          objects: [{ ...normal.objects[0]!, sizeBytes: 33 * 1024 * 1024 }],
        }),
    ).toThrow("manifest invalid");
    expect(
      () =>
        new PilotCosStorage({
          ...normal,
          objects: [
            { ...normal.objects[0]!, objectKey: "display/v1/../image.webp" },
          ],
        }),
    ).toThrow("manifest invalid");
  });

  it("caps GET response size and does not leak transport details", async () => {
    const queue = queueSender(response(200, Buffer.alloc(content.length + 1)));
    await expect(
      new PilotCosStorage(options(), { sender: queue.sender }).verifyObject(
        objectKey,
      ),
    ).rejects.toThrow("COS request failed; verify state before retrying");
    await expect(
      new PilotCosStorage(options(), {
        sender: async () => {
          throw new Error("secret-and-signed-request");
        },
      }).verifyObject(objectKey),
    ).rejects.toThrow(/^COS request failed; verify state before retrying$/);
  });

  it("does not return success when upload succeeds but verification fails; next retry can reuse", async () => {
    const queue = queueSender(
      response(404),
      neverVersioned(),
      response(200),
      response(503),
      response(200),
      response(200, content),
    );
    const storage = new PilotCosStorage(options(), { sender: queue.sender });
    await expect(storage.ensureObject(objectKey, content)).rejects.toThrow(
      "content conflicts",
    );
    expect((await storage.ensureObject(objectKey, content)).outcome).toBe(
      "reused",
    );
    expect(queue.calls.filter((call) => call.method === "PUT")).toHaveLength(1);
  });
});

describe("short-lived backend URL resolver", () => {
  it("refreshes signatures on every API read and signs only matching identities", async () => {
    let time = now;
    const storage = new PilotCosStorage(options(), { now: () => time });
    const resolver = storage.createStorageUrlResolver();
    const locators = [
      { mediaId, objectKey },
      { mediaId: "wrong", objectKey },
      { mediaId, objectKey: "outside" },
    ];
    const first = await resolver.resolveMany(locators);
    expect(first.size).toBe(1);
    const url = new URL(first.get(mediaId)!);
    expect(url.origin).toBe("https://media.example.invalid");
    expect(url.pathname).toBe(`/${objectKey}`);
    expect(url.searchParams.get("q-sign-time")).toBe(
      `${now / 1000};${now / 1000 + 300}`,
    );
    expect(url.searchParams.get("response-cache-control")).toBe("no-store");
    time += 400_000;
    expect((await resolver.resolveMany(locators)).get(mediaId)).not.toBe(
      url.toString(),
    );
  });

  it("bounds temporary credential lifetime and never emits expired URLs", async () => {
    let time = now;
    const storage = new PilotCosStorage(
      {
        ...options(),
        credentials: async () => ({
          secretId: "unit-only-id",
          secretKey: "unit-only-secret",
          securityToken: "unit-token+/=",
          expiresAt: now / 1000 + 90,
        }),
      },
      { now: () => time },
    );
    const resolver = storage.createStorageUrlResolver();
    const url = new URL(
      (await resolver.resolveMany([{ mediaId, objectKey }])).get(mediaId)!,
    );
    expect(url.searchParams.get("q-sign-time")).toBe(
      `${now / 1000};${now / 1000 + 90}`,
    );
    expect(url.searchParams.get("x-cos-security-token")).toBe("unit-token+/=");
    expect(url.searchParams.get("q-url-param-list")).toContain(
      "x-cos-security-token",
    );
    time += 100_000;
    await expect(
      resolver.resolveMany([{ mediaId, objectKey }]),
    ).rejects.toThrow("expired");
  });

  it.each([
    "http://media.example.invalid",
    "https://u:p@media.example.invalid",
    "https://media.example.invalid/path",
    "https://media.example.invalid/?signed=1",
    "https://127.0.0.1",
    "https://media.example.invalid:8443",
  ])("rejects unsafe origins: %s", (mediaOrigin) => {
    expect(() => new PilotCosStorage({ ...options(), mediaOrigin })).toThrow(
      "HTTPS DNS origin",
    );
  });
});

describe("native HTTPS limits", () => {
  const input = (): CosHttpRequest => ({
    url: new URL("https://media.example.invalid/key"),
    method: "GET",
    headers: {},
    maxResponseBytes: 4,
    timeoutMs: 10,
  });

  const mockConnection = () => {
    const incoming = Object.assign(new EventEmitter(), {
      statusCode: 200,
      headers: {},
      destroy: vi.fn(),
    });
    const outgoing = Object.assign(new EventEmitter(), {
      end: vi.fn(),
      destroy: vi.fn(),
    });
    vi.mocked(request).mockImplementation(((
      _url: unknown,
      _options: unknown,
      callback: (value: unknown) => void,
    ) => {
      queueMicrotask(() => callback(incoming));
      return outgoing;
    }) as unknown as typeof request);
    return { incoming, outgoing };
  };

  it("uses an absolute deadline and destroys a stalled request", async () => {
    vi.useFakeTimers();
    const connection = mockConnection();
    const result = expect(requestCosHttps(input())).rejects.toThrow(
      "timed out",
    );
    await vi.advanceTimersByTimeAsync(10);
    await result;
    expect(connection.outgoing.destroy).toHaveBeenCalledOnce();
  });

  it("aborts oversized and incomplete response bodies", async () => {
    const connection = mockConnection();
    const result = expect(requestCosHttps(input())).rejects.toThrow(
      "byte limit",
    );
    await Promise.resolve();
    connection.incoming.emit("data", Buffer.alloc(5));
    await result;
    expect(connection.incoming.destroy).toHaveBeenCalledOnce();
    const interrupted = mockConnection();
    const failure = expect(requestCosHttps(input())).rejects.toThrow(
      "interrupted",
    );
    await Promise.resolve();
    interrupted.incoming.emit("aborted");
    await failure;
  });

  it("never follows redirect responses or includes underlying errors in failures", async () => {
    const connection = mockConnection();
    connection.incoming.statusCode = 302;
    const pending = requestCosHttps(input());
    await Promise.resolve();
    connection.incoming.emit("end");
    expect((await pending).statusCode).toBe(302);
    expect(request).toHaveBeenCalledOnce();
    const next = mockConnection();
    const rejected = expect(requestCosHttps(input())).rejects.toThrow(
      /^COS request transport failed$/,
    );
    next.outgoing.emit("error", new Error("secret-url-token"));
    await rejected;
  });
});
