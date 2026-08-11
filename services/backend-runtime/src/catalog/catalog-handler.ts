import {
  mapCatalogDetail,
  mapCatalogPage,
  parseCatalogListQuery,
} from "@moya/api";
import { catalogIdSchema } from "@moya/contracts/schemas";

import { sendApiError } from "../http/api-error-response.js";
import { sendJson } from "../http/json-response.js";

import type { CatalogListQuery, CatalogQueryPort } from "@moya/api";
import type { IncomingMessage, ServerResponse } from "node:http";

type TransportQueryValue = string | readonly string[];

const collectTransportQuery = (
  searchParams: URLSearchParams,
): Record<string, TransportQueryValue> => {
  const query: Record<string, TransportQueryValue> = {};

  for (const [key, value] of searchParams) {
    const existing = query[key];
    if (existing === undefined) {
      query[key] = value;
    } else if (typeof existing === "string") {
      query[key] = [existing, value];
    } else {
      query[key] = [...existing, value];
    }
  }

  return query;
};

export const handleCatalogList = async (
  request: IncomingMessage,
  response: ServerResponse,
  catalogQueryPort: CatalogQueryPort,
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
    const projection = await catalogQueryPort.list(query);
    sendJson(response, 200, mapCatalogPage(projection));
  } catch {
    sendApiError(response, "INTERNAL_ERROR", "Internal server error");
  }
};

export const handleCatalogDetail = async (
  encodedCatalogId: string,
  response: ServerResponse,
  catalogQueryPort: CatalogQueryPort,
): Promise<void> => {
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
    const projection = await catalogQueryPort.getById(catalogId.data);
    if (projection === null) {
      sendApiError(response, "ITEM_NOT_FOUND", "Catalog item not found");
      return;
    }

    sendJson(response, 200, mapCatalogDetail(projection));
  } catch {
    sendApiError(response, "INTERNAL_ERROR", "Internal server error");
  }
};
