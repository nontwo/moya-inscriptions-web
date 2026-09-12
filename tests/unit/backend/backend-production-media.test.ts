import { prepareProductionBackend } from "@moya/backend-production";
import { ProductionCosStorageUrlResolver } from "@moya/backend-production/internal/production-cos";
import { startBackendProcess } from "@moya/backend-runtime";
import { createPostgresPool } from "@moya/catalog-postgres";
import {
  catalogDetailSchema,
  catalogPageSchema,
} from "@moya/contracts/schemas";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { BackendProcessHandle } from "@moya/backend-runtime";

const database = vi.hoisted(() => ({
  published: true,
  mediaKey: `editorial/${"a".repeat(64)}/${"b".repeat(64)}-${"c".repeat(64)}.webp`,
  end: vi.fn(async () => {}),
}));

// The actual public application, mapper and official SDK signer run together.
// Only PostgreSQL I/O is replaced with a published-projection fixture.
vi.mock("@moya/catalog-postgres", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@moya/catalog-postgres")>();
  const projection = () => {
    const media = {
      id: "media-unit-published",
      position: 0,
      isRepresentative: true,
      kind: "image",
      alt: "Synthetic public media",
      width: 1200,
      height: 800,
      objectKey: database.mediaKey,
    };
    return {
      id: "catalog-unit-published",
      kind: "inscription",
      title: "Synthetic published projection",
      aliases: [],
      sourceCitations: [],
      representativeMedia: media,
      media: [media],
    };
  };
  return {
    ...actual,
    createPostgresPool: vi.fn(() => ({ end: database.end })),
    assertPostgresStartupReady: vi.fn(async () => {}),
    PostgresCatalogQueryAdapter: class {
      async getById(id: string) {
        return database.published && id === "catalog-unit-published"
          ? projection()
          : null;
      }
      async list({ page, pageSize }: { page: number; pageSize: number }) {
        return {
          items: database.published ? [projection()] : [],
          total: database.published ? 1 : 0,
          totalPages: database.published ? 1 : 0,
          page,
          pageSize,
        };
      }
    },
  };
});

// The community ledger check is read-only PostgreSQL I/O as well; the App-role
// adapter is unused by these media compositions.
vi.mock("@moya/community-postgres", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@moya/community-postgres")>();
  return {
    ...actual,
    verifyCommunityMigrationLedger: vi.fn(async () => {}),
  };
});

const environment = {
  HOST: "127.0.0.1",
  NODE_ENV: "production",
  PORT: "3001",
  MOYA_CONTENT_SOURCE: "payload",
  DATABASE_URL:
    "postgresql://synthetic-runtime@127.0.0.1:1/synthetic_published",
  APP_DATABASE_URL:
    "postgresql://synthetic-community@127.0.0.1:1/synthetic_published",
  COS_BUCKET: "synthetic-example-1250000000",
  COS_REGION: "ap-guangzhou",
  COS_MEDIA_ORIGIN: "https://media.example.invalid",
  COS_SECRET_ID: "synthetic-unit-id",
  COS_SECRET_KEY: "synthetic-unit-secret",
} as const;
const handles = new Set<BackendProcessHandle>();
const start = async () => {
  const prepared = await prepareProductionBackend(environment);
  const handle = await startBackendProcess({
    closeResources: prepared.closeResources,
    listen: { host: "127.0.0.1", port: 0 },
    requestListener: prepared.requestListener,
  });
  handles.add(handle);
  return `http://${handle.address.address}:${handle.address.port}`;
};

afterEach(async () => {
  for (const handle of handles) await handle.shutdown();
  handles.clear();
  database.published = true;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("non-Pilot production public media composition", () => {
  it.each([
    "COS_BUCKET",
    "COS_REGION",
    "COS_MEDIA_ORIGIN",
    "COS_SECRET_ID",
    "COS_SECRET_KEY",
  ])("fails closed without %s before database initialization", async (key) => {
    await expect(
      prepareProductionBackend({ ...environment, [key]: undefined }),
    ).rejects.toThrow(
      `Production COS configuration missing or invalid: ${key}`,
    );
    expect(createPostgresPool).not.toHaveBeenCalled();
  });

  it("returns signed src through the unchanged public DTO and rejects arbitrary key input", async () => {
    const base = await start();
    const resolver = vi.spyOn(
      ProductionCosStorageUrlResolver.prototype,
      "resolveMany",
    );
    const arbitraryKeyResponse = await fetch(
      `${base}/v1/catalog/catalog-unit-published?objectKey=arbitrary-private-object&bucket=other-bucket`,
    );
    expect(arbitraryKeyResponse.status).toBe(400);
    expect(resolver).not.toHaveBeenCalled();
    const detailResponse = await fetch(
      `${base}/v1/catalog/catalog-unit-published`,
    );
    expect(detailResponse.status).toBe(200);
    const detail = catalogDetailSchema.parse(await detailResponse.json());
    const listResponse = await fetch(`${base}/v1/catalog`);
    expect(listResponse.status).toBe(200);
    const list = catalogPageSchema.parse(await listResponse.json());
    for (const media of [
      detail.media[0]!,
      detail.representativeMedia!,
      list.items[0]!.representativeMedia!,
    ]) {
      expect(Object.keys(media).sort()).toEqual([
        "alt",
        "height",
        "id",
        "kind",
        "src",
        "width",
      ]);
      const url = new URL(media.src);
      expect(url.origin).toBe(environment.COS_MEDIA_ORIGIN);
      expect(decodeURIComponent(url.pathname.slice(1))).toBe(database.mediaKey);
      expect(url.searchParams.has("q-signature")).toBe(true);
      expect(media.src).not.toContain(environment.COS_BUCKET);
      expect(media.src).not.toContain(environment.COS_REGION);
      expect(media.src).not.toContain(environment.COS_SECRET_KEY);
    }
    expect(
      await fetch(`${base}/media/arbitrary-token`).then(
        (response) => response.status,
      ),
    ).toBe(404);
  });

  it("does not resolve missing or withdrawn published projections", async () => {
    const resolver = vi.spyOn(
      ProductionCosStorageUrlResolver.prototype,
      "resolveMany",
    );
    const base = await start();
    expect(
      await fetch(`${base}/v1/catalog/catalog-unit-draft`).then(
        (response) => response.status,
      ),
    ).toBe(404);
    expect(resolver).not.toHaveBeenCalled();
    expect(
      await fetch(`${base}/v1/catalog/catalog-unit-published`).then(
        (response) => response.status,
      ),
    ).toBe(200);
    expect(resolver).toHaveBeenCalledTimes(1);
    database.published = false;
    expect(
      await fetch(`${base}/v1/catalog/catalog-unit-published`).then(
        (response) => response.status,
      ),
    ).toBe(404);
    const list = catalogPageSchema.parse(
      await fetch(`${base}/v1/catalog`).then((response) => response.json()),
    );
    expect(list.items).toEqual([]);
    expect(resolver).toHaveBeenCalledTimes(1);
  });
});

describe("local development database boundary", () => {
  const local = {
    NODE_ENV: "development",
    HOST: "127.0.0.1",
    MOYA_CONTENT_SOURCE: "payload",
    DATABASE_URL: "postgresql://synthetic-public@127.0.0.1:54330/yoyi_dev",
    CMS_DATABASE_URL: "postgresql://synthetic-payload@127.0.0.1:54330/yoyi_dev",
    APP_DATABASE_URL: "postgresql://synthetic-app@127.0.0.1:54330/yoyi_dev",
    CMS_ENVIRONMENT: "synthetic",
    CMS_STORAGE_MODE: "local",
    PUBLIC_MEDIA_BASE_URL: "http://127.0.0.1:3002",
  };

  it("uses the same loopback development database with separate runtime roles and no COS credentials", async () => {
    const prepared = await prepareProductionBackend(local);
    expect(createPostgresPool).toHaveBeenCalledWith(
      expect.objectContaining({ max: 5, connectionString: local.DATABASE_URL }),
      expect.any(Object),
    );
    await prepared.closeResources();
  });

  it("allows the explicit local sslmode=disable used by development migration", async () => {
    const prepared = await prepareProductionBackend({
      ...local,
      DATABASE_URL: `${local.DATABASE_URL}?sslmode=disable`,
      CMS_DATABASE_URL: `${local.CMS_DATABASE_URL}?sslmode=disable`,
    });
    expect(createPostgresPool).toHaveBeenCalledWith(
      expect.objectContaining({
        connectionString: local.DATABASE_URL,
        ssl: false,
      }),
      expect.any(Object),
    );
    await prepared.closeResources();
  });

  it.each(["DATABASE_URL", "CMS_DATABASE_URL"] as const)(
    "rejects query overrides on %s before opening a pool",
    async (key) => {
      for (const query of [
        "host=database.example.invalid",
        "port=55439",
        "user=synthetic-payload",
        "database=synthetic_stage_a",
        "sslmode=require",
        "sslmode=disable&host=database.example.invalid",
      ]) {
        await expect(
          prepareProductionBackend({
            ...local,
            [key]: `${local[key]}?${query}`,
          }),
        ).rejects.toThrow(/^Local /);
      }
      expect(createPostgresPool).not.toHaveBeenCalled();
    },
  );

  it.each(["synthetic-public", "synthetic%2Dpublic"])(
    "rejects the same decoded runtime user before opening a pool",
    async (username) => {
      await expect(
        prepareProductionBackend({
          ...local,
          CMS_DATABASE_URL: `postgresql://${username}@127.0.0.1:54330/yoyi_dev`,
        }),
      ).rejects.toThrow(/^Local /);
      expect(createPostgresPool).not.toHaveBeenCalled();
    },
  );

  it.each([
    { HOST: "0.0.0.0" },
    {
      DATABASE_URL:
        "postgresql://synthetic-public@database.example.invalid:54330/yoyi_dev",
    },
    {
      CMS_DATABASE_URL:
        "postgresql://synthetic-payload@127.0.0.1:54331/yoyi_dev",
    },
    {
      CMS_DATABASE_URL:
        "postgresql://synthetic-payload@127.0.0.1:54330/stage_a",
    },
    {
      CMS_DATABASE_URL:
        "postgresql://synthetic-payload@127.0.0.1:54330/yoyi_dev?options=-csearch_path%3Dother",
    },
    { MOYA_CONTENT_SOURCE: "legacy" },
    { MOYA_PILOT_SCOPE_FILE: "unused-synthetic-path" },
  ])(
    "rejects mixed or nonlocal development configuration before opening a pool",
    async (invalid) => {
      await expect(
        prepareProductionBackend({ ...local, ...invalid }),
      ).rejects.toThrow(/^Local /);
      expect(createPostgresPool).not.toHaveBeenCalled();
    },
  );
});
