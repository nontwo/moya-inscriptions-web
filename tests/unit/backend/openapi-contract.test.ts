import { readFile } from "node:fs/promises";

import {
  apiErrorJsonSchema,
  catalogCitationScopeJsonSchema,
  catalogContributorJsonSchema,
  catalogContributorRoleJsonSchema,
  catalogDetailJsonSchema,
  catalogIdJsonSchema,
  catalogKindJsonSchema,
  catalogListTransportQueryJsonSchema,
  catalogPageJsonSchema,
  catalogSummaryJsonSchema,
  healthResponseJsonSchema,
  mediaIdJsonSchema,
  publicMediaJsonSchema,
  publicSourceCitationJsonSchema,
} from "@moya/contracts/json-schema";
import { openApiDocument, serializeOpenApiDocument } from "@moya/public-api";
import { format, resolveConfig } from "prettier";
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
const requiredProperties = (schema: unknown): string[] =>
  (asObject(schema).required ?? []) as string[];

describe("inscription-first OpenAPI 3.1.1 contract", () => {
  it("contains exactly the three approved read-only routes", () => {
    expect(openApiDocument.openapi).toBe("3.1.1");
    expect(openApiDocument.jsonSchemaDialect).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(asObject(openApiDocument.info).version).toBe("1.0.0");
    expect(Object.keys(paths).sort()).toEqual(
      ["/health", "/v1/catalog", "/v1/catalog/{catalogId}"].sort(),
    );
    expect(paths).not.toHaveProperty("/v1/items");
    expect(paths).not.toHaveProperty("/v1/items/{id}");
    expect(paths).not.toHaveProperty("/v1/search");
    expect(paths).not.toHaveProperty("/v1/categories");
    expect(paths).not.toHaveProperty("/v1/taxonomies");

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
    expect(parametersFor("/v1/catalog")).toEqual(
      ["kind", "page", "pageSize"].map((name) => ({
        name,
        in: "query",
        required: false,
        schema: schemaProperty(catalogListTransportQueryJsonSchema, name),
      })),
    );
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
      CatalogContributorRole: catalogContributorRoleJsonSchema,
      CatalogContributor: catalogContributorJsonSchema,
      CatalogCitationScope: catalogCitationScopeJsonSchema,
      MediaId: mediaIdJsonSchema,
      PublicMedia: publicMediaJsonSchema,
      PublicSourceCitation: publicSourceCitationJsonSchema,
      CatalogSummary: catalogSummaryJsonSchema,
      CatalogDetail: catalogDetailJsonSchema,
      CatalogPage: catalogPageJsonSchema,
      HealthResponse: healthResponseJsonSchema,
      ApiError: apiErrorJsonSchema,
    });
    expect(schemas.CatalogContributorRole).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      enum: ["textAuthor", "calligrapher"],
      type: "string",
    });
    expect(schemas.CatalogContributor).toEqual(catalogContributorJsonSchema);
    expect(schemas.CatalogContributor).toMatchObject({
      additionalProperties: false,
      required: ["name", "role"],
      type: "object",
    });
    expect(
      Object.keys(asObject(asObject(schemas.CatalogContributor).properties)),
    ).toEqual(["name", "role"]);
    expect(schemas.CatalogCitationScope).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      enum: [
        "record",
        "description",
        "transcription",
        "historicalContext",
        "scholarlyResearch",
      ],
      type: "string",
    });
    expect(schemas.CatalogKind).toMatchObject({
      enum: ["inscription", "calligraphy"],
      type: "string",
    });
    expect(schemas.PublicMedia).toMatchObject({
      properties: {
        src: {
          allOf: [
            { format: "uri", type: "string" },
            {
              pattern: "^[Hh][Tt][Tt][Pp][Ss]?:\\/\\/",
              type: "string",
            },
          ],
        },
      },
    });

    const serialized = JSON.stringify({ paths, schemas }).toLowerCase();
    for (const term of [
      "rawsource",
      "candidate",
      "evidence",
      "review",
      "lifecycle",
      "objectkey",
      "object_key",
      "bucket",
      "storageprovider",
      "storage_provider",
      "resolverconfiguration",
      "images",
      "relateditem",
      "categoryids",
      "city",
      "sourceid",
      "source_id",
      "personid",
      "scriptstyleid",
      "citationid",
      "workflow",
    ]) {
      expect(serialized).not.toContain(term);
    }
  });

  it("exposes the bounded content fields only on CatalogDetail", () => {
    const detailProperties = asObject(
      asObject(schemas.CatalogDetail).properties,
    );
    const summaryProperties = asObject(
      asObject(schemas.CatalogSummary).properties,
    );
    const contentFields = [
      "contributors",
      "scriptStyle",
      "transcription",
      "historicalContext",
      "scholarlyResearch",
    ];

    expect(Object.keys(summaryProperties).sort()).toEqual(
      [
        "id",
        "kind",
        "title",
        "aliases",
        "summary",
        "periodLabel",
        "representativeMedia",
      ].sort(),
    );
    expect(Object.keys(detailProperties).sort()).toEqual(
      [
        ...Object.keys(summaryProperties),
        "dynasty",
        "dateText",
        "province",
        "prefecture",
        "county",
        "currentLocation",
        "currentCustodian",
        "description",
        "sourceCitations",
        "media",
        ...contentFields,
      ].sort(),
    );

    for (const field of contentFields) {
      expect(detailProperties).toHaveProperty(field);
      expect(summaryProperties).not.toHaveProperty(field);
      expect(requiredProperties(schemas.CatalogDetail)).not.toContain(field);
    }

    expect(requiredProperties(schemas.CatalogSummary)).toEqual([
      "id",
      "kind",
      "title",
      "aliases",
    ]);
    expect(requiredProperties(schemas.CatalogDetail)).toEqual([
      "id",
      "kind",
      "title",
      "aliases",
      "sourceCitations",
      "media",
    ]);
    expect(schemaProperty(schemas.CatalogDetail, "contributors")).toMatchObject(
      {
        type: "array",
        minItems: 1,
        maxItems: 50,
        uniqueItems: true,
        items: {
          additionalProperties: false,
          required: ["name", "role"],
          type: "object",
        },
      },
    );
    expect(
      schemaProperty(
        schemaProperty(schemas.CatalogDetail, "contributors").items,
        "name",
      ),
    ).toMatchObject({ minLength: 1, maxLength: 500, type: "string" });
    expect(
      schemaProperty(
        schemaProperty(schemas.CatalogDetail, "contributors").items,
        "role",
      ),
    ).toMatchObject({
      enum: ["textAuthor", "calligrapher"],
      type: "string",
    });
    expect(schemaProperty(schemas.CatalogDetail, "scriptStyle")).toMatchObject({
      minLength: 1,
      maxLength: 2000,
      type: "string",
    });
    expect(
      schemaProperty(schemas.CatalogDetail, "transcription"),
    ).toMatchObject({ minLength: 1, maxLength: 100000, type: "string" });
    for (const field of ["historicalContext", "scholarlyResearch"]) {
      expect(schemaProperty(schemas.CatalogDetail, field)).toMatchObject({
        minLength: 1,
        maxLength: 20000,
        type: "string",
      });
    }
    expect(asObject(schemas.CatalogDetail).additionalProperties).toBe(false);
    expect(asObject(schemas.CatalogSummary).additionalProperties).toBe(false);
  });

  it("exposes optional bounded citation scopes without changing citation identity", () => {
    const citation = asObject(schemas.PublicSourceCitation);
    const appliesTo = schemaProperty(citation, "appliesTo");

    expect(Object.keys(asObject(citation.properties)).sort()).toEqual(
      ["label", "citation", "url", "appliesTo"].sort(),
    );
    expect(requiredProperties(citation)).toEqual(["label"]);
    expect(requiredProperties(citation)).not.toContain("appliesTo");
    expect(appliesTo).toMatchObject({
      type: "array",
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
      items: {
        enum: [
          "record",
          "description",
          "transcription",
          "historicalContext",
          "scholarlyResearch",
        ],
        type: "string",
      },
    });
    expect(citation.additionalProperties).toBe(false);
    expect(citation).not.toHaveProperty("default");
    expect(appliesTo).not.toHaveProperty("default");
  });

  it("uses stable public error codes", () => {
    expect(
      schemaProperty(schemaProperty(schemas.ApiError, "error"), "code"),
    ).toMatchObject({
      enum: [
        "INVALID_QUERY",
        "ITEM_NOT_FOUND",
        "SERVICE_UNAVAILABLE",
        "INTERNAL_ERROR",
      ],
      type: "string",
    });
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
    const artifactUrl = new URL(
      "../../../services/public-api/openapi/openapi.json",
      import.meta.url,
    );
    const committedArtifact = await readFile(artifactUrl, "utf8");
    const regenerated = serializeOpenApiDocument();
    // generate:openapi formats the serialized JSON with the repository config.
    const formatted = await format(regenerated, {
      ...(await resolveConfig(artifactUrl)),
      parser: "json",
    });

    expect(JSON.parse(regenerated)).toEqual(JSON.parse(committedArtifact));
    expect(formatted).toBe(committedArtifact);
    expect(serializeOpenApiDocument()).toBe(regenerated);
  });
});
