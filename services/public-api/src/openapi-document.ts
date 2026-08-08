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
  siteListQueryJsonSchema,
  sitePageJsonSchema,
  sitePageSuccessJsonSchema,
  siteSearchQueryJsonSchema,
  siteSummaryJsonSchema,
  sourceIdJsonSchema,
} from "@moya/contracts/json-schema";
import type { ApiErrorCode } from "@moya/contracts";

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

const apiErrorResponse = (statusMeaning: string, errorCode: ApiErrorCode) =>
  jsonResponse(`${statusMeaning}; error code ${errorCode}.`, "ApiError");

const listQueryParameters = [
  "province",
  "period",
  "categoryId",
  "page",
  "pageSize",
  "sortBy",
  "sortOrder",
].map((name) =>
  queryParameter(name, schemaProperty(siteListQueryJsonSchema, name)),
);

const searchQueryParameters = [
  queryParameter(
    "keyword",
    schemaProperty(siteSearchQueryJsonSchema, "keyword"),
    true,
  ),
  ...[
    "province",
    "period",
    "categoryId",
    "page",
    "pageSize",
    "sortBy",
    "sortOrder",
  ].map((name) =>
    queryParameter(name, schemaProperty(siteSearchQueryJsonSchema, name)),
  ),
];

export const openApiDocument: JsonObject = {
  openapi: "3.1.1",
  jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
  info: {
    title: "摩崖碑刻数字平台 Public API",
    version: "1.0.0",
    description:
      "Operational health is unversioned. Public catalog contracts use /v1; backward-compatible optional capabilities may be added within v1, while breaking changes require /v2.",
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
    "/v1/sites": {
      get: {
        operationId: "listSites",
        summary: "List public inscription sites",
        parameters: listQueryParameters,
        responses: {
          "200": jsonResponse("A page of public sites.", "SitePageSuccess"),
          "400": apiErrorResponse("Invalid query", "INVALID_QUERY"),
          "500": apiErrorResponse("Internal service error", "INTERNAL_ERROR"),
          "503": apiErrorResponse(
            "Service is temporarily unavailable",
            "SERVICE_UNAVAILABLE",
          ),
        },
      },
    },
    "/v1/sites/{id}": {
      get: {
        operationId: "getSiteById",
        summary: "Get one public inscription site",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            description: "Platform SiteId; never a SourceId alias.",
            schema: { $ref: "#/components/schemas/SiteId" },
          },
        ],
        responses: {
          "200": jsonResponse(
            "The requested public site.",
            "SiteDetailSuccess",
          ),
          "404": apiErrorResponse("Site not found", "SITE_NOT_FOUND"),
          "500": apiErrorResponse("Internal service error", "INTERNAL_ERROR"),
          "503": apiErrorResponse(
            "Service is temporarily unavailable",
            "SERVICE_UNAVAILABLE",
          ),
        },
      },
    },
    "/v1/regions": {
      get: {
        operationId: "listRegionFacets",
        summary: "List province-level public region facets",
        responses: {
          "200": jsonResponse(
            "Province-level public facets.",
            "RegionFacetListSuccess",
          ),
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
        summary: "List approved public category facets",
        responses: {
          "200": jsonResponse(
            "Public category facets; an empty data array is valid.",
            "CategoryFacetListSuccess",
          ),
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
        operationId: "searchSites",
        summary: "Search public inscription sites",
        parameters: searchQueryParameters,
        responses: {
          "200": jsonResponse(
            "A page of matching public sites.",
            "SitePageSuccess",
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
  },
  components: {
    schemas: {
      SiteId: {
        ...siteIdJsonSchema,
        description:
          "Platform entity identity with an opaque non-empty wire value.",
      },
      SourceId: {
        ...sourceIdJsonSchema,
        description:
          "Provenance/source-record identity with an opaque non-empty wire value; it is not a SiteId.",
      },
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
    },
  },
};

const canonicalize = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
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
  `${JSON.stringify(canonicalize(openApiDocument as unknown as JsonValue), null, 2)}\n`;
