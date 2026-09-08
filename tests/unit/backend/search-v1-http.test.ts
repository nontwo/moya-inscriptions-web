import {
  createBackendApplication,
  createBackendServer,
  startServer,
  stopServer,
} from "@moya/backend-runtime";
import { CatalogQueryUnavailableError } from "@moya/api";
import type { CatalogQueryPort, CatalogSearchQueryPort } from "@moya/api";
import { catalogSearchPageSchema } from "@moya/contracts/schemas";
import { UnconfiguredStorageUrlResolver } from "@moya/image";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";

const servers = new Set<Server>();
const emptyPort: CatalogQueryPort = {
  async list({ page, pageSize }) {
    return { items: [], total: 0, page, pageSize, totalPages: 0 };
  },
  async getById() {
    return null;
  },
};
const start = async (searchPort?: CatalogSearchQueryPort) => {
  const server = createBackendServer(
    createBackendApplication({
      nodeEnv: "production",
      catalogQueryPort: emptyPort,
      ...(searchPort === undefined
        ? {}
        : { catalogSearchQueryPort: searchPort }),
      storageUrlResolver: new UnconfiguredStorageUrlResolver(),
    }),
  );
  servers.add(server);
  const address = await startServer(server, { host: "127.0.0.1", port: 0 });
  return `http://${address.address}:${address.port}`;
};
afterEach(async () => {
  await Promise.all([...servers].map((server) => stopServer(server)));
  servers.clear();
});

describe("real Search V1 HTTP boundary", () => {
  it("passes validated parameters to its backend port and returns a schema-valid real empty result", async () => {
    const received: unknown[] = [];
    const base = await start({
      async search(query) {
        received.push(query);
        return {
          items: [],
          total: 0,
          page: query.page,
          pageSize: query.pageSize,
          totalPages: 0,
        };
      },
    });
    const response = await fetch(
      `${base}/v1/catalog-search?q=%E5%90%88%E6%88%90&kind=inscription&page=2&pageSize=1`,
    );
    expect(response.status).toBe(200);
    expect(catalogSearchPageSchema.parse(await response.json())).toEqual({
      items: [],
      total: 0,
      page: 2,
      pageSize: 1,
      totalPages: 0,
    });
    expect(received).toEqual([
      { q: "合成", kind: "inscription", page: 2, pageSize: 1 },
    ]);
    // The new endpoint does not reserve an opaque CatalogId named search.
    expect((await fetch(`${base}/v1/catalog/search`)).status).toBe(404);
  });
  it("rejects duplicate/unknown/blank parameters and unsupported methods before querying", async () => {
    let calls = 0;
    const base = await start({
      async search() {
        calls++;
        throw new Error("Synthetic unexpected port call");
      },
    });
    for (const query of [
      "",
      "q=",
      "q=%20",
      "q=synthetic&q=other",
      "q=synthetic&extra=1",
      "q=synthetic&kind=unknown",
      "q=synthetic&pageSize=101",
      "q=%00",
      "q=%C2%85",
    ]) {
      const response = await fetch(`${base}/v1/catalog-search?${query}`);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_QUERY");
    }
    expect(
      (await fetch(`${base}/v1/catalog-search?q=synthetic`, { method: "POST" }))
        .status,
    ).toBe(405);
    expect(calls).toBe(0);
  });
  it("keeps absent/stale and internal failures distinct from empty results without leaking errors", async () => {
    for (const [port, expected] of [
      [undefined, 503],
      [
        {
          async search() {
            throw new CatalogQueryUnavailableError();
          },
        },
        503,
      ],
      [
        {
          async search() {
            throw new Error("SYNTHETIC_INTERNAL_SENTINEL");
          },
        },
        500,
      ],
    ] as const) {
      const base = await start(port);
      const response = await fetch(`${base}/v1/catalog-search?q=synthetic`);
      expect(response.status).toBe(expected);
      const text = await response.text();
      expect(text).not.toContain("SYNTHETIC_INTERNAL_SENTINEL");
      expect(JSON.parse(text)).not.toHaveProperty("items");
    }
  });
});
