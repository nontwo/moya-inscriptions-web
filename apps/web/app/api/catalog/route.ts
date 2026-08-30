import {
  parseCatalogListTransportQuery,
  parseCatalogPage,
} from "../../../lib/public-api/catalog-list-client";
import { fetchServerCatalogPage } from "../../../lib/public-api/server";

import type { CatalogListTransportQuery } from "@moya/contracts";

export const runtime = "nodejs";

const allowedParameters = new Set(["kind", "page", "pageSize"]);

const parseQuery = (request: Request): CatalogListTransportQuery | null => {
  const parameters = new URL(request.url).searchParams;
  for (const name of parameters.keys()) {
    if (!allowedParameters.has(name) || parameters.getAll(name).length !== 1) {
      return null;
    }
  }

  const candidate = Object.fromEntries(parameters.entries());
  return parseCatalogListTransportQuery(candidate);
};

export const GET = async (request: Request): Promise<Response> => {
  const query = parseQuery(request);
  if (query === null) return new Response(null, { status: 400 });

  try {
    const result = await fetchServerCatalogPage(query);
    switch (result.state) {
      case "success": {
        const page = parseCatalogPage(result.page);
        return page !== null
          ? Response.json(page)
          : new Response(null, { status: 502 });
      }
      case "unavailable":
        return new Response(null, { status: 503 });
      case "unexpected-error":
        return new Response(null, { status: 502 });
    }
  } catch {
    return new Response(null, { status: 502 });
  }
};
