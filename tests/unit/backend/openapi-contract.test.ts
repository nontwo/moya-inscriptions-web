import { readFile } from "node:fs/promises";

import {
  apiErrorJsonSchema,
  catalogCitationScopeJsonSchema,
  catalogCommentIdJsonSchema,
  catalogCommentJsonSchema,
  catalogCommentPageJsonSchema,
  catalogCommentReplyJsonSchema,
  catalogCommentReplyPageJsonSchema,
  catalogCommentListingTransportQueryJsonSchema,
  catalogCommentTransportQueryJsonSchema,
  catalogContributorJsonSchema,
  catalogContributorRoleJsonSchema,
  catalogDetailJsonSchema,
  catalogIdJsonSchema,
  commentAuthorJsonSchema,
  createCatalogCommentReplyRequestJsonSchema,
  createCatalogCommentRequestJsonSchema,
  catalogKindJsonSchema,
  catalogListTransportQueryJsonSchema,
  catalogPageJsonSchema,
  catalogSummaryJsonSchema,
  catalogSearchMatchKindJsonSchema,
  catalogSearchItemJsonSchema,
  catalogSearchPageJsonSchema,
  healthResponseJsonSchema,
  mediaIdJsonSchema,
  publicMediaJsonSchema,
  publicSourceCitationJsonSchema,
  publicUserIdJsonSchema,
  publicUserProfileJsonSchema,
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
  it("contains exactly the approved Catalog read, current-user and comment routes", () => {
    expect(openApiDocument.openapi).toBe("3.1.1");
    expect(openApiDocument.jsonSchemaDialect).toBe(
      "https://json-schema.org/draft/2020-12/schema",
    );
    expect(asObject(openApiDocument.info).version).toBe("1.0.0");
    expect(Object.keys(paths).sort()).toEqual(
      [
        "/health",
        "/v1/catalog",
        "/v1/catalog/{catalogId}",
        "/v1/catalog/{catalogId}/comments",
        "/v1/catalog/{catalogId}/comments/{commentId}/replies",
        "/v1/catalog-search",
        "/v1/me",
      ].sort(),
    );
    // The Development session lifecycle is not a Public API operation, and the
    // Owner's operator boundary is an internal subpath, never documented here.
    expect(paths).not.toHaveProperty("/v1/development/sign-in");
    expect(paths).not.toHaveProperty("/v1/development/sign-out");
    expect(paths).not.toHaveProperty("/v1/items");
    expect(paths).not.toHaveProperty("/v1/items/{id}");
    expect(paths).not.toHaveProperty("/v1/search");
    expect(paths).not.toHaveProperty("/v1/categories");
    expect(paths).not.toHaveProperty("/v1/taxonomies");
    for (const name of Object.keys(paths))
      expect(name).not.toMatch(/internal|moderation|publication|operator/iu);
    const operationIds = Object.values(paths).flatMap((pathItem) =>
      Object.values(asObject(pathItem)).map((operation) =>
        String(asObject(operation).operationId),
      ),
    );
    for (const operationId of operationIds)
      expect(operationId).not.toMatch(
        /internal|moderate|publication|operator|suspend/iu,
      );

    const writePaths = new Set([
      "/v1/catalog/{catalogId}/comments",
      "/v1/catalog/{catalogId}/comments/{commentId}/replies",
    ]);
    for (const [name, pathItem] of Object.entries(paths)) {
      expect(Object.keys(asObject(pathItem))).toEqual(
        writePaths.has(name) ? ["get", "post"] : ["get"],
      );
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
    expect(
      Object.keys(asObject(getOperation("/v1/me").responses)).sort(),
    ).toEqual(["200", "400", "401", "500", "503"]);
    expect(getOperation("/v1/me").operationId).toBe("getCurrentUser");
    expect(getOperation("/v1/me").security).toEqual([{ session: [] }]);
    expect(parametersFor("/v1/me")).toEqual([]);
    expect(
      asObject(asObject(openApiDocument.components).securitySchemes),
    ).toEqual({
      session: expect.objectContaining({ type: "http", scheme: "bearer" }),
    });
    for (const operation of [
      "/health",
      "/v1/catalog",
      "/v1/catalog/{catalogId}",
      "/v1/catalog-search",
      // Comment reads stay anonymous.
      "/v1/catalog/{catalogId}/comments",
      "/v1/catalog/{catalogId}/comments/{commentId}/replies",
    ])
      expect(getOperation(operation)).not.toHaveProperty("security");
  });

  it("documents the comment operations, their session requirement and the pending outcome", () => {
    const commentsPath = "/v1/catalog/{catalogId}/comments";
    const repliesPath = "/v1/catalog/{catalogId}/comments/{commentId}/replies";
    const postOperation = (name: string): JsonObject =>
      asObject(asObject(paths[name]).post);

    expect(getOperation(commentsPath).operationId).toBe("listCatalogComments");
    expect(getOperation(repliesPath).operationId).toBe(
      "listCatalogCommentReplies",
    );
    expect(postOperation(commentsPath).operationId).toBe(
      "createCatalogComment",
    );
    expect(postOperation(repliesPath).operationId).toBe(
      "createCatalogCommentReply",
    );

    for (const name of [commentsPath, repliesPath]) {
      expect(
        Object.keys(asObject(getOperation(name).responses)).sort(),
      ).toEqual(["200", "400", "404", "500", "503"]);
      // 202 is the truthful outcome while PRE_MODERATION holds the submission.
      expect(
        Object.keys(asObject(postOperation(name).responses)).sort(),
      ).toEqual(["201", "202", "400", "401", "404", "422", "500", "503"]);
      expect(postOperation(name).security).toEqual([{ session: [] }]);
      expect(
        asObject(asObject(postOperation(name).requestBody).content),
      ).toHaveProperty("application/json");
      const pageParameters = parametersFor(name).filter(
        (parameter) => parameter.in === "query",
      );
      // Only the root listing takes the pinned hot ids of a load-more sequence.
      const listing = name === commentsPath;
      expect(pageParameters.map((parameter) => parameter.name)).toEqual(
        listing ? ["page", "pageSize", "pinned"] : ["page", "pageSize"],
      );
      for (const parameter of pageParameters)
        expect(asObject(parameter.schema)).toEqual(
          schemaProperty(
            listing
              ? catalogCommentListingTransportQueryJsonSchema
              : catalogCommentTransportQueryJsonSchema,
            String(parameter.name),
          ),
        );
    }
    expect(getOperation(commentsPath).description).toContain("hot");
    expect(
      asObject(asObject(schemas.CatalogCommentPage).properties),
    ).toHaveProperty("hot");
    expect(
      asObject(asObject(schemas.CatalogComment).properties),
    ).toHaveProperty("replyTotal");

    expect(asObject(getOperation(commentsPath).responses)["200"]).toMatchObject(
      {
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/CatalogCommentPage" },
          },
        },
      },
    );
    expect(asObject(getOperation(repliesPath).responses)["200"]).toMatchObject({
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/CatalogCommentReplyPage" },
        },
      },
    });
    expect(responseDescription(commentsPath, "404")).toContain(
      "ITEM_NOT_FOUND",
    );
    expect(
      String(
        asObject(asObject(postOperation(commentsPath).responses)["422"])
          .description,
      ),
    ).toContain("INVALID_INPUT");
  });

  it("keeps moderation state and operator shapes out of the public comment DTOs", () => {
    for (const name of [
      "CatalogComment",
      "CatalogCommentReply",
      "CatalogCommentPage",
      "CatalogCommentReplyPage",
      "CommentAuthor",
    ])
      expect(JSON.stringify(schemas[name]).toLowerCase()).not.toMatch(
        /moderation|pending|hidden|status|handle|operator/u,
      );
    expect(
      Object.keys(asObject(asObject(schemas.CatalogComment).properties)),
    ).toEqual([
      "id",
      "catalogId",
      "author",
      "text",
      "createdAt",
      "replies",
      "replyTotal",
    ]);
    expect(
      Object.keys(asObject(asObject(schemas.CatalogCommentReply).properties)),
    ).toEqual(["id", "author", "text", "createdAt", "replyTo"]);
    expect(requiredProperties(schemas.CatalogCommentReply)).not.toContain(
      "replyTo",
    );
    expect(
      Object.keys(asObject(asObject(schemas.CommentAuthor).properties)),
    ).toEqual(["id", "displayName"]);
    expect(asObject(schemas.CatalogComment).additionalProperties).toBe(false);
    expect(
      asObject(
        schemaProperty(
          asObject(asObject(schemas.CatalogCommentPage).properties).pageSize
            ? schemas.CatalogCommentPage
            : {},
          "pageSize",
        ),
      ).maximum,
    ).toBe(50);
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
      CatalogSearchMatchKind: catalogSearchMatchKindJsonSchema,
      CatalogSearchItem: catalogSearchItemJsonSchema,
      CatalogSearchPage: catalogSearchPageJsonSchema,
      PublicUserId: publicUserIdJsonSchema,
      PublicUserProfile: publicUserProfileJsonSchema,
      CatalogCommentId: catalogCommentIdJsonSchema,
      CommentAuthor: commentAuthorJsonSchema,
      CatalogCommentReply: catalogCommentReplyJsonSchema,
      CatalogComment: catalogCommentJsonSchema,
      CatalogCommentPage: catalogCommentPageJsonSchema,
      CatalogCommentReplyPage: catalogCommentReplyPageJsonSchema,
      CreateCatalogCommentRequest: createCatalogCommentRequestJsonSchema,
      CreateCatalogCommentReplyRequest:
        createCatalogCommentReplyRequestJsonSchema,
      HealthResponse: healthResponseJsonSchema,
      ApiError: apiErrorJsonSchema,
    });
    expect(schemas.PublicUserProfile).toMatchObject({
      additionalProperties: false,
      required: ["id", "handle", "displayName"],
      type: "object",
    });
    expect(
      Object.keys(asObject(asObject(schemas.PublicUserProfile).properties)),
    ).toEqual(["id", "handle", "displayName"]);
    expect(JSON.stringify(schemas.PublicUserProfile).toLowerCase()).not.toMatch(
      /status|token|credential|email|phone|avatar/u,
    );
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
        "INVALID_INPUT",
        "ITEM_NOT_FOUND",
        "UNAUTHENTICATED",
        "SERVICE_UNAVAILABLE",
        "INTERNAL_ERROR",
      ],
      type: "string",
    });
    expect(responseDescription("/v1/me", "401")).toContain("UNAUTHENTICATED");
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
