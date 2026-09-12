import {
  createDevelopmentCatalogFixtureQueryPort,
  createDevelopmentCatalogFixtureSearchPort,
  developmentMediaUrlsByObjectKey,
} from "./catalog/development-catalog-fixture.js";
import { createRouter } from "./http/router.js";

import { CatalogReadService, CommunitySessionService } from "@moya/api";
import { MappedStorageUrlResolver } from "@moya/image";

import type {
  CatalogQueryPort,
  CatalogSearchQueryPort,
  CommunityIdentityPort,
  StorageUrlResolver,
} from "@moya/api";
import type { NodeEnvironment } from "./config.js";
import type { HealthReadinessCheck } from "./health/health-handler.js";
import type { CommunityRouterDependencies } from "./http/router.js";
import type { RequestListener } from "node:http";

export interface BackendApplicationOptions {
  readonly nodeEnv: NodeEnvironment;
  readonly catalogQueryPort?: CatalogQueryPort;
  readonly catalogSearchQueryPort?: CatalogSearchQueryPort;
  readonly storageUrlResolver?: StorageUrlResolver;
  readonly healthReadinessCheck?: HealthReadinessCheck;
  /** Backend-owned identity and sessions; without it every credential is unauthenticated. */
  readonly communityIdentityPort?: CommunityIdentityPort;
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

// Without an identity port no session can exist and no Development entry is
// composed; the production composition root always wires the App-role adapter.
// The Development sign-in entry itself exists only under NODE_ENV=development.
const resolveCommunity = ({
  nodeEnv,
  communityIdentityPort,
}: BackendApplicationOptions): CommunityRouterDependencies | undefined =>
  communityIdentityPort === undefined
    ? undefined
    : {
        sessionService: new CommunitySessionService(communityIdentityPort),
        developmentEntry: nodeEnv === "development",
      };

/** Composes the HTTP listener before any TCP listener is created. */
export const createBackendApplication = (
  options: BackendApplicationOptions,
): RequestListener => {
  const catalogQueryPort = resolveCatalogQueryPort(options);
  const storageUrlResolver = resolveStorageUrlResolver(options);
  const community = resolveCommunity(options);
  return createRouter({
    catalogReadService: new CatalogReadService(
      catalogQueryPort,
      storageUrlResolver,
      options.catalogSearchQueryPort ??
        (options.nodeEnv !== "production" &&
        options.catalogQueryPort === undefined
          ? createDevelopmentCatalogFixtureSearchPort()
          : undefined),
    ),
    healthReadinessCheck:
      options.healthReadinessCheck ?? (async (): Promise<void> => undefined),
    ...(community === undefined ? {} : { community }),
  });
};
