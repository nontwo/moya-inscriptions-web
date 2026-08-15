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
import { UnconfiguredStorageUrlResolver } from "@moya/image";

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

export const prepareProductionBackend = async (
  environment: RuntimeEnvironment,
): Promise<PreparedProductionBackend> => {
  const runtimeConfig = parseRuntimeConfig(environment);
  if (runtimeConfig.nodeEnv !== "production") {
    throw new Error("NODE_ENV must be production for the production backend");
  }
  const postgresConfig = parsePostgresConfig(environment);
  const pool = createPostgresPool(postgresConfig, {
    onUnexpectedIdleError: () => {
      console.error("[backend-production] unexpected PostgreSQL pool error");
    },
  });

  try {
    await assertPostgresStartupReady(pool);
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
      storageUrlResolver: new UnconfiguredStorageUrlResolver(),
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
