import { setTimeout as delay } from "node:timers/promises";

import {
  createBackendServer,
  parseRuntimeConfig,
  startServer,
  stopServer,
} from "@moya/backend-runtime";
import { healthResponseSchema } from "@moya/contracts/schemas";
import { afterEach, describe, expect, it } from "vitest";

import type { RequestListener, Server } from "node:http";

const servers = new Set<Server>();

const startTestServer = async (requestListener?: RequestListener) => {
  const server = createBackendServer(requestListener);
  servers.add(server);
  const address = await startServer(server, {
    host: "127.0.0.1",
    port: 0,
  });
  return {
    baseUrl: `http://${address.address}:${address.port}`,
    server,
  };
};

afterEach(async () => {
  await Promise.all(
    [...servers].map(async (server) => {
      await stopServer(server);
      servers.delete(server);
    }),
  );
});

describe("runtime configuration", () => {
  it("uses safe development defaults", () => {
    expect(parseRuntimeConfig({})).toEqual({
      host: "127.0.0.1",
      nodeEnv: "development",
      port: 3001,
    });
  });

  it("allows local and test overrides, including a container host", () => {
    expect(
      parseRuntimeConfig({
        HOST: "0.0.0.0",
        NODE_ENV: "test",
        PORT: "4100",
      }),
    ).toEqual({ host: "0.0.0.0", nodeEnv: "test", port: 4100 });
  });

  it("accepts explicit production configuration", () => {
    expect(
      parseRuntimeConfig({
        HOST: "0.0.0.0",
        NODE_ENV: "production",
        PORT: "8080",
      }),
    ).toEqual({ host: "0.0.0.0", nodeEnv: "production", port: 8080 });
  });

  it.each([
    [{ NODE_ENV: "production", PORT: "8080" }, "HOST"],
    [{ HOST: "0.0.0.0", NODE_ENV: "production" }, "PORT"],
  ])("requires explicit production host and port", (environment, field) => {
    expect(() => parseRuntimeConfig(environment)).toThrow(field);
  });

  it.each([
    [{ NODE_ENV: "staging" }, "NODE_ENV"],
    [{ HOST: "" }, "HOST"],
    [{ HOST: "local host" }, "HOST"],
    [{ PORT: "0" }, "PORT"],
    [{ PORT: "65536" }, "PORT"],
    [{ PORT: "3001.5" }, "PORT"],
    [{ PORT: "not-a-port" }, "PORT"],
  ])("rejects invalid external runtime configuration", (environment, field) => {
    expect(() => parseRuntimeConfig(environment)).toThrow(field);
  });
});

describe("HTTP runtime", () => {
  it("starts on an OS-assigned internal test port and serves health JSON", async () => {
    const { baseUrl } = await startTestServer();
    const response = await fetch(`${baseUrl}/health?probe=readiness`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(text).toBe('{"status":"ok"}');
    expect(healthResponseSchema.parse(JSON.parse(text))).toEqual({
      status: "ok",
    });
  });

  it.each(["/missing", "/health/", "/v1/catalog"])(
    "returns a JSON 404 for unknown route %s",
    async (path) => {
      const { baseUrl } = await startTestServer();
      const response = await fetch(`${baseUrl}${path}`);

      expect(response.status).toBe(404);
      expect(response.headers.get("content-type")).toBe(
        "application/json; charset=utf-8",
      );
      expect(await response.json()).toEqual({
        error: { message: "Not Found", status: 404 },
      });
    },
  );

  it("returns JSON 405 and Allow for an unsupported health method", async () => {
    const { baseUrl } = await startTestServer();
    const response = await fetch(`${baseUrl}/health`, { method: "POST" });

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expect(response.headers.get("content-type")).toBe(
      "application/json; charset=utf-8",
    );
    expect(await response.json()).toEqual({
      error: { message: "Method Not Allowed", status: 405 },
    });
  });

  it("waits for an in-flight request during lifecycle shutdown", async () => {
    let markHandlingStarted: () => void = () => undefined;
    let releaseRequest: () => void = () => undefined;
    const handlingStarted = new Promise<void>((resolve) => {
      markHandlingStarted = resolve;
    });
    const requestReleased = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    const { baseUrl, server } = await startTestServer((_request, response) => {
      markHandlingStarted();
      void requestReleased.then(() => {
        response.end("complete");
      });
    });

    const responsePromise = fetch(`${baseUrl}/in-flight`);
    await handlingStarted;

    let shutdownFinished = false;
    const shutdownPromise = stopServer(server, { timeoutMs: 1_000 }).then(
      () => {
        shutdownFinished = true;
      },
    );
    await delay(20);
    expect(shutdownFinished).toBe(false);

    releaseRequest();
    expect(await (await responsePromise).text()).toBe("complete");
    await shutdownPromise;

    expect(shutdownFinished).toBe(true);
    expect(server.listening).toBe(false);
  });
});
