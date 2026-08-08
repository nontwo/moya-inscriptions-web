import { readFile } from "node:fs/promises";

import {
  apiErrorJsonSchema,
  categoryFacetJsonSchema,
  categoryFacetListSuccessJsonSchema,
  healthResponseJsonSchema,
  regionFacetJsonSchema,
  regionFacetListSuccessJsonSchema,
  siteDetailJsonSchema,
  siteDetailSuccessJsonSchema,
  siteIdJsonSchema,
  sitePageJsonSchema,
  sitePageSuccessJsonSchema,
  siteSummaryJsonSchema,
  sourceIdJsonSchema,
} from "@moya/contracts/json-schema";
import { categoryFacetListSuccessSchema } from "@moya/contracts/schemas";
import { openApiDocument, serializeOpenApiDocument } from "@moya/public-api";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject => value as JsonObject;
const paths = asObject(openApiDocument.paths);
const schemas = asObject(asObject(openApiDocument.components).schemas);
const getOperation = (path: string): JsonObject =>
  asObject(asObject(paths[path]).get);
const parametersFor = (path: string): JsonObject[] =>
  (getOperation(path).parameters as unknown[]).map(asObject);
const parameterMapFor = (path: string): Map<string, JsonObject> =>
  new Map(
    parametersFor(path).map((parameter) => [String(parameter.name), parameter]),
  );
const responseDescription = (path: string, status: string): string =>
  String(asObject(asObject(getOperation(path).responses)[status]).description);

describe("OpenAPI 3.1.1 contract", () => {
  it("contains exactly the six approved GET endpoints and statuses", () => {
    expect(openApiDocument.openapi).toBe("3.1.1");
    expect(Object.keys(paths).sort()).toEqual(
      [
        "/health",
        "/v1/categories",
        "/v1/regions",
        "/v1/search",
        "/v1/sites",
        "/v1/sites/{id}",
      ].sort(),
    );

    for (const pathItem of Object.values(paths)) {
      expect(Object.keys(asObject(pathItem))).toEqual(["get"]);
    }

    expect(
      Object.keys(asObject(getOperation("/health").responses)).sort(),
    ).toEqual(["200", "503"]);
    expect(
      Object.keys(asObject(getOperation("/v1/sites").responses)).sort(),
    ).toEqual(["200", "400", "500", "503"]);
    expect(
      Object.keys(asObject(getOperation("/v1/sites/{id}").responses)).sort(),
    ).toEqual(["200", "404", "500", "503"]);
    expect(
      Object.keys(asObject(getOperation("/v1/regions").responses)).sort(),
    ).toEqual(["200", "500", "503"]);
    expect(
      Object.keys(asObject(getOperation("/v1/categories").responses)).sort(),
    ).toEqual(["200", "500", "503"]);
    expect(
      Object.keys(asObject(getOperation("/v1/search").responses)).sort(),
    ).toEqual(["200", "400", "500", "503"]);

    expect(responseDescription("/v1/sites", "400")).toContain("INVALID_QUERY");
    expect(responseDescription("/v1/sites/{id}", "404")).toContain(
      "SITE_NOT_FOUND",
    );
    expect(responseDescription("/health", "503")).toContain(
      "SERVICE_UNAVAILABLE",
    );
    expect(responseDescription("/v1/sites", "500")).toContain("INTERNAL_ERROR");
  });

  it("derives query constraints without lower-level region filters", () => {
    const listParameters = parameterMapFor("/v1/sites");
    const searchParameters = parameterMapFor("/v1/search");

    expect([...listParameters.keys()]).toEqual([
      "province",
      "period",
      "categoryId",
      "page",
      "pageSize",
      "sortBy",
      "sortOrder",
    ]);
    expect([...searchParameters.keys()]).toEqual([
      "keyword",
      "province",
      "period",
      "categoryId",
      "page",
      "pageSize",
      "sortBy",
      "sortOrder",
    ]);
    expect(searchParameters.get("keyword")?.required).toBe(true);

    const pageSchema = asObject(listParameters.get("page")?.schema);
    const pageSizeSchema = asObject(listParameters.get("pageSize")?.schema);
    expect(pageSchema).toMatchObject({
      default: 1,
      minimum: 1,
      type: "integer",
    });
    expect(pageSizeSchema).toMatchObject({
      default: 20,
      minimum: 1,
      maximum: 100,
      type: "integer",
    });
    expect(asObject(listParameters.get("sortBy")?.schema).enum).not.toContain(
      "createdAt",
    );
    expect(asObject(searchParameters.get("sortBy")?.schema).enum).toContain(
      "relevance",
    );
    const parameterNames = [
      ...listParameters.keys(),
      ...searchParameters.keys(),
    ];
    for (const forbiddenName of [
      "city",
      "county",
      "prefecture",
      "countyLevel",
    ]) {
      expect(parameterNames).not.toContain(forbiddenName);
    }
  });

  it("keeps SiteId and SourceId as separate components", () => {
    expect(schemas.SiteId).toEqual({
      ...siteIdJsonSchema,
      description:
        "Platform entity identity with an opaque non-empty wire value.",
    });
    expect(schemas.SourceId).toEqual({
      ...sourceIdJsonSchema,
      description:
        "Provenance/source-record identity with an opaque non-empty wire value; it is not a SiteId.",
    });

    const idParameter = parameterMapFor("/v1/sites/{id}").get("id");
    expect(idParameter).toMatchObject({
      in: "path",
      required: true,
      schema: { $ref: "#/components/schemas/SiteId" },
    });
    expect(JSON.stringify(idParameter)).not.toContain("first-batch");
  });

  it("uses only schema-derived public components", () => {
    expect(schemas).toMatchObject({
      SiteSummary: siteSummaryJsonSchema,
      SiteDetail: siteDetailJsonSchema,
      RegionFacet: regionFacetJsonSchema,
      CategoryFacet: categoryFacetJsonSchema,
      SitePage: sitePageJsonSchema,
      SitePageSuccess: sitePageSuccessJsonSchema,
      SiteDetailSuccess: siteDetailSuccessJsonSchema,
      RegionFacetListSuccess: regionFacetListSuccessJsonSchema,
      CategoryFacetListSuccess: categoryFacetListSuccessJsonSchema,
      ApiError: apiErrorJsonSchema,
      HealthResponse: healthResponseJsonSchema,
    });

    const serializedComponents = JSON.stringify(schemas);
    for (const internalName of [
      "HeritageRecord",
      "SourceCatalogRow",
      "RegionCandidate",
      "RegionEnrichment",
      "rawSource",
      "selectedCandidateIndex",
      "needsReview",
      "reviewNotes",
    ]) {
      expect(serializedComponents).not.toContain(internalName);
    }
  });

  it("uses items pagination, stable public errors, and legal empty categories", () => {
    const sitePageProperties = asObject(asObject(schemas.SitePage).properties);
    const sitePageSuccessProperties = asObject(
      asObject(schemas.SitePageSuccess).properties,
    );
    const successDataProperties = asObject(
      asObject(sitePageSuccessProperties.data).properties,
    );
    const errorProperties = asObject(asObject(schemas.ApiError).properties);
    const errorBodyProperties = asObject(
      asObject(errorProperties.error).properties,
    );

    expect(sitePageProperties).toHaveProperty("items");
    expect(sitePageProperties).not.toHaveProperty("data");
    expect(successDataProperties).toHaveProperty("items");
    expect(successDataProperties).not.toHaveProperty("data");
    expect(asObject(errorBodyProperties.code).enum).toEqual([
      "INVALID_QUERY",
      "SITE_NOT_FOUND",
      "SERVICE_UNAVAILABLE",
      "INTERNAL_ERROR",
    ]);
    expect(errorBodyProperties).toHaveProperty("requestId");
    expect(
      categoryFacetListSuccessSchema.parse({ success: true, data: [] }),
    ).toEqual({ success: true, data: [] });
  });

  it("regenerates an object equal to the committed artifact", async () => {
    const committedArtifact = await readFile(
      new URL(
        "../../../services/public-api/openapi/openapi.json",
        import.meta.url,
      ),
      "utf8",
    );
    const regenerated = serializeOpenApiDocument();

    expect(JSON.parse(regenerated)).toEqual(JSON.parse(committedArtifact));
  });
});
