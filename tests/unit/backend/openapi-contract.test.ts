import { readFile } from "node:fs/promises";

import {
  apiErrorJsonSchema,
  catalogDetailJsonSchema,
  catalogIdJsonSchema,
  catalogKindJsonSchema,
  catalogListTransportQueryJsonSchema,
  catalogPageJsonSchema,
  catalogSummaryJsonSchema,
  healthResponseJsonSchema,
  publicSourceCitationJsonSchema,
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
const schemaProperty = (schema: unknown, propertyName: string): JsonObject =>
  asObject(asObject(asObject(schema).properties)[propertyName]);

describe("inscription-first OpenAPI 3.1.1 contract", () => {
  it("contains exactly the three approved read-only routes", () => {
    expect(openApiDocument.openapi).toBe("3.1.1");
    expect(Object.keys(paths).sort()).toEqual(
      ["/health", "/v1/catalog", "/v1/catalog/{catalogId}"].sort(),
    );
    expect(paths).not.toHaveProperty("/v1/items");
    expect(paths).not.toHaveProperty("/v1/items/{id}");

    for (const pathItem of Object.values(paths)) {
      expect(Object.keys(asObject(pathItem))).toEqual(["get"]);
    }

    expect(
      Object.keys(asObject(getOperation("/health").responses)).sort(),
    ).toEqual(["200", "400", "503"]);
    expect(
      Object.keys(asObject(getOperation("/v1/catalog").responses)).sort(),
    ).toEqual(["200", "400", "500", "503"]);
    expect(
      Object.keys(
        asObject(getOperation("/v1/catalog/{catalogId}").responses),
      ).sort(),
    ).toEqual(["200", "400", "404", "500", "503"]);
    expect(getOperation("/v1/catalog").operationId).toBe("listCatalog");
    expect(getOperation("/v1/catalog/{catalogId}").operationId).toBe(
      "getCatalogById",
    );
  });

  it("exposes only the approved kind and bounded page parameters", () => {
    const listParameters = parameterMapFor("/v1/catalog");

    expect([...listParameters.keys()]).toEqual(["kind", "page", "pageSize"]);
    expect(asObject(listParameters.get("kind")?.schema)).toEqual(
      schemaProperty(catalogListTransportQueryJsonSchema, "kind"),
    );
    expect(asObject(listParameters.get("page")?.schema)).toEqual(
      schemaProperty(catalogListTransportQueryJsonSchema, "page"),
    );
    expect(asObject(listParameters.get("pageSize")?.schema)).toEqual(
      schemaProperty(catalogListTransportQueryJsonSchema, "pageSize"),
    );
    expect(paths).not.toHaveProperty("/v1/search");
    expect(paths).not.toHaveProperty("/v1/categories");
  });

  it("declares strict-query errors for endpoints without query parameters", () => {
    expect(parametersFor("/health")).toEqual([]);
    expect(parametersFor("/v1/catalog/{catalogId}")).toHaveLength(1);
    expect(responseDescription("/health", "400")).toContain("INVALID_QUERY");
    expect(responseDescription("/v1/catalog/{catalogId}", "400")).toContain(
      "INVALID_QUERY",
    );
  });

  it("uses the opaque CatalogId for Catalog lookup", () => {
    const idParameter = parameterMapFor("/v1/catalog/{catalogId}").get(
      "catalogId",
    );
    expect(idParameter).toMatchObject({
      in: "path",
      required: true,
      schema: { $ref: "#/components/schemas/CatalogId" },
    });
    expect(schemas.CatalogId).toEqual(catalogIdJsonSchema);
  });

  it("uses only contract-derived public components", () => {
    expect(schemas).toEqual({
      CatalogId: catalogIdJsonSchema,
      CatalogKind: catalogKindJsonSchema,
      PublicSourceCitation: publicSourceCitationJsonSchema,
      CatalogSummary: catalogSummaryJsonSchema,
      CatalogDetail: catalogDetailJsonSchema,
      CatalogPage: catalogPageJsonSchema,
      HealthResponse: healthResponseJsonSchema,
      ApiError: apiErrorJsonSchema,
    });
    expect(schemas.CatalogKind).toMatchObject({
      enum: ["inscription", "calligraphy"],
      type: "string",
    });

    const serialized = JSON.stringify({ paths, schemas }).toLowerCase();
    for (const term of [
      "rawsource",
      "candidate",
      "evidence",
      "review",
      "lifecycle",
      "objectkey",
      "images",
      "relateditem",
      "categoryids",
      "city",
      "county",
    ]) {
      expect(serialized).not.toContain(term);
    }
  });

  it("uses stable public error codes", () => {
    expect(responseDescription("/v1/catalog", "400")).toContain(
      "INVALID_QUERY",
    );
    expect(responseDescription("/v1/catalog/{catalogId}", "404")).toContain(
      "ITEM_NOT_FOUND",
    );
    expect(responseDescription("/health", "503")).toContain(
      "SERVICE_UNAVAILABLE",
    );
    expect(responseDescription("/v1/catalog", "500")).toContain(
      "INTERNAL_ERROR",
    );
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
