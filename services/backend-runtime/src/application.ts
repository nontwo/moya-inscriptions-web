import {
  createDevelopmentCatalogFixtureQueryPort,
  developmentMediaUrlsByObjectKey,
} from "./catalog/development-catalog-fixture.js";
import { createRouter } from "./http/router.js";

import { CatalogReadService } from "@moya/api";
import { MappedStorageUrlResolver } from "@moya/image";

import type { CatalogQueryPort, StorageUrlResolver } from "@moya/api";
import type { NodeEnvironment } from "./config.js";
import type { HealthReadinessCheck } from "./health/health-handler.js";
import type { RequestListener } from "node:http";

export interface BackendApplicationOptions {
  readonly nodeEnv: NodeEnvironment;
  readonly catalogQueryPort?: CatalogQueryPort;
  readonly storageUrlResolver?: StorageUrlResolver;
  readonly healthReadinessCheck?: HealthReadinessCheck;
}

const resolveCatalogQueryPort = ({
  nodeEnv,
  catalogQueryPort,
}: BackendApplicationOptions): CatalogQueryPort => {
  if (catalogQueryPort !== undefined) return catalogQueryPort;
  if (nodeEnv !== "production") {
    return createDevelopmentCatalogFixtureQueryPort();
  }

  throw new Error(
    "A CatalogQueryPort must be explicitly provided in production",
  );
};

const resolveStorageUrlResolver = ({
  nodeEnv,
  storageUrlResolver,
}: BackendApplicationOptions): StorageUrlResolver => {
  if (storageUrlResolver !== undefined) return storageUrlResolver;
  if (nodeEnv !== "production") {
    return new MappedStorageUrlResolver(developmentMediaUrlsByObjectKey);
  }

  throw new Error(
    "A StorageUrlResolver must be explicitly provided in production",
  );
};

/** Composes the HTTP listener before any TCP listener is created. */
export const createBackendApplication = (
  options: BackendApplicationOptions,
): RequestListener => {
  const catalogQueryPort = resolveCatalogQueryPort(options);
  const storageUrlResolver = resolveStorageUrlResolver(options);
  return createRouter({
    catalogReadService: new CatalogReadService(
      catalogQueryPort,
      storageUrlResolver,
    ),
    healthReadinessCheck:
      options.healthReadinessCheck ?? (async (): Promise<void> => undefined),
  });
};
