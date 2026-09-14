/**
 * The plain (server-safe) boundary through which Client Components reach the
 * work publishing browser client; `"use client"` files never import
 * lib/public-api directly.
 */
export {
  publishingClient,
  PublishingRequestError,
} from "../../lib/public-api/work-publishing-client";
export type {
  PublishingPageQueryInput,
  PublishingRequestIdentity,
} from "../../lib/public-api/work-publishing-client";
