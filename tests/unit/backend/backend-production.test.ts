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
});
