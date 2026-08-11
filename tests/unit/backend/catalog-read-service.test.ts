import { CatalogReadService } from "@moya/api";
import { catalogIdSchema } from "@moya/contracts/schemas";
import { describe, expect, it } from "vitest";

import type { CatalogListQuery, CatalogQueryPort } from "@moya/api";

const catalogId = catalogIdSchema.parse("catalog-service-001");

describe("CatalogReadService", () => {
  it("passes the normalized kind query to the Port and maps its projection", async () => {
    const received: CatalogListQuery[] = [];
    const port: CatalogQueryPort = {
      async list(query) {
        received.push(query);
        return {
          items: [
            {
              id: catalogId,
              kind: "calligraphy",
              title: "Port projection is authoritative",
              aliases: [],
            },
          ],
          total: 1,
          page: query.page,
          pageSize: query.pageSize,
          totalPages: 1,
        };
      },
      async getById() {
        return null;
      },
    };
    const service = new CatalogReadService(port);
    const query: CatalogListQuery = {
      kind: "inscription",
      page: 1,
      pageSize: 10,
    };

    const page = await service.list(query);

    expect(received).toEqual([query]);
    expect(page.items).toEqual([
      {
        id: catalogId,
        kind: "calligraphy",
        title: "Port projection is authoritative",
        aliases: [],
      },
    ]);
  });

  it("maps detail projections and preserves not-found as null", async () => {
    const port: CatalogQueryPort = {
      async list({ page, pageSize }) {
        return { items: [], total: 0, page, pageSize, totalPages: 0 };
      },
      async getById(id) {
        return id === catalogId
          ? {
              id,
              kind: "inscription",
              title: "Mapped detail",
              aliases: [],
              sourceCitations: [],
            }
          : null;
      },
    };
    const service = new CatalogReadService(port);

    await expect(service.getById(catalogId)).resolves.toMatchObject({
      id: catalogId,
      title: "Mapped detail",
    });
    await expect(
      service.getById(catalogIdSchema.parse("catalog-service-missing")),
    ).resolves.toBeNull();
  });
});
