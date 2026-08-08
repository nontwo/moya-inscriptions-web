import type { HealthResponse } from "@moya/contracts";

export {
  openApiDocument,
  serializeOpenApiDocument,
} from "./openapi-document.js";

/** Pure contract helper; this package does not start an HTTP server. */
export function getHealth(): HealthResponse {
  return { status: "ok" };
}
