import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import { prepareLegacyEditorialMigration } from "admin/migration";

const original = "傳統字形，𠮷。\r\n甲  乙\n【合成原文】";
const catalog = () => ({
  catalog_id: "synthetic-catalog-001",
  kind: "calligraphy",
  title: "合成迁移资料",
  summary: "合成摘要",
  period_label: "原年代顯示",
  dynasty: "合成朝代",
  dynasty_state: "VALUE",
  date_text: null,
  date_text_state: "UNKNOWN",
  province: null,
  province_state: "NOT_APPLICABLE",
  prefecture: null,
  prefecture_state: "UNSUPPLIED",
  county: null,
  county_state: "CLEAR",
  current_location: "合成現所在地",
  current_location_state: "VALUE",
  current_custodian: null,
  current_custodian_state: "UNSUPPLIED",
  description: "合成簡介",
  description_state: "VALUE",
  script_style: "合成書體",
  script_style_state: "VALUE",
  transcription: original,
  transcription_state: "VALUE",
  historical_context: "合成歷史背景",
  historical_context_state: "VALUE",
  scholarly_research: null,
  scholarly_research_state: "CLEAR",
});
const source = (sourceId = "synthetic-source-001") => ({
  catalog_id: "synthetic-catalog-001",
  source_id: sourceId,
  source_title: "合成来源名稱",
  source_type_raw: "合成來源類型",
  source_url: "https://example.invalid/source",
  source_note: "合成來源原文",
});
const media = (position = 0) => ({
  catalog_id: "synthetic-catalog-001",
  media_id: `synthetic-media-${position}`,
  position,
  is_representative: position === 0,
  kind: "image" as const,
  alt_text: `合成图片${position}`,
  width: 320,
  height: 480,
  object_key: `synthetic/unchanged/${position}.webp`,
});
const metadata = (position = 0) => ({
  catalogId: "synthetic-catalog-001",
  sourceId: "synthetic-source-001",
  mediaId: `synthetic-media-${position}`,
  objectKey: `synthetic/unchanged/${position}.webp`,
  sha256: "a".repeat(64),
  filesize: 1024,
  mimeType: "image/webp" as const,
  width: 320,
  height: 480,
  alt: `合成图片${position}`,
  position,
  isRepresentative: position === 0,
  rights: "合成權利原文" as string | null,
  orderConfidence: "LOW" as const,
});
const snapshot = () => ({
  catalog_entries: [catalog()],
  catalog_aliases: [
    {
      catalog_id: "synthetic-catalog-001",
      position: 9,
      alias: "後列異名",
      alias_type: "historical",
    },
    {
      catalog_id: "synthetic-catalog-001",
      position: 2,
      alias: "首列異名",
      alias_type: "alternate",
    },
  ],
  catalog_import_sources: [source()],
  catalog_contributors: [
    {
      catalog_id: "synthetic-catalog-001",
      position: 6,
      name: "合成书者",
      role: "calligrapher",
    },
    {
      catalog_id: "synthetic-catalog-001",
      position: 1,
      name: "合成作者",
      role: "textAuthor",
    },
  ],
  catalog_source_citations: [
    {
      catalog_id: "synthetic-catalog-001",
      position: 7,
      label: "合成引用",
      citation: "引用原文",
      url: null,
    },
  ],
  catalog_source_citation_scopes: [
    {
      catalog_id: "synthetic-catalog-001",
      citation_position: 7,
      scope: "transcription",
    },
    {
      catalog_id: "synthetic-catalog-001",
      citation_position: 7,
      scope: "record",
    },
  ],
  catalog_media: [media(5), media()],
  mediaMetadata: [metadata(5), metadata()],
  primarySources: [] as { catalogId: string; sourceId: string }[],
});
const categories = (input: unknown) =>
  prepareLegacyEditorialMigration(input).dryRun.findings.map(
    (finding) => finding.category,
  );

describe("offline legacy Catalog to Payload draft migration", () => {
  it("preserves stored identities, original text bytes, field semantics and all relationships", () => {
    const input = snapshot();
    const before = structuredClone(input);
    const result = prepareLegacyEditorialMigration(input);
    expect(result.dryRun).toEqual({
      status: "READY",
      findings: [],
      counts: {
        catalogs: 1,
        aliases: 2,
        sources: 1,
        contributors: 2,
        citations: 1,
        citationScopes: 2,
        media: 2,
      },
    });
    const content = result.drafts[0]?.content;
    expect(content).toMatchObject({
      catalogId: "synthetic-catalog-001",
      sourceId: "synthetic-source-001",
      kind: "calligraphy",
      title: "合成迁移资料",
      summary: "合成摘要",
      periodLabel: "原年代顯示",
      dynasty: { state: "VALUE", value: "合成朝代" },
      dateText: { state: "UNKNOWN" },
      province: { state: "NOT_APPLICABLE" },
      prefecture: { state: "UNSUPPLIED" },
      county: { state: "CLEAR" },
      currentLocation: { state: "VALUE", value: "合成現所在地" },
      currentCustodian: { state: "UNSUPPLIED" },
      description: { state: "VALUE", value: "合成簡介" },
      scriptStyle: { state: "VALUE", value: "合成書體" },
      historicalContext: { state: "VALUE", value: "合成歷史背景" },
      scholarlyResearch: { state: "CLEAR" },
      aliases: [
        { alias: "首列異名", aliasType: "alternate" },
        { alias: "後列異名", aliasType: "historical" },
      ],
      contributors: [
        { name: "合成作者", role: "textAuthor" },
        { name: "合成书者", role: "calligrapher" },
      ],
      provenance: [
        {
          sourceId: "synthetic-source-001",
          sourceTitle: "合成来源名稱",
          sourceTypeRaw: "合成來源類型",
          sourceUrl: "https://example.invalid/source",
          sourceNote: "合成來源原文",
        },
      ],
      sourceCitations: [
        {
          label: "合成引用",
          citation: "引用原文",
          appliesTo: ["record", "transcription"],
        },
      ],
    });
    expect(content?.transcription).toEqual({ state: "VALUE", value: original });
    if (content?.transcription?.state !== "VALUE")
      throw new Error("Missing converted text");
    expect(Buffer.from(content.transcription.value, "utf8")).toEqual(
      Buffer.from(original, "utf8"),
    );
    expect(
      content.media.map(
        ({
          mediaId,
          objectKey,
          position,
          isRepresentative,
          rights,
          orderConfidence,
        }) => ({
          mediaId,
          objectKey,
          position,
          isRepresentative,
          rights,
          orderConfidence,
        }),
      ),
    ).toEqual([
      {
        mediaId: "synthetic-media-0",
        objectKey: "synthetic/unchanged/0.webp",
        position: 0,
        isRepresentative: true,
        rights: "合成權利原文",
        orderConfidence: "LOW",
      },
      {
        mediaId: "synthetic-media-5",
        objectKey: "synthetic/unchanged/5.webp",
        position: 5,
        isRepresentative: false,
        rights: "合成權利原文",
        orderConfidence: "LOW",
      },
    ]);
    expect(input).toEqual(before);
  });

  it("produces deterministic draft and existing-media registration plans without publication authority", () => {
    const first = prepareLegacyEditorialMigration(snapshot());
    const input = snapshot();
    input.catalog_aliases.reverse();
    input.catalog_contributors.reverse();
    input.catalog_media.reverse();
    input.mediaMetadata.reverse();
    input.catalog_source_citation_scopes.reverse();
    expect(prepareLegacyEditorialMigration(input)).toEqual(first);
    expect(first.drafts[0]).toMatchObject({
      sourcePublished: true,
      targetStatus: "draft",
    });
    expect(first.drafts[0]).not.toHaveProperty("approval");
    expect(first.mediaRegistrations[0]).toMatchObject({
      origin: "existing",
      mediaId: "synthetic-media-0",
      objectKey: "synthetic/unchanged/0.webp",
      sha256: "a".repeat(64),
      filesize: 1024,
      mimeType: "image/webp",
      orderConfidence: "LOW",
    });
    expect(first.mediaRegistrations[0]).not.toHaveProperty("file");
    expect(first.mediaRegistrations[0]).not.toHaveProperty("filename");
  });

  it("requires explicit primary selection among multiple known stored sources and preserves secondary provenance", () => {
    const input = snapshot();
    input.catalog_import_sources.push(source("synthetic-source-002"));
    expect(categories(input)).toContain("PRIMARY_SOURCE_REQUIRED");
    input.primarySources = [
      { catalogId: "synthetic-catalog-001", sourceId: "synthetic-source-002" },
    ];
    const result = prepareLegacyEditorialMigration(input);
    expect(result.dryRun.status).toBe("READY");
    expect(result.drafts[0]?.content.sourceId).toBe("synthetic-source-002");
    expect(result.drafts[0]?.content.provenance).toHaveLength(2);
    input.primarySources[0]!.sourceId = "synthetic-never-stored";
    expect(categories(input)).toContain("PRIMARY_SOURCE_CONFLICT");
  });

  it("blocks missing source bindings instead of matching identical titles or deriving SourceId", () => {
    const input = snapshot();
    input.catalog_import_sources = [];
    expect(categories(input)).toContain("SOURCE_MAPPING_MISSING");
    expect(prepareLegacyEditorialMigration(input).drafts).toEqual([]);
  });

  it.each([
    [
      "missing manifest",
      (input: ReturnType<typeof snapshot>) => {
        input.mediaMetadata = [];
      },
    ],
    [
      "missing rights declaration",
      (input: ReturnType<typeof snapshot>) => {
        Reflect.deleteProperty(input.mediaMetadata[0]!, "rights");
      },
    ],
    [
      "missing order evidence",
      (input: ReturnType<typeof snapshot>) => {
        Reflect.deleteProperty(input.mediaMetadata[0]!, "orderConfidence");
      },
    ],
    [
      "missing digest evidence",
      (input: ReturnType<typeof snapshot>) => {
        Reflect.deleteProperty(input.mediaMetadata[0]!, "sha256");
      },
    ],
    [
      "missing mime evidence",
      (input: ReturnType<typeof snapshot>) => {
        Reflect.deleteProperty(input.mediaMetadata[0]!, "mimeType");
      },
    ],
  ])("blocks %s without inventing metadata", (_name, mutate) => {
    const input = snapshot();
    mutate(input);
    const result = prepareLegacyEditorialMigration(input);
    expect(result.dryRun.status).toBe("BLOCKED");
    expect(
      result.dryRun.findings.some(
        ({ category }) => category === "MEDIA_METADATA_REQUIRED",
      ),
    ).toBe(true);
    expect(result.mediaRegistrations).toEqual([]);
  });

  it("preserves explicitly declared absent rights and allows genuinely missing images", () => {
    const input = snapshot();
    input.mediaMetadata.forEach((item) => {
      item.rights = null;
    });
    const withMissingRights = prepareLegacyEditorialMigration(input);
    expect(withMissingRights.dryRun.status).toBe("READY");
    expect(withMissingRights.drafts[0]?.content.media[0]).not.toHaveProperty(
      "rights",
    );
    input.catalog_media = [];
    input.mediaMetadata = [];
    const withoutMedia = prepareLegacyEditorialMigration(input);
    expect(withoutMedia.dryRun.status).toBe("READY");
    expect(withoutMedia.drafts[0]?.content.media).toEqual([]);
  });

  it.each([
    [
      "object key",
      (input: ReturnType<typeof snapshot>) => {
        input.mediaMetadata[0]!.objectKey = "synthetic/different.webp";
      },
    ],
    [
      "width",
      (input: ReturnType<typeof snapshot>) => {
        input.mediaMetadata[0]!.width += 1;
      },
    ],
    [
      "position",
      (input: ReturnType<typeof snapshot>) => {
        input.mediaMetadata[0]!.position += 1;
      },
    ],
    [
      "representative",
      (input: ReturnType<typeof snapshot>) => {
        input.mediaMetadata[0]!.isRepresentative = true;
      },
    ],
    [
      "source",
      (input: ReturnType<typeof snapshot>) => {
        input.mediaMetadata[0]!.sourceId = "synthetic-other-source";
      },
    ],
  ])("blocks a %s mismatch against stored media identity", (_name, mutate) => {
    const input = snapshot();
    mutate(input);
    expect(categories(input)).toContain("MEDIA_METADATA_MISMATCH");
  });

  it("rejects duplicate identities, relation positions, citation scopes and dangling references", () => {
    const cases = [
      [
        "DUPLICATE_CATALOG_ID",
        (input: ReturnType<typeof snapshot>) =>
          input.catalog_entries.push(catalog()),
      ],
      [
        "DUPLICATE_SOURCE_ID",
        (input: ReturnType<typeof snapshot>) =>
          input.catalog_import_sources.push(source()),
      ],
      [
        "DUPLICATE_MEDIA_ID",
        (input: ReturnType<typeof snapshot>) =>
          input.catalog_media.push(media()),
      ],
      [
        "DUPLICATE_OBJECT_KEY",
        (input: ReturnType<typeof snapshot>) => {
          input.catalog_media[0]!.object_key =
            input.catalog_media[1]!.object_key;
        },
      ],
      [
        "DUPLICATE_RELATION_POSITION",
        (input: ReturnType<typeof snapshot>) => {
          input.catalog_aliases[0]!.position =
            input.catalog_aliases[1]!.position;
        },
      ],
      [
        "DUPLICATE_CITATION_SCOPE",
        (input: ReturnType<typeof snapshot>) =>
          input.catalog_source_citation_scopes.push(
            input.catalog_source_citation_scopes[0]!,
          ),
      ],
      [
        "UNKNOWN_CITATION_REFERENCE",
        (input: ReturnType<typeof snapshot>) => {
          input.catalog_source_citation_scopes[0]!.citation_position = 999;
        },
      ],
      [
        "UNKNOWN_CATALOG_REFERENCE",
        (input: ReturnType<typeof snapshot>) => {
          input.catalog_aliases[0]!.catalog_id = "synthetic-unknown-catalog";
        },
      ],
      [
        "IDENTITY_NAMESPACE_CONFLICT",
        (input: ReturnType<typeof snapshot>) => {
          input.catalog_import_sources[0]!.source_id = "synthetic-catalog-001";
        },
      ],
    ] as const;
    for (const [category, mutate] of cases) {
      const input = snapshot();
      mutate(input);
      expect(categories(input)).toContain(category);
    }
  });

  it("returns sanitized failure locations without rejected source text, keys or identity values", () => {
    const input = snapshot();
    input.catalog_entries[0]!.transcription = "\u0000合成敏感原文";
    const result = prepareLegacyEditorialMigration(input);
    expect(result.dryRun.status).toBe("BLOCKED");
    expect(result.dryRun.findings).toContainEqual({
      category: "CONTENT_VALIDATION_FAILED",
      table: "catalog_entries",
      row: 0,
      field: "transcription",
    });
    const output = JSON.stringify(result.dryRun);
    expect(output).not.toContain("合成敏感原文");
    expect(output).not.toContain("synthetic-catalog-001");
    expect(output).not.toContain("synthetic/unchanged");
    expect(result.drafts).toEqual([]);
  });

  it("blocks absent tables or unexpected columns instead of silently losing data", () => {
    expect(categories(undefined)).toContain("SOURCE_UNAVAILABLE");
    const input = snapshot();
    Reflect.deleteProperty(input, "catalog_import_sources");
    expect(categories(input)).toContain("SOURCE_UNAVAILABLE");
    const unknownColumn = snapshot();
    Reflect.set(
      unknownColumn.catalog_entries[0]!,
      "unmapped_column",
      "synthetic-value",
    );
    expect(categories(unknownColumn)).toContain("SOURCE_SCHEMA_MISMATCH");
  });
});
