import {
  platformCatalogIdAllocator,
  prepareProductionBackend,
} from "@moya/backend-production";
import { describe, expect, it } from "vitest";

const productionEnvironment = {
  HOST: "127.0.0.1",
  NODE_ENV: "production",
  PORT: "3001",
} as const;

describe("production backend composition", () => {
  it("allocates platform-owned CatalogIds without SourceId input", () => {
    const first = platformCatalogIdAllocator.allocateCatalogId();
    const second = platformCatalogIdAllocator.allocateCatalogId();

    expect(first).toMatch(
      /^catalog-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(second).not.toBe(first);
  });

  it("requires production mode before database initialization", async () => {
    await expect(
      prepareProductionBackend({
        ...productionEnvironment,
        NODE_ENV: "test",
      }),
    ).rejects.toThrow("NODE_ENV must be production");
  });

  it("fails safely when DATABASE_URL is missing or invalid", async () => {
    await expect(
      prepareProductionBackend(productionEnvironment),
    ).rejects.toThrow("DATABASE_URL is required");
    await expect(
      prepareProductionBackend({
        ...productionEnvironment,
        DATABASE_URL: "postgresql://secret@private-host",
      }),
    ).rejects.toThrow("DATABASE_URL must be a valid PostgreSQL URL");
  });

  it("requires the separate Community App role before opening any pool", async () => {
    const withCatalog = {
      ...productionEnvironment,
      DATABASE_URL:
        "postgresql://public_reader:synthetic@db.example.invalid:5432/yoyi?sslmode=verify-full",
    };
    await expect(prepareProductionBackend(withCatalog)).rejects.toThrow(
      "APP_DATABASE_URL is required",
    );
    await expect(
      prepareProductionBackend({
        ...withCatalog,
        APP_DATABASE_URL: "postgresql://secret@private-host",
      }),
    ).rejects.toThrow("APP_DATABASE_URL must be a valid PostgreSQL URL");
  });

  it("requires distinct local Backend, Admin and App roles on the loopback yoyi_dev database", async () => {
    const development = {
      HOST: "127.0.0.1",
      NODE_ENV: "development",
      PORT: "3001",
      MOYA_CONTENT_SOURCE: "payload",
      DATABASE_URL: "postgresql://public_role@127.0.0.1:54330/yoyi_dev",
      CMS_DATABASE_URL: "postgresql://cms_role@127.0.0.1:54330/yoyi_dev",
    } as const;
    for (const APP_DATABASE_URL of [
      "postgresql://public_role@127.0.0.1:54330/yoyi_dev",
      "postgresql://app_role@127.0.0.1:54330/other_db",
      "postgresql://app_role@db.example.invalid:5432/yoyi_dev",
      "postgresql://app_role@127.0.0.1:54331/yoyi_dev",
    ])
      await expect(
        prepareProductionBackend({ ...development, APP_DATABASE_URL }),
      ).rejects.toThrow("same loopback yoyi_dev database with different users");
  });
});
