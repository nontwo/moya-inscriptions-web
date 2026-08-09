import type { ApiErrorCode } from "@moya/contracts";
import {
  apiErrorJsonSchema,
  archiveItemDetailJsonSchema,
  archiveItemIdJsonSchema,
  archiveItemListQueryJsonSchema,
  archiveItemPageJsonSchema,
  archiveItemSearchQueryJsonSchema,
  archiveItemSummaryJsonSchema,
  categoryFacetListJsonSchema,
  categoryFacetJsonSchema,
  healthResponseJsonSchema,
} from "@moya/contracts/json-schema";

type JsonObject = Record<string, unknown>;
type JsonValue = JsonObject | JsonValue[] | boolean | number | string | null;

const asJsonObject = (value: unknown): JsonObject => value as JsonObject;

const schemaProperty = (schema: unknown, propertyName: string): JsonObject => {
  const properties = asJsonObject(asJsonObject(schema).properties);
  const property = properties[propertyName];
  if (property === undefined) {
    throw new Error(`Missing contract schema property: ${propertyName}`);
  }
  return asJsonObject(property);
};

const queryParameter = (
  name: string,
  schema: JsonObject,
  required = false,
) => ({
  name,
  in: "query",
  required,
  schema,
});

const jsonResponse = (description: string, schemaName: string) => ({
  description,
  content: {
    "application/json": {
      schema: { $ref: `#/components/schemas/${schemaName}` },
    },
  },
});

const apiErrorResponse = (description: string, code: ApiErrorCode) =>
  jsonResponse(`${description}; error code ${code}.`, "ApiError");

const listQueryParameters = [
  "categoryId",
  "period",
  "page",
  "pageSize",
  "sortBy",
  "sortOrder",
].map((name) =>
  queryParameter(name, schemaProperty(archiveItemListQueryJsonSchema, name)),
);

const searchQueryParameters = [
  queryParameter(
    "keyword",
    schemaProperty(archiveItemSearchQueryJsonSchema, "keyword"),
    true,
  ),
  ...["categoryId", "period", "page", "pageSize", "sortBy", "sortOrder"].map(
    (name) =>
      queryParameter(
        name,
        schemaProperty(archiveItemSearchQueryJsonSchema, name),
      ),
  ),
];

export const openApiDocument: JsonObject = {
  openapi: "3.1.1",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: {
    title: "摩崖碑刻数字平台 Public API",
    version: "1.0.0",
    description:
      "Source-independent, read-only access to publicly visible archive items. Operational health is unversioned; public archive contracts use /v1.",
  },
  paths: {
    "/health": {
      get: {
        operationId: "getHealth",
        summary: "Operational health",
        responses: {
          "200": jsonResponse("Service is operational.", "HealthResponse"),
          "503": apiErrorResponse(
            "Service is temporarily unavailable",
            "SERVICE_UNAVAILABLE",
          ),
        },
      },
    },
    "/v1/items": {
      get: {
        operationId: "listItems",
        summary: "List public archive items",
        parameters: listQueryParameters,
        responses: {
          "200": jsonResponse(
            "A page of public archive items.",
            "ArchiveItemPage",
          ),
          "400": apiErrorResponse("Invalid query", "INVALID_QUERY"),
          "500": apiErrorResponse("Internal service error", "INTERNAL_ERROR"),
          "503": apiErrorResponse(
            "Service is temporarily unavailable",
            "SERVICE_UNAVAILABLE",
          ),
        },
      },
    },
    "/v1/items/{id}": {
      get: {
        operationId: "getItemById",
        summary: "Get one public archive item",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Opaque platform ArchiveItemId.",
            schema: { $ref: "#/components/schemas/ArchiveItemId" },
          },
        ],
        responses: {
          "200": jsonResponse(
            "The requested public item.",
            "ArchiveItemDetail",
          ),
          "404": apiErrorResponse("Archive item not found", "ITEM_NOT_FOUND"),
          "500": apiErrorResponse("Internal service error", "INTERNAL_ERROR"),
          "503": apiErrorResponse(
            "Service is temporarily unavailable",
            "SERVICE_UNAVAILABLE",
          ),
        },
      },
    },
    "/v1/search": {
      get: {
        operationId: "searchItems",
        summary: "Search public archive items",
        parameters: searchQueryParameters,
        responses: {
          "200": jsonResponse(
            "A page of matching public items.",
            "ArchiveItemPage",
          ),
          "400": apiErrorResponse("Invalid query", "INVALID_QUERY"),
          "500": apiErrorResponse("Internal service error", "INTERNAL_ERROR"),
          "503": apiErrorResponse(
            "Service is temporarily unavailable",
            "SERVICE_UNAVAILABLE",
          ),
        },
      },
    },
    "/v1/categories": {
      get: {
        operationId: "listCategoryFacets",
        summary: "List public category facets",
        responses: {
          "200": jsonResponse("Public category facets.", "CategoryFacetList"),
          "500": apiErrorResponse("Internal service error", "INTERNAL_ERROR"),
          "503": apiErrorResponse(
            "Service is temporarily unavailable",
            "SERVICE_UNAVAILABLE",
          ),
        },
      },
    },
  },
  components: {
    schemas: {
      ArchiveItemId: archiveItemIdJsonSchema,
      ArchiveItemSummary: archiveItemSummaryJsonSchema,
      ArchiveItemDetail: archiveItemDetailJsonSchema,
      ArchiveItemPage: archiveItemPageJsonSchema,
      CategoryFacet: categoryFacetJsonSchema,
      CategoryFacetList: categoryFacetListJsonSchema,
      HealthResponse: healthResponseJsonSchema,
      ApiError: apiErrorJsonSchema,
    },
  },
};

const canonicalize = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry as JsonValue)]),
    );
  }
  return value;
};

export const serializeOpenApiDocument = (): string =>
  `${JSON.stringify(canonicalize(openApiDocument as JsonValue), null, 2)}\n`;
