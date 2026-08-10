import { createDevelopmentCatalogFixtureQueryPort } from "./catalog/development-catalog-fixture.js";
import { createRouter } from "./http/router.js";

import type { CatalogQueryPort } from "@moya/api";
import type { NodeEnvironment } from "./config.js";
import type { RequestListener } from "node:http";

export interface BackendApplicationOptions {
  readonly nodeEnv: NodeEnvironment;
  readonly catalogQueryPort?: CatalogQueryPort;
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

/** Composes the HTTP listener before any TCP listener is created. */
export const createBackendApplication = (
  options: BackendApplicationOptions,
): RequestListener =>
  createRouter({ catalogQueryPort: resolveCatalogQueryPort(options) });
