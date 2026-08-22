export const runtime = "nodejs";

interface CatalogDetailEntryRouteContext {
  params: Promise<{ catalogId: string }>;
}

export const GET = async (
  request: Request,
  context: CatalogDetailEntryRouteContext,
): Promise<Response> => {
  const { catalogId } = await context.params;
  const encodedCatalogId = encodeURIComponent(catalogId);
  const destination = new URL(
    `/?catalogId=${encodedCatalogId}#detail-${encodedCatalogId}`,
    request.url,
  );

  return Response.redirect(destination, 307);
};
