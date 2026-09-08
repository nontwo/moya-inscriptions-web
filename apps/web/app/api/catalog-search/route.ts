import {
  parseCatalogSearchQuery,
  parseCatalogSearchPage,
} from "../../../lib/public-api/catalog-search-client";
import { fetchServerCatalogSearchPage } from "../../../lib/public-api/server";

export const runtime = "nodejs";
const allowedParameters = new Set(["q", "kind", "page", "pageSize"]);
const emptyResponse = (status: number) =>
  new Response(null, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export const GET = async (request: Request): Promise<Response> => {
  const parameters = new URL(request.url).searchParams;
  for (const name of parameters.keys()) {
    if (!allowedParameters.has(name) || parameters.getAll(name).length !== 1)
      return emptyResponse(400);
  }
  const query = parseCatalogSearchQuery(
    Object.fromEntries(parameters.entries()),
  );
  if (query === null) return emptyResponse(400);
  try {
    const result = await fetchServerCatalogSearchPage(query, request.signal);
    switch (result.state) {
      case "success": {
        const page = parseCatalogSearchPage(result.page);
        return page === null
          ? emptyResponse(502)
          : Response.json(page, { headers: { "Cache-Control": "no-store" } });
      }
      case "invalid-query":
        return emptyResponse(400);
      case "unavailable":
        return emptyResponse(503);
      case "unexpected-error":
        return emptyResponse(502);
    }
  } catch {
    return emptyResponse(502);
  }
};
