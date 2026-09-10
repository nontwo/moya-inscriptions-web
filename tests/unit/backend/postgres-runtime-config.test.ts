import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rootCertificates } from "node:tls";
import {
  closePostgresPool,
  createPostgresPool,
  parsePostgresConfig,
} from "@moya/catalog-postgres";
import {
  cmsDatabasePool,
  assertCmsProductionEnvironment,
} from "admin/runtime-settings";
import { afterEach, describe, expect, it, vi } from "vitest";

const database =
  "postgresql://synthetic_runtime@127.0.0.1:5432/synthetic_database";
afterEach(() => vi.unstubAllEnvs());

describe("runtime PostgreSQL pool and verified TLS", () => {
  it("gives the actual public pool a maximum of five and a bounded idle timeout", async () => {
    const pool = createPostgresPool(
      parsePostgresConfig({ DATABASE_URL: database }),
    );
    try {
      expect(pool.options.max).toBe(5);
      expect(pool.options.idleTimeoutMillis).toBe(10_000);
      expect(pool.options.connectionTimeoutMillis).toBe(5_000);
      expect(pool.options.ssl).toBe(false);
      expect(pool.totalCount).toBe(0);
    } finally {
      await closePostgresPool(pool);
    }
  });

  it("honors explicit pool settings but keeps Payload's existing maximum of five", () => {
    expect(
      parsePostgresConfig({
        DATABASE_URL: database,
        DATABASE_POOL_MAX: "7",
        DATABASE_IDLE_TIMEOUT_MS: "23000",
      }),
    ).toMatchObject({ max: 7, idleTimeoutMillis: 23000 });
    vi.stubEnv("CMS_DATABASE_URL", database);
    vi.stubEnv("DATABASE_POOL_MAX", "7");
    vi.stubEnv("DATABASE_IDLE_TIMEOUT_MS", "23000");
    expect(cmsDatabasePool()).toMatchObject({
      max: 5,
      idleTimeoutMillis: 23000,
    });
  });

  it.each(["", "0", "-1", "1.1", "Infinity", "9007199254740992"])(
    "rejects invalid pool settings: %s",
    (value) => {
      for (const name of ["DATABASE_POOL_MAX", "DATABASE_IDLE_TIMEOUT_MS"])
        expect(() =>
          parsePostgresConfig({ DATABASE_URL: database, [name]: value }),
        ).toThrow("positive safe integer");
    },
  );

  it.each(["require", "verify-ca", "verify-full"])(
    "verifies system CA and hostname for sslmode=%s",
    (mode) => {
      const config = parsePostgresConfig({
        DATABASE_URL: `${database}?sslmode=${mode}`,
      });
      expect(config.ssl).toEqual({ rejectUnauthorized: true });
      expect(config.connectionString).toBe(database);
      const pool = createPostgresPool(config);
      expect(pool.options.ssl).toEqual({ rejectUnauthorized: true });
      void pool.end();
    },
  );

  it.each([
    "sslmode=no-verify",
    "sslmode=prefer",
    "sslmode=require&sslmode=disable",
    "sslmode=verify-full&uselibpqcompat=true",
    "ssl=true",
    "sslrootcert=synthetic-path",
  ])(
    "rejects TLS parser bypasses without opening a connection: %s",
    (query) => {
      expect(() =>
        parsePostgresConfig({ DATABASE_URL: `${database}?${query}` }),
      ).toThrow(/TLS/);
    },
  );

  it("loads an explicit CA for both runtime roles and rejects missing CA files", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "moya-ca-test-"));
    const caFile = path.join(directory, "public-test-ca.pem");
    try {
      const ca = rootCertificates[0]!;
      await writeFile(caFile, ca);
      expect(
        parsePostgresConfig({
          DATABASE_URL: `${database}?sslmode=require`,
          DATABASE_SSL_CA_FILE: caFile,
        }).ssl,
      ).toEqual({ rejectUnauthorized: true, ca });
      vi.stubEnv("CMS_DATABASE_URL", `${database}?sslmode=verify-full`);
      vi.stubEnv("CMS_DATABASE_SSL_CA_FILE", caFile);
      expect(cmsDatabasePool().ssl).toEqual({ rejectUnauthorized: true, ca });
      expect(() =>
        parsePostgresConfig({
          DATABASE_URL: `${database}?sslmode=disable`,
          DATABASE_SSL_CA_FILE: caFile,
        }),
      ).toThrow("conflicts");
      await writeFile(caFile, "synthetic invalid CA");
      expect(() => cmsDatabasePool()).toThrow(
        "Invalid CMS database configuration",
      );
      expect(() =>
        parsePostgresConfig({
          DATABASE_URL: database,
          DATABASE_SSL_CA_FILE: path.join(directory, "absent"),
        }),
      ).toThrow("Invalid PostgreSQL TLS CA file");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("blocks query host overrides in synthetic CMS runs", () => {
    vi.stubEnv("CMS_ENVIRONMENT", "synthetic");
    vi.stubEnv("CMS_DATABASE_URL", `${database}?host=synthetic.invalid`);
    expect(() => cmsDatabasePool()).toThrow("loopback database");
  });
});

describe("production CMS configuration", () => {
  const environment = {
    NODE_ENV: "production",
    MOYA_CONTENT_SOURCE: "payload",
    CMS_STORAGE_MODE: "cos",
    CMS_SECRET: "SYNTHETIC_TEST_ONLY_NOT_A_CREDENTIAL",
    CMS_DATABASE_URL: database,
    CMS_MEDIA_DIR: "/synthetic/media",
    CMS_PUBLIC_URL: "https://synthetic.example.invalid",
    CMS_PREVIEW_WEB_URL: "https://synthetic.example.invalid",
  };
  it("rejects missing production settings and insecure URLs before initialization", () => {
    expect(() => assertCmsProductionEnvironment(environment)).not.toThrow();
    for (const key of [
      "CMS_SECRET",
      "CMS_DATABASE_URL",
      "CMS_PUBLIC_URL",
      "CMS_PREVIEW_WEB_URL",
      "CMS_STORAGE_MODE",
      "MOYA_CONTENT_SOURCE",
    ])
      expect(() =>
        assertCmsProductionEnvironment({ ...environment, [key]: "" }),
      ).toThrow();
    expect(() =>
      assertCmsProductionEnvironment({
        ...environment,
        CMS_PUBLIC_URL: "http://synthetic.example.invalid",
      }),
    ).toThrow();
  });
  it("keeps compilation and synthetic verification independent of cloud credentials", () => {
    expect(() =>
      assertCmsProductionEnvironment({
        NODE_ENV: "production",
        CMS_ENVIRONMENT: "synthetic",
      }),
    ).not.toThrow();
    expect(() =>
      assertCmsProductionEnvironment({ NODE_ENV: "development" }),
    ).not.toThrow();
  });
});
