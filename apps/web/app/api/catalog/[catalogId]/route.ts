import { fetchServerCatalogDetail } from "../../../../lib/public-api/server";

export const runtime = "nodejs";

interface CatalogDetailRouteContext {
  params: Promise<{ catalogId: string }>;
}

export const GET = async (
  _request: Request,
  context: CatalogDetailRouteContext,
): Promise<Response> => {
  const { catalogId } = await context.params;
  const result = await fetchServerCatalogDetail(catalogId);

  switch (result.state) {
    case "success":
      return Response.json(result.detail);
    case "not-found":
      return new Response(null, { status: 404 });
    case "unavailable":
      return new Response(null, { status: 503 });
    case "unexpected-error":
      return new Response(null, { status: 502 });
  }
};
