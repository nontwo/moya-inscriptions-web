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
import type { RequestListener } from "node:http";

export interface PreparedProductionBackend {
  readonly closeResources: () => Promise<void>;
  readonly readinessCheck: () => Promise<void>;
  readonly requestListener: RequestListener;
  readonly runtimeConfig: RuntimeConfig;
}

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
  const loopback = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);
  let sameDatabaseUser: boolean;
  try {
    sameDatabaseUser =
      decodeURIComponent(backendUrl.username) ===
      decodeURIComponent(cmsUrl.username);
  } catch {
    throw new Error("Local database users are invalid");
  }
  if (
    !loopback.has(host) ||
    !loopback.has(backendUrl.hostname) ||
    !loopback.has(cmsUrl.hostname) ||
    backendUrl.hostname !== cmsUrl.hostname ||
    (backendUrl.port || "5432") !== (cmsUrl.port || "5432") ||
    backendUrl.pathname !== "/yoyi_dev" ||
    cmsUrl.pathname !== backendUrl.pathname ||
    sameDatabaseUser ||
    [backendUrl, cmsUrl].some(
      (url) =>
        url.hash ||
        [...url.searchParams].some(
          ([key, value]) => key !== "sslmode" || value !== "disable",
        ),
    )
  )
    throw new Error(
      "Local Backend and Admin must use the same loopback yoyi_dev database with different users",
    );
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
  const pool = pilot
    ? openPilotPool(environment, pilot.scope)
    : createPostgresPool(postgresConfig, {
        onUnexpectedIdleError: () => {
          console.error(
            "[backend-production] unexpected PostgreSQL pool error",
          );
        },
      });

  try {
    await assertPostgresStartupReady(pool, contentSource);
  } catch (error) {
    await closePostgresPool(pool);
    throw error;
  }

  const catalogQueryPort = new PostgresCatalogQueryAdapter(pool);
  const readinessCheck = async (): Promise<void> =>
    checkPostgresReadiness(pool);
  return {
    runtimeConfig,
    readinessCheck,
    requestListener: createBackendApplication({
      nodeEnv: runtimeConfig.nodeEnv,
      catalogQueryPort,
      catalogSearchQueryPort: catalogQueryPort,
      storageUrlResolver,
      healthReadinessCheck: readinessCheck,
    }),
    closeResources: async () => closePostgresPool(pool),
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
