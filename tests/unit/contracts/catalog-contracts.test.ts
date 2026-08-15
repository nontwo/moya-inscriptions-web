import { describe, expect, expectTypeOf, it } from "vitest";

import type {
  CatalogDetail,
  CatalogId,
  CatalogKind,
  CatalogListTransportQuery,
  CatalogPage,
  CatalogSummary,
  MediaId,
  PublicMedia,
} from "@moya/contracts";
import {
  catalogDetailJsonSchema,
  catalogIdJsonSchema,
  catalogKindJsonSchema,
  catalogListTransportQueryJsonSchema,
  catalogPageJsonSchema,
  catalogSummaryJsonSchema,
  mediaIdJsonSchema,
  noQueryTransportJsonSchema,
  publicMediaJsonSchema,
} from "@moya/contracts/json-schema";
import {
  catalogDetailSchema,
  catalogIdSchema,
  catalogKindSchema,
  catalogListTransportQuerySchema,
  catalogPageSchema,
  catalogSummarySchema,
  mediaIdSchema,
  noQueryTransportSchema,
  publicMediaSchema,
} from "@moya/contracts/schemas";

describe("canonical Catalog identity", () => {
  it("keeps CatalogId opaque and source-format-independent", () => {
    const valid = [
      "catalog-001",
      "platform-item-any-format",
      "碑刻-甲",
      "x".repeat(128),
    ];
    const invalid = ["", " ", "catalog item", "catalog\nitem", "x".repeat(129)];

    for (const candidate of valid) {
      expect(catalogIdSchema.safeParse(candidate).success).toBe(true);
    }
    for (const candidate of invalid) {
      expect(catalogIdSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("exports the canonical CatalogId JSON Schema", () => {
    expect(catalogIdJsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^\\S+$",
    });
  });
});

describe("CatalogKind", () => {
  it("accepts exactly the two stable top-level values", () => {
    const kinds: CatalogKind[] = ["inscription", "calligraphy"];

    for (const kind of kinds) {
      expect(catalogKindSchema.parse(kind)).toBe(kind);
    }
    for (const kind of [
      "cliff_inscription",
      "seal",
      "painting",
      "sculpture",
      "video",
    ]) {
      expect(catalogKindSchema.safeParse(kind).success).toBe(false);
    }

    expect(catalogKindSchema.options).toEqual(kinds);
    expect(catalogKindJsonSchema).toMatchObject({
      enum: kinds,
      type: "string",
    });
  });
});

describe("Catalog Media public identity and contract", () => {
  it("keeps MediaId distinct and validates the approved strict shape", () => {
    const id: MediaId = mediaIdSchema.parse("media-example-001");
    const media: PublicMedia = {
      id,
      kind: "image",
      src: "https://media.example.invalid/example.jpg",
      alt: "虚构碑刻图像",
      width: 1_200,
      height: 1_600,
    };

    expect(publicMediaSchema.parse(media)).toEqual(media);
    expect(
      publicMediaSchema.parse({
        ...media,
        src: "http://localhost:3000/media/example.jpg",
      }).src,
    ).toBe("http://localhost:3000/media/example.jpg");
    expectTypeOf<MediaId>().not.toEqualTypeOf<CatalogId>();
    expect(mediaIdSchema.safeParse("media id").success).toBe(false);
    expect(mediaIdJsonSchema).toMatchObject({
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^\\S+$",
    });
    expect(publicMediaJsonSchema).toMatchObject({
      additionalProperties: false,
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
      type: "object",
      required: ["id", "kind", "src", "alt", "width", "height"],
    });
  });

  it.each([
    "mailto:noreply@example.com",
    "file:///tmp/media.jpg",
    "data:image/png;base64,iVBORw0KGgo=",
    "javascript:alert('media')",
    "ftp://example.com/media.jpg",
  ])("rejects non-Web Media src scheme: %s", (src) => {
    expect(
      publicMediaSchema.safeParse({
        id: mediaIdSchema.parse("media-invalid-protocol"),
        kind: "image",
        src,
        alt: "无效协议测试图",
        width: 800,
        height: 600,
      }).success,
    ).toBe(false);
  });

  it("rejects invalid display metadata and every storage-private field", () => {
    const valid = {
      id: mediaIdSchema.parse("media-example-002"),
      kind: "image",
      src: "https://media.example.invalid/example-002.jpg",
      alt: "有效替代文字",
      width: 800,
      height: 600,
    };

    for (const invalid of [
      { ...valid, src: "not-a-url" },
      { ...valid, alt: "" },
      { ...valid, alt: " padded " },
      { ...valid, width: 0 },
      { ...valid, height: -1 },
      { ...valid, kind: "video" },
      { ...valid, objectKey: "private/example.jpg" },
      { ...valid, bucket: "private" },
      { ...valid, storageProvider: "provider" },
      { ...valid, resolverConfiguration: "private" },
    ]) {
      expect(publicMediaSchema.safeParse(invalid).success).toBe(false);
    }
  });
});

const catalogId = catalogIdSchema.parse("catalog-example-001");
const publicRepresentativeMedia: PublicMedia = {
  id: mediaIdSchema.parse("media-example-representative"),
  kind: "image",
  src: "https://media.example.invalid/representative.jpg",
  alt: "虚构摩崖甲代表图",
  width: 1_600,
  height: 1_200,
};

const catalogSummary: CatalogSummary = {
  id: catalogId,
  kind: "inscription",
  title: "虚构摩崖甲",
  aliases: ["虚构别名"],
  summary: "公开摘要",
  periodLabel: "唐",
  representativeMedia: publicRepresentativeMedia,
};

const catalogDetail: CatalogDetail = {
  ...catalogSummary,
  description: "公开详情",
  sourceCitations: [
    {
      label: "虚构公开名录",
      citation: "第 1 页",
      url: "https://example.com/catalogue",
    },
  ],
  media: [publicRepresentativeMedia],
};

describe("Catalog public contracts", () => {
  it("accepts the frozen summary and detail fields", () => {
    expect(catalogSummarySchema.parse(catalogSummary)).toEqual(catalogSummary);
    expect(catalogDetailSchema.parse(catalogDetail)).toEqual(catalogDetail);
  });

  it("keeps Media optional on summaries and an empty Gallery valid on details", () => {
    const mediaLessSummary = { ...catalogSummary };
    delete mediaLessSummary.representativeMedia;
    const mediaLessDetail: CatalogDetail = {
      ...mediaLessSummary,
      sourceCitations: [],
      media: [],
    };

    expect(catalogSummarySchema.parse(mediaLessSummary)).toEqual(
      mediaLessSummary,
    );
    expect(catalogDetailSchema.parse(mediaLessDetail)).toEqual(mediaLessDetail);
  });

  it("rejects internal-only fields under the strict public policy", () => {
    for (const field of [
      "sourceId",
      "rawSource",
      "rawRegion",
      "evidence",
      "verificationState",
      "humanDecision",
      "ownerDecision",
      "workflowNotes",
      "adminNotes",
      "objectKey",
      "storagePath",
      "storageProvider",
      "internalRightsNotes",
      "migrationMetadata",
    ]) {
      expect(
        catalogDetailSchema.safeParse({
          ...catalogDetail,
          [field]: "internal-only",
        }).success,
      ).toBe(false);
    }

    expect(
      catalogDetailSchema.safeParse({
        ...catalogDetail,
        sourceCitations: [
          {
            ...catalogDetail.sourceCitations[0],
            sourceId: "source-internal-001",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps transport query values as validated strings", () => {
    const query: CatalogListTransportQuery = {
      kind: "calligraphy",
      page: "2",
      pageSize: "25",
    };

    expect(catalogListTransportQuerySchema.parse(query)).toEqual(query);
    expect(catalogListTransportQuerySchema.parse({})).toEqual({});
    for (const invalid of [
      { page: "0" },
      { page: "01" },
      { page: "1.5" },
      { page: "9007199254740992" },
      { pageSize: "101" },
      { kind: "cliff_inscription" },
      { kind: ["inscription", "calligraphy"] },
      { pageSize: 20 },
      { keyword: "碑" },
    ]) {
      expect(catalogListTransportQuerySchema.safeParse(invalid).success).toBe(
        false,
      );
    }
  });

  it("rejects every query key for endpoints that declare no query", () => {
    expect(noQueryTransportSchema.parse({})).toEqual({});
    expect(
      noQueryTransportSchema.safeParse({ probe: "readiness" }).success,
    ).toBe(false);
    expect(noQueryTransportJsonSchema).toMatchObject({
      additionalProperties: false,
      properties: {},
      type: "object",
    });
  });

  it("uses the existing self-consistent pagination model", () => {
    const page: CatalogPage = {
      items: [catalogSummary],
      total: 2,
      page: 1,
      pageSize: 1,
      totalPages: 2,
    };

    expect(catalogPageSchema.parse(page)).toEqual(page);
    expect(
      catalogPageSchema.safeParse({ ...page, totalPages: 1 }).success,
    ).toBe(false);
    expect(catalogPageSchema.safeParse({ ...page, page: 3 }).success).toBe(
      false,
    );
    expect(
      catalogPageSchema.parse({
        items: [],
        total: 0,
        page: 1,
        pageSize: 20,
        totalPages: 0,
      }),
    ).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
  });

  it("exports strict Draft 2020-12 JSON Schemas", () => {
    for (const schema of [
      catalogSummaryJsonSchema,
      catalogDetailJsonSchema,
      publicMediaJsonSchema,
      catalogListTransportQueryJsonSchema,
      catalogPageJsonSchema,
    ]) {
      expect(schema).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
      });
    }
    expect(catalogListTransportQueryJsonSchema).toMatchObject({
      properties: {
        kind: { enum: ["inscription", "calligraphy"], type: "string" },
      },
    });
  });
});
