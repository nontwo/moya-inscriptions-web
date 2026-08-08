import { readFile } from "node:fs/promises";

import {
  apiErrorJsonSchema,
  archiveItemDetailJsonSchema,
  archiveItemIdJsonSchema,
  archiveItemPageJsonSchema,
  archiveItemSummaryJsonSchema,
  categoryFacetListJsonSchema,
  categoryFacetJsonSchema,
  healthResponseJsonSchema,
} from "@moya/contracts/json-schema";
import { openApiDocument, serializeOpenApiDocument } from "@moya/public-api";
import { describe, expect, it } from "vitest";

type JsonObject = Record<string, unknown>;

const asObject = (value: unknown): JsonObject => value as JsonObject;
const paths = asObject(openApiDocument.paths);
const schemas = asObject(asObject(openApiDocument.components).schemas);
const getOperation = (path: string): JsonObject =>
  asObject(asObject(paths[path]).get);
const parametersFor = (path: string): JsonObject[] =>
  ((getOperation(path).parameters ?? []) as unknown[]).map(asObject);
const parameterMapFor = (path: string): Map<string, JsonObject> =>
  new Map(
    parametersFor(path).map((parameter) => [String(parameter.name), parameter]),
  );
const responseDescription = (path: string, status: string): string =>
  String(asObject(asObject(getOperation(path).responses)[status]).description);

describe("source-independent OpenAPI 3.1.1 contract", () => {
  it("contains exactly the five approved read-only routes", () => {
    expect(openApiDocument.openapi).toBe("3.1.1");
    expect(Object.keys(paths).sort()).toEqual(
      [
        "/health",
        "/v1/categories",
        "/v1/items",
        "/v1/items/{id}",
        "/v1/search",
      ].sort(),
    );

    for (const pathItem of Object.values(paths)) {
      expect(Object.keys(asObject(pathItem))).toEqual(["get"]);
    }

    expect(
      Object.keys(asObject(getOperation("/health").responses)).sort(),
    ).toEqual(["200", "503"]);
    expect(
      Object.keys(asObject(getOperation("/v1/items").responses)).sort(),
    ).toEqual(["200", "400", "500", "503"]);
    expect(
      Object.keys(asObject(getOperation("/v1/items/{id}").responses)).sort(),
    ).toEqual(["200", "404", "500", "503"]);
    expect(
      Object.keys(asObject(getOperation("/v1/search").responses)).sort(),
    ).toEqual(["200", "400", "500", "503"]);
    expect(
      Object.keys(asObject(getOperation("/v1/categories").responses)).sort(),
    ).toEqual(["200", "500", "503"]);
  });

  it("derives bounded query parameters without a region API", () => {
    const listParameters = parameterMapFor("/v1/items");
    const searchParameters = parameterMapFor("/v1/search");

    expect([...listParameters.keys()]).toEqual([
      "categoryId",
      "period",
      "page",
      "pageSize",
      "sortBy",
      "sortOrder",
    ]);
    expect([...searchParameters.keys()]).toEqual([
      "keyword",
      "categoryId",
      "period",
      "page",
      "pageSize",
      "sortBy",
      "sortOrder",
    ]);
    expect(searchParameters.get("keyword")?.required).toBe(true);
    expect(asObject(listParameters.get("page")?.schema)).toMatchObject({
      default: 1,
      minimum: 1,
      type: "integer",
    });
    expect(asObject(listParameters.get("pageSize")?.schema)).toMatchObject({
      default: 20,
      minimum: 1,
      maximum: 100,
      type: "integer",
    });
    const removedRegionRoute = ["/v1", "regions"].join("/");
    expect(paths).not.toHaveProperty(removedRegionRoute);
    for (const parameterName of [
      ...listParameters.keys(),
      ...searchParameters.keys(),
    ]) {
      expect(["city", "county", "province"]).not.toContain(parameterName);
    }
  });

  it("uses the opaque ArchiveItemId for item lookup", () => {
    const idParameter = parameterMapFor("/v1/items/{id}").get("id");
    expect(idParameter).toMatchObject({
      in: "path",
      required: true,
      schema: { $ref: "#/components/schemas/ArchiveItemId" },
    });
    expect(schemas.ArchiveItemId).toEqual(archiveItemIdJsonSchema);
  });

  it("uses only contract-derived public components", () => {
    expect(schemas).toEqual({
      ArchiveItemId: archiveItemIdJsonSchema,
      ArchiveItemSummary: archiveItemSummaryJsonSchema,
      ArchiveItemDetail: archiveItemDetailJsonSchema,
      ArchiveItemPage: archiveItemPageJsonSchema,
      CategoryFacet: categoryFacetJsonSchema,
      CategoryFacetList: categoryFacetListJsonSchema,
      HealthResponse: healthResponseJsonSchema,
      ApiError: apiErrorJsonSchema,
    });

    const serialized = JSON.stringify({ paths, schemas });
    const internalTerms = [
      ["raw", "Source"],
      ["candidate"],
      ["evidence"],
      ["review"],
      ["trash"],
      ["life", "cycleStatus"],
      ["created", "At"],
      ["updated", "At"],
    ].map((parts) => parts.join(""));
    for (const term of internalTerms) {
      expect(serialized.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it("uses stable public error codes", () => {
    expect(responseDescription("/v1/items", "400")).toContain("INVALID_QUERY");
    expect(responseDescription("/v1/items/{id}", "404")).toContain(
      "ITEM_NOT_FOUND",
    );
    expect(responseDescription("/health", "503")).toContain(
      "SERVICE_UNAVAILABLE",
    );
    expect(responseDescription("/v1/items", "500")).toContain("INTERNAL_ERROR");
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
    expect(serializeOpenApiDocument()).toBe(regenerated);
  });
});
