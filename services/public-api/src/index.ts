import type { HealthResponse } from "@moya/contracts";

export {
  openApiDocument,
  serializeOpenApiDocument,
} from "./openapi-document.js";

/** Pure contract-compatible helper; this package still has no HTTP server. */
export function getHealth(): HealthResponse {
  return { status: "ok" };
}
