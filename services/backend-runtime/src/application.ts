import {
  createDevelopmentCatalogFixtureQueryPort,
  createDevelopmentCatalogFixtureSearchPort,
  developmentMediaUrlsByObjectKey,
} from "./catalog/development-catalog-fixture.js";
import { createRouter } from "./http/router.js";

import {
  CatalogCommentService,
  CatalogReadService,
  CommunityModerationService,
  CommunitySessionService,
} from "@moya/api";
import { MappedStorageUrlResolver } from "@moya/image";

import type {
  CatalogPublicationPort,
  CommentAnalysisPort,
  CatalogQueryPort,
  CatalogSearchQueryPort,
  CommunityCommentPort,
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
  /** Comments, moderation and the publication setting; requires the identity port. */
  readonly communityCommentPort?: CommunityCommentPort;
  /** Answers whether a Catalog record is currently published, from the Catalog read side. */
  readonly catalogPublicationPort?: CatalogPublicationPort;
  /** Advisory analysis provider; absent means the boundary reports "not connected". */
  readonly communityAnalysisPort?: CommentAnalysisPort;
  /** The Owner's operator credential; empty leaves the internal subpath closed. */
  readonly communityOperatorCredential?: string;
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

// Without an identity and comment port no session or comment can exist and no
// community route is composed; the production composition root always wires the
// App-role adapters. The Development sign-in entry itself exists only under
// NODE_ENV=development, and the operator boundary only with a credential.
const resolveCommunity = (
  options: BackendApplicationOptions,
  catalogPublicationPort: CatalogPublicationPort,
): CommunityRouterDependencies | undefined => {
  const { nodeEnv, communityIdentityPort, communityCommentPort } = options;
  if (communityIdentityPort === undefined) return undefined;
  return {
    sessionService: new CommunitySessionService(communityIdentityPort),
    developmentEntry: nodeEnv === "development",
    // Comments and moderation need their own port; identity works without it.
    ...(communityCommentPort === undefined
      ? {}
      : {
          commentService: new CatalogCommentService(
            communityCommentPort,
            catalogPublicationPort,
          ),
          moderationService: new CommunityModerationService(
            communityCommentPort,
            communityIdentityPort,
            catalogPublicationPort,
            {
              ...(options.communityAnalysisPort === undefined
                ? {}
                : { analysisPort: options.communityAnalysisPort }),
            },
          ),
        }),
    operatorCredential: options.communityOperatorCredential ?? "",
  };
};

/** Composes the HTTP listener before any TCP listener is created. */
export const createBackendApplication = (
  options: BackendApplicationOptions,
): RequestListener => {
  const catalogQueryPort = resolveCatalogQueryPort(options);
  const storageUrlResolver = resolveStorageUrlResolver(options);
  const community = resolveCommunity(
    options,
    options.catalogPublicationPort ?? {
      // A comment may only attach to a record the Catalog read side publishes;
      // the same read side names the record in the Owner's review queue.
      isPublished: async (catalogId) =>
        (await catalogQueryPort.getById(catalogId)) !== null,
      readTitle: async (catalogId) =>
        (await catalogQueryPort.getById(catalogId))?.title ?? null,
    },
  );
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
