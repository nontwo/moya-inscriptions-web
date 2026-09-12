import {
  createBackendApplication,
  parseRuntimeConfig,
  startBackendProcess,
} from "@moya/backend-runtime";
import {
  assertPostgresStartupReady,
  checkPostgresReadiness,
  closePostgresPool,
  createPostgresPool,
  parsePostgresConfig,
  PostgresCatalogQueryAdapter,
} from "@moya/catalog-postgres";
import {
  PostgresCommunityIdentityAdapter,
  verifyCommunityMigrationLedger,
} from "@moya/community-postgres";
import { loadPilotConfiguration, openPilotPool } from "./pilot-config.js";
import { createLocalStorageUrlResolver } from "./storage/local-media.js";
import {
  ProductionCosStorageUrlResolver,
  productionCosOptions,
} from "./storage/production-cos.js";

import type {
  BackendProcessHandle,
  RuntimeConfig,
  RuntimeEnvironment,
} from "@moya/backend-runtime";
import type { PostgresConfig } from "@moya/catalog-postgres";
import type { RequestListener } from "node:http";

export interface PreparedProductionBackend {
  readonly closeResources: () => Promise<void>;
  readonly readinessCheck: () => Promise<void>;
  readonly requestListener: RequestListener;
  readonly runtimeConfig: RuntimeConfig;
}

const loopback = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

const isLocalYoyiDevUrl = (url: URL): boolean =>
  loopback.has(url.hostname) &&
  url.pathname === "/yoyi_dev" &&
  !url.hash &&
  [...url.searchParams].every(
    ([key, value]) => key === "sslmode" && value === "disable",
  );

const databaseUser = (url: URL): string => {
  try {
    return decodeURIComponent(url.username);
  } catch {
    throw new Error("Local database users are invalid");
  }
};

const assertLocalDevelopmentDatabase = (
  environment: RuntimeEnvironment,
  host: string,
): void => {
  parsePostgresConfig({
    DATABASE_URL: environment.CMS_DATABASE_URL,
    DATABASE_SSL_CA_FILE: environment.CMS_DATABASE_SSL_CA_FILE,
  });
  const backendUrl = new URL(environment.DATABASE_URL!);
  // Inspect the original URLs: the generic parser removes validated sslmode.
  // pg-connection-string permits query fields to override host, port and user.
  const cmsUrl = new URL(environment.CMS_DATABASE_URL!);
  const appUrl = new URL(environment.APP_DATABASE_URL!);
  const users = [backendUrl, cmsUrl, appUrl].map(databaseUser);
  if (
    !loopback.has(host) ||
    ![backendUrl, cmsUrl, appUrl].every(isLocalYoyiDevUrl) ||
    backendUrl.hostname !== cmsUrl.hostname ||
    backendUrl.hostname !== appUrl.hostname ||
    (backendUrl.port || "5432") !== (cmsUrl.port || "5432") ||
    (backendUrl.port || "5432") !== (appUrl.port || "5432") ||
    new Set(users).size !== users.length
  )
    throw new Error(
      "Local Backend, Admin and App roles must use the same loopback yoyi_dev database with different users",
    );
};

/** The Community App role is read at runtime only here and is DML-only. */
const parseCommunityPostgresConfig = (
  environment: RuntimeEnvironment,
): PostgresConfig => {
  const url = environment.APP_DATABASE_URL;
  if (url === undefined || url === "")
    throw new Error("APP_DATABASE_URL is required");
  try {
    return parsePostgresConfig({
      DATABASE_URL: url,
      DATABASE_SSL_CA_FILE: environment.APP_DATABASE_SSL_CA_FILE,
      DATABASE_POOL_MAX: environment.DATABASE_POOL_MAX,
      DATABASE_IDLE_TIMEOUT_MS: environment.DATABASE_IDLE_TIMEOUT_MS,
    });
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message.replace(/\bDATABASE_URL\b/g, "APP_DATABASE_URL")
        : "APP_DATABASE_URL is invalid",
      { cause: error },
    );
  }
};

export const prepareProductionBackend = async (
  environment: RuntimeEnvironment,
): Promise<PreparedProductionBackend> => {
  const runtimeConfig = parseRuntimeConfig(environment);
  if (
    runtimeConfig.nodeEnv !== "production" &&
    runtimeConfig.nodeEnv !== "development"
  ) {
    throw new Error(
      "NODE_ENV must be production or development for this backend",
    );
  }
  const contentSource = environment.MOYA_CONTENT_SOURCE ?? "legacy";
  if (contentSource !== "legacy" && contentSource !== "payload")
    throw new Error("MOYA_CONTENT_SOURCE must be legacy or payload");
  const hasPilotConfiguration =
    environment.MOYA_PILOT_SCOPE_FILE !== undefined ||
    environment.MOYA_PILOT_MEDIA_FILE !== undefined;
  if (
    runtimeConfig.nodeEnv === "development" &&
    (contentSource !== "payload" || hasPilotConfiguration)
  )
    throw new Error(
      "Local development requires Payload without Pilot configuration",
    );
  const postgresConfig = parsePostgresConfig(environment);
  const communityPostgresConfig = parseCommunityPostgresConfig(environment);
  if (runtimeConfig.nodeEnv === "development")
    assertLocalDevelopmentDatabase(environment, runtimeConfig.host);
  const pilot = hasPilotConfiguration
    ? await loadPilotConfiguration(environment)
    : undefined;
  // Resolver configuration fails before opening the database pool. Only
  // published database projections can supply keys to the public read service.
  const storageUrlResolver = pilot
    ? pilot.storage.createStorageUrlResolver()
    : runtimeConfig.nodeEnv === "development"
      ? createLocalStorageUrlResolver(environment)
      : new ProductionCosStorageUrlResolver(productionCosOptions(environment));
  const onUnexpectedIdleError = () => {
    console.error("[backend-production] unexpected PostgreSQL pool error");
  };
  const pool = pilot
    ? openPilotPool(environment, pilot.scope)
    : createPostgresPool(postgresConfig, { onUnexpectedIdleError });

  try {
    await assertPostgresStartupReady(pool, contentSource);
  } catch (error) {
    await closePostgresPool(pool);
    throw error;
  }

  // The community namespace is reached only through the separate App role;
  // startup verifies its migration ledger read-only and never runs DDL.
  const communityPool = createPostgresPool(communityPostgresConfig, {
    onUnexpectedIdleError,
  });
  const closeResources = async (): Promise<void> => {
    await Promise.all([
      closePostgresPool(pool),
      closePostgresPool(communityPool),
    ]);
  };
  try {
    await verifyCommunityMigrationLedger(communityPool);
  } catch (error) {
    await closeResources();
    throw error;
  }

  const catalogQueryPort = new PostgresCatalogQueryAdapter(pool);
  const communityIdentityPort = new PostgresCommunityIdentityAdapter(
    communityPool,
  );
  const readinessCheck = async (): Promise<void> => {
    await checkPostgresReadiness(pool);
    await checkPostgresReadiness(communityPool);
  };
  return {
    runtimeConfig,
    readinessCheck,
    requestListener: createBackendApplication({
      nodeEnv: runtimeConfig.nodeEnv,
      catalogQueryPort,
      catalogSearchQueryPort: catalogQueryPort,
      storageUrlResolver,
      healthReadinessCheck: readinessCheck,
      communityIdentityPort,
    }),
    closeResources,
  };
};

export const startProductionBackend = async (
  environment: RuntimeEnvironment,
): Promise<BackendProcessHandle> => {
  const prepared = await prepareProductionBackend(environment);
  return startBackendProcess({
    closeResources: prepared.closeResources,
    listen: prepared.runtimeConfig,
    requestListener: prepared.requestListener,
  });
};
