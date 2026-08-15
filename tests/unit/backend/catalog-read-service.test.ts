import { CatalogMediaResolutionError, CatalogReadService } from "@moya/api";
import { catalogIdSchema, mediaIdSchema } from "@moya/contracts/schemas";
import { describe, expect, it } from "vitest";

import type {
  CatalogListQuery,
  CatalogQueryPort,
  StorageMediaLocator,
  StorageUrlResolver,
} from "@moya/api";

const catalogId = catalogIdSchema.parse("catalog-service-001");

const recordingResolver = (
  urls = new Map(),
): {
  readonly calls: StorageMediaLocator[][];
  readonly resolver: StorageUrlResolver;
} => {
  const calls: StorageMediaLocator[][] = [];
  return {
    calls,
    resolver: {
      async resolveMany(locators) {
        calls.push([...locators]);
        return urls;
      },
    },
  };
};

describe("CatalogReadService", () => {
  it("passes the normalized query and never calls the resolver for zero Media", async () => {
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
    const { calls, resolver } = recordingResolver();
    const service = new CatalogReadService(port, resolver);
    const query: CatalogListQuery = {
      kind: "inscription",
      page: 1,
      pageSize: 10,
    };

    const page = await service.list(query);

    expect(received).toEqual([query]);
    expect(calls).toEqual([]);
    expect(page.items).toEqual([
      {
        id: catalogId,
        kind: "calligraphy",
        title: "Port projection is authoritative",
        aliases: [],
      },
    ]);
  });

  it("maps Media-less detail projections without resolver calls", async () => {
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
              media: [],
            }
          : null;
      },
    };
    const { calls, resolver } = recordingResolver();
    const service = new CatalogReadService(port, resolver);

    await expect(service.getById(catalogId)).resolves.toEqual({
      id: catalogId,
      kind: "inscription",
      title: "Mapped detail",
      aliases: [],
      sourceCitations: [],
      media: [],
    });
    await expect(
      service.getById(catalogIdSchema.parse("catalog-service-missing")),
    ).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it("resolves representative list Media once in one batch", async () => {
    const firstMedia = {
      id: mediaIdSchema.parse("media-service-first"),
      position: 4,
      isRepresentative: true,
      kind: "image" as const,
      alt: "第一张代表图",
      width: 800,
      height: 600,
      objectKey: "private/first.jpg",
    };
    const secondMedia = {
      ...firstMedia,
      id: mediaIdSchema.parse("media-service-second"),
      alt: "第二张代表图",
      objectKey: "private/second.jpg",
    };
    const port: CatalogQueryPort = {
      async list({ page, pageSize }) {
        return {
          items: [
            {
              id: catalogId,
              kind: "inscription",
              title: "First",
              aliases: [],
              representativeMedia: firstMedia,
            },
            {
              id: catalogIdSchema.parse("catalog-service-002"),
              kind: "calligraphy",
              title: "Second",
              aliases: [],
              representativeMedia: secondMedia,
            },
          ],
          total: 2,
          page,
          pageSize,
          totalPages: 1,
        };
      },
      async getById() {
        return null;
      },
    };
    const { calls, resolver } = recordingResolver(
      new Map([
        [firstMedia.id, "https://media.example.invalid/first.jpg"],
        [secondMedia.id, "https://media.example.invalid/second.jpg"],
      ]),
    );

    const page = await new CatalogReadService(port, resolver).list({
      page: 1,
      pageSize: 20,
    });

    expect(calls).toEqual([
      [
        { mediaId: firstMedia.id, objectKey: firstMedia.objectKey },
        { mediaId: secondMedia.id, objectKey: secondMedia.objectKey },
      ],
    ]);
    expect(
      page.items.map(({ representativeMedia }) => representativeMedia?.src),
    ).toEqual([
      "https://media.example.invalid/first.jpg",
      "https://media.example.invalid/second.jpg",
    ]);
  });

  it("classifies resolver exceptions and missing or invalid results", async () => {
    const media = {
      id: mediaIdSchema.parse("media-service-failure"),
      position: 0,
      isRepresentative: true,
      kind: "image" as const,
      alt: "解析失败测试图",
      width: 800,
      height: 600,
      objectKey: "private/failure.jpg",
    };
    const port: CatalogQueryPort = {
      async list({ page, pageSize }) {
        return {
          items: [
            {
              id: catalogId,
              kind: "inscription",
              title: "Resolver failure",
              aliases: [],
              representativeMedia: media,
            },
          ],
          total: 1,
          page,
          pageSize,
          totalPages: 1,
        };
      },
      async getById() {
        return null;
      },
    };

    for (const resolver of [
      {
        async resolveMany() {
          throw new Error("private storage failure");
        },
      },
      {
        async resolveMany() {
          return new Map();
        },
      },
      {
        async resolveMany() {
          return new Map([[media.id, "not-a-url"]]);
        },
      },
    ] satisfies StorageUrlResolver[]) {
      await expect(
        new CatalogReadService(port, resolver).list({
          page: 1,
          pageSize: 20,
        }),
      ).rejects.toBeInstanceOf(CatalogMediaResolutionError);
    }
  });
});
