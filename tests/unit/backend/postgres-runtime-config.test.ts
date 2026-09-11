import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { rootCertificates, type PeerCertificate } from "node:tls";
import { X509Certificate } from "node:crypto";
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
// Public synthetic certificate only; these tests inspect IP SANs, not validity dates.
const ipCertificate = new X509Certificate(`-----BEGIN CERTIFICATE-----
MIIC8jCCAdqgAwIBAgIJAKIDDuq4Uxy3MA0GCSqGSIb3DQEBCwUAMCUxIzAhBgNV
BAMMGnN5bnRoZXRpYy1wb3N0Z3Jlcy1pcC10ZXN0MB4XDTI2MDkxMTA4MDg1N1oX
DTI2MDkxMjA4MDg1N1owJTEjMCEGA1UEAwwac3ludGhldGljLXBvc3RncmVzLWlw
LXRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDQuXleY5S489Js
UkqvykFgc8Xd9Emx3typyNq98fhh+sNaYSb73r2bxG6x49MW1g/MyFa0UiqqvSuA
alCGc/IzZa1zKxt7A6OaupA+w4SejGh/HzCGRECXOfiL9VEpGnRkCoOli5+2zxOR
hUg86YdbTYJUuXu03T2U7kxN8tz2sFdEDQHKERclgjit3HMUB/VeN3nmPM4ALkbH
K8KQ2BY+a2X+w16E0bSMTvOx58UwTmcsL9q5ZXuf4rdlMsXMLDQONC+DSGGTyQwh
eIjFHn0sV+QyUj7MjMnyOmlurmHNZSKFjvpKKU6em+xR1DKRSft2mTUT5IV81QH2
65VHIMVTAgMBAAGjJTAjMCEGA1UdEQQaMBiHBH8AAAGHEAAAAAAAAAAAAAAAAAAA
AAEwDQYJKoZIhvcNAQELBQADggEBAJW4VYBdZPObCqvnseqMlErMMv/DAeUtEIw1
a0PgYQaHZ1YEeBvy7mcDE0MGxrq/lSZyjaptqxoFBmHBpF6cF7qYSbisq58ZiWqb
KSJca3crNWS5DA+JO5Dve5wLKOCygNGxXygOOmlNhGxz01tHEXzfRU6LA4eAlAe2
jjSTgjLq2jF/vPpTYeT0W1L4+hTOs99wILt23G0/nvK7AshKvy1K33nmDW4ZolGO
zt0Xm/BGG4Dm7wJ9sTxfn7gsBznoZk1nPPN6afrn94kiUdc8qOai8kQOwvbccW5n
oiaJ/7+nzk4m9c4J/hu4Qga6LyBoLtZPHfvP6bRSWjJCRboNwEk=
-----END CERTIFICATE-----`).toLegacyObject();
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
      expect(config.ssl).toMatchObject({
        rejectUnauthorized: true,
        checkServerIdentity: expect.any(Function),
      });
      expect(config.connectionString).toBe(database);
      const pool = createPostgresPool(config);
      expect(pool.options.ssl).toBe(config.ssl);
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
      ).toMatchObject({ rejectUnauthorized: true, ca });
      vi.stubEnv("CMS_DATABASE_URL", `${database}?sslmode=verify-full`);
      vi.stubEnv("CMS_DATABASE_SSL_CA_FILE", caFile);
      expect(cmsDatabasePool().ssl).toMatchObject({
        rejectUnauthorized: true,
        ca,
      });
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

  it.each([
    ["127.0.0.1", "127.0.0.2"],
    ["[::1]", "[::2]"],
  ])(
    "verifies the URL IP SAN when pg supplies a different default name: %s",
    (host, wrong) => {
      const config = parsePostgresConfig({
        DATABASE_URL: `postgresql://synthetic@${host}/synthetic?sslmode=verify-full`,
      });
      if (!config.ssl || !config.ssl.checkServerIdentity)
        throw new Error("EXPECTED_IP_IDENTITY_CHECK");
      expect(config.ssl.rejectUnauthorized).toBe(true);
      expect(
        config.ssl.checkServerIdentity("localhost", ipCertificate),
      ).toBeUndefined();
      const wrongConfig = parsePostgresConfig({
        DATABASE_URL: `postgresql://synthetic@${wrong}/synthetic?sslmode=verify-full`,
      });
      if (!wrongConfig.ssl || !wrongConfig.ssl.checkServerIdentity)
        throw new Error("EXPECTED_IP_IDENTITY_CHECK");
      expect(
        wrongConfig.ssl.checkServerIdentity("localhost", ipCertificate),
      ).toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });
      expect(
        config.ssl.checkServerIdentity("localhost", {
          subjectaltname: "DNS:localhost",
        } as PeerCertificate),
      ).toMatchObject({ code: "ERR_TLS_CERT_ALTNAME_INVALID" });
    },
  );

  it("keeps DNS verification and existing no-TLS local defaults unchanged", () => {
    const config = parsePostgresConfig({
      DATABASE_URL:
        "postgresql://synthetic@database.example.invalid/synthetic?sslmode=verify-full",
    });
    expect(config.ssl).toEqual({ rejectUnauthorized: true });
    expect(parsePostgresConfig({ DATABASE_URL: database }).ssl).toBe(false);
    expect(
      parsePostgresConfig({ DATABASE_URL: `${database}?sslmode=disable` }).ssl,
    ).toBe(false);
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
