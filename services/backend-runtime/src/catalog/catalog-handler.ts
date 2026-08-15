import {
  isCatalogMediaResolutionError,
  isCatalogQueryUnavailableError,
  parseCatalogListQuery,
} from "@moya/api";
import {
  catalogIdSchema,
  noQueryTransportSchema,
} from "@moya/contracts/schemas";

import { sendApiError } from "../http/api-error-response.js";
import { sendJson } from "../http/json-response.js";
import { collectTransportQuery } from "../http/transport-query.js";

import type { CatalogListQuery, CatalogReadService } from "@moya/api";
import type { IncomingMessage, ServerResponse } from "node:http";

export const handleCatalogList = async (
  request: IncomingMessage,
  response: ServerResponse,
  catalogReadService: CatalogReadService,
): Promise<void> => {
  const url = new URL(request.url ?? "/", "http://backend-runtime.local");

  let query: CatalogListQuery;
  try {
    query = parseCatalogListQuery(collectTransportQuery(url.searchParams));
  } catch {
    sendApiError(response, "INVALID_QUERY", "Invalid catalog query");
    return;
  }

  try {
    sendJson(response, 200, await catalogReadService.list(query));
  } catch (error) {
    if (
      isCatalogQueryUnavailableError(error) ||
      isCatalogMediaResolutionError(error)
    ) {
      sendApiError(
        response,
        "SERVICE_UNAVAILABLE",
        "Service temporarily unavailable",
      );
      return;
    }
    sendApiError(response, "INTERNAL_ERROR", "Internal server error");
  }
};

export const handleCatalogDetail = async (
  request: IncomingMessage,
  encodedCatalogId: string,
  response: ServerResponse,
  catalogReadService: CatalogReadService,
): Promise<void> => {
  const url = new URL(request.url ?? "/", "http://backend-runtime.local");
  try {
    noQueryTransportSchema.parse(collectTransportQuery(url.searchParams));
  } catch {
    sendApiError(response, "INVALID_QUERY", "Invalid catalog query");
    return;
  }

  let decodedCatalogId: string;
  try {
    decodedCatalogId = decodeURIComponent(encodedCatalogId);
  } catch {
    sendApiError(response, "ITEM_NOT_FOUND", "Catalog item not found");
    return;
  }

  const catalogId = catalogIdSchema.safeParse(decodedCatalogId);
  if (!catalogId.success) {
    sendApiError(response, "ITEM_NOT_FOUND", "Catalog item not found");
    return;
  }

  try {
    const detail = await catalogReadService.getById(catalogId.data);
    if (detail === null) {
      sendApiError(response, "ITEM_NOT_FOUND", "Catalog item not found");
      return;
    }

    sendJson(response, 200, detail);
  } catch (error) {
    if (
      isCatalogQueryUnavailableError(error) ||
      isCatalogMediaResolutionError(error)
    ) {
      sendApiError(
        response,
        "SERVICE_UNAVAILABLE",
        "Service temporarily unavailable",
      );
      return;
    }
    sendApiError(response, "INTERNAL_ERROR", "Internal server error");
  }
};
