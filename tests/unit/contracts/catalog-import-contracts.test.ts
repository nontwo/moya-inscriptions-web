import { createHash } from "node:crypto";

import {
  CATALOG_IMPORT_ALIAS_HEADERS,
  CATALOG_IMPORT_CATALOG_HEADERS,
  CATALOG_IMPORT_CONTRACT_VERSION,
  CATALOG_IMPORT_CSV_SPEC,
  CATALOG_IMPORT_FIELD_POLICY,
  CATALOG_IMPORT_PROVENANCE_HEADERS,
  CATALOG_IMPORT_SHEET_NAMES,
  aliasImportTableRowSchema,
  applyBlockerCodeSchema,
  canonicalCatalogImportEnvelopeJsonSchema,
  canonicalCatalogImportEnvelopeSchema,
  canonicalizeAliasImportTableRow,
  canonicalizeCatalogImportTableRow,
  canonicalizeProvenanceImportTableRow,
  catalogImportDryRunSchema,
  catalogImportTableRowSchema,
  dryRunFindingSchema,
  importApprovalSchema,
  importBatchSchema,
  parseCanonicalCatalogImportEnvelope,
  parseCatalogImportManifestTableRow,
  provenanceImportTableRowSchema,
  serializeCanonicalCatalogImportEnvelope,
} from "@moya/contracts/internal/catalog-import";
import { describe, expect, it } from "vitest";

const hashA = "a".repeat(64);
const hashB = "b".repeat(64);

const emptyCatalogTableRow = () =>
  Object.fromEntries(
    CATALOG_IMPORT_CATALOG_HEADERS.map((header) => [header, ""]),
  );

const catalogTableRow = (overrides: Record<string, string> = {}) => ({
  ...emptyCatalogTableRow(),
  catalogImportId: "row-001",
  sourceId: "source-001",
  title: "虚构碑刻甲",
  catalogKind: "inscription",
  ...overrides,
});

const canonicalCatalogRow = (overrides: Record<string, string> = {}) =>
  canonicalizeCatalogImportTableRow(catalogTableRow(overrides));

const envelope = (
  overrides: Partial<{
    importContractVersion: string;
    catalogRows: unknown[];
    aliasRows: unknown[];
    provenanceRows: unknown[];
  }> = {},
) => ({
  importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
  catalogRows: [canonicalCatalogRow()],
  aliasRows: [],
  provenanceRows: [],
  ...overrides,
});

describe("Catalog Import contract version and tabular boundary", () => {
  it("requires the exact v1 marker before row validation", () => {
    expect(
      parseCatalogImportManifestTableRow({
        importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
      }),
    ).toBe(CATALOG_IMPORT_CONTRACT_VERSION);

    for (const importContractVersion of [
      undefined,
      "v1",
      "catalog-import/V1",
    ]) {
      expect(() =>
        parseCanonicalCatalogImportEnvelope({
          importContractVersion,
          catalogRows: [{ invalid: true }],
          aliasRows: [],
          provenanceRows: [],
        }),
      ).toThrow();
    }
  });

  it("freezes workbook and CSV headers without a publication input", () => {
    expect(CATALOG_IMPORT_SHEET_NAMES).toEqual([
      "01_Catalog",
      "02_Aliases",
      "03_Provenance",
      "99_Instructions",
    ]);
    expect(CATALOG_IMPORT_CATALOG_HEADERS).not.toContain("publicationIntent");
    expect(CATALOG_IMPORT_ALIAS_HEADERS).toEqual([
      "catalogImportId",
      "alias",
      "aliasType",
    ]);
    expect(CATALOG_IMPORT_PROVENANCE_HEADERS).toEqual([
      "catalogImportId",
      "sourceId",
      "sourceTitle",
      "sourceTypeRaw",
      "sourceUrl",
      "sourceNote",
    ]);
    expect(CATALOG_IMPORT_CSV_SPEC.files).toEqual({
      "00_manifest.csv": ["importContractVersion"],
      "catalog.csv": CATALOG_IMPORT_CATALOG_HEADERS,
      "aliases.csv": CATALOG_IMPORT_ALIAS_HEADERS,
      "provenance.csv": CATALOG_IMPORT_PROVENANCE_HEADERS,
    });
  });

  it("rejects unknown, missing, duplicate and case-varied tabular columns", () => {
    expect(
      catalogImportTableRowSchema.safeParse({
        ...catalogTableRow(),
        publicationIntent: "publish",
      }).success,
    ).toBe(false);
    const missing: Record<string, string> = catalogTableRow();
    delete missing.ownerNote;
    expect(catalogImportTableRowSchema.safeParse(missing).success).toBe(false);
    expect(
      aliasImportTableRowSchema.safeParse({
        catalogImportId: "row-001",
        alias: "别名",
        aliastype: "alternate",
      }).success,
    ).toBe(false);
    expect(
      provenanceImportTableRowSchema.safeParse({
        catalogImportId: "row-001",
        sourceId: "source-001",
        sourceTitle: "",
        sourceTypeRaw: "",
        sourceUrl: "",
        sourceNote: "",
        objectKey: "secret",
      }).success,
    ).toBe(false);
  });

  it("rejects research evidence and Owner research state at the strict boundary", () => {
    for (const excluded of [
      { researchEvidence: "external evidence" },
      { ownerResearchState: "approved" },
      { researchRecord: { sqliteId: 1 } },
    ]) {
      expect(
        canonicalCatalogImportEnvelopeSchema.safeParse(
          envelope({
            catalogRows: [{ ...canonicalCatalogRow(), ...excluded }],
          }),
        ).success,
      ).toBe(false);
    }
  });
});

describe("Canonical Catalog import rows", () => {
  it("accepts exactly the shared inscription and calligraphy kinds", () => {
    expect(canonicalCatalogRow().catalogKind).toBe("inscription");
    expect(
      canonicalCatalogRow({ catalogKind: "calligraphy" }).catalogKind,
    ).toBe("calligraphy");
    for (const catalogKind of [
      "",
      "cliff_inscription",
      "INSCRIPTION",
      "seal",
    ]) {
      expect(() => canonicalCatalogRow({ catalogKind })).toThrow();
    }
  });

  it("requires the three business inputs and keeps catalogId optional", () => {
    for (const field of [
      "catalogImportId",
      "sourceId",
      "title",
      "catalogKind",
    ]) {
      expect(() => canonicalCatalogRow({ [field]: "" })).toThrow();
    }
    expect(canonicalCatalogRow()).not.toHaveProperty("catalogId");
    expect(canonicalCatalogRow({ catalogId: "catalog-001" }).catalogId).toBe(
      "catalog-001",
    );
  });

  it("canonicalizes blank, value, unknown, not-applicable and clear states", () => {
    const row = canonicalCatalogRow({
      dynasty: "唐",
      dynastyState: "VALUE",
      dateTextState: "UNKNOWN",
      provinceState: "NOT_APPLICABLE",
      currentCustodianState: "CLEAR",
      descriptionState: "CLEAR",
    });

    expect(row.dynasty).toEqual({ state: "VALUE", value: "唐" });
    expect(row.dateText).toEqual({ state: "UNKNOWN" });
    expect(row.province).toEqual({ state: "NOT_APPLICABLE" });
    expect(row.prefecture).toEqual({ state: "UNSUPPLIED" });
    expect(row.currentCustodian).toEqual({ state: "CLEAR" });
    expect(row.description).toEqual({ state: "CLEAR" });
  });

  it("rejects contradictory value/state pairs and unsupported description states", () => {
    for (const overrides of [
      { dynasty: "唐", dynastyState: "UNKNOWN" },
      { dynastyState: "VALUE" },
      { descriptionState: "UNKNOWN" },
      { descriptionState: "NOT_APPLICABLE" },
    ]) {
      expect(() => canonicalCatalogRow(overrides)).toThrow();
    }
  });

  it("requires controlled aliases and preserves provenance sourceType as raw text", () => {
    expect(
      canonicalizeAliasImportTableRow({
        catalogImportId: "row-001",
        alias: "旧称",
        aliasType: "historical",
      }),
    ).toEqual({
      catalogImportId: "row-001",
      alias: "旧称",
      aliasType: "historical",
    });
    for (const aliasType of ["", "normalized_search", "other", "Alternate"]) {
      expect(() =>
        canonicalizeAliasImportTableRow({
          catalogImportId: "row-001",
          alias: "别名",
          aliasType,
        }),
      ).toThrow();
    }
    expect(
      canonicalizeProvenanceImportTableRow({
        catalogImportId: "row-001",
        sourceId: "source-001",
        sourceTitle: "虚构目录",
        sourceTypeRaw: "地方旧志",
        sourceUrl: "https://example.com/source",
        sourceNote: "待核",
      }).sourceTypeRaw,
    ).toBe("地方旧志");
  });
});

describe("CatalogImportId and SourceId relationships", () => {
  it("allows an optional primary-source mirror and additional provenance", () => {
    expect(
      canonicalCatalogImportEnvelopeSchema.safeParse(
        envelope({
          provenanceRows: [
            {
              catalogImportId: "row-001",
              sourceId: "source-001",
              sourceTitle: "主来源扩展",
            },
            {
              catalogImportId: "row-001",
              sourceId: "source-extra",
              sourceTitle: "补充来源",
            },
          ],
        }),
      ).success,
    ).toBe(true);
  });

  it("rejects duplicate Catalog/import/source identities", () => {
    const second = canonicalCatalogRow({
      catalogImportId: "row-002",
      sourceId: "source-002",
      catalogId: "catalog-002",
      title: "虚构碑刻乙",
    });
    const cases = [
      [canonicalCatalogRow(), canonicalCatalogRow({ sourceId: "source-002" })],
      [
        canonicalCatalogRow(),
        canonicalCatalogRow({ catalogImportId: "row-002" }),
      ],
      [
        canonicalCatalogRow({ catalogId: "catalog-001" }),
        { ...second, catalogId: "catalog-001" },
      ],
    ];
    for (const catalogRows of cases) {
      expect(
        canonicalCatalogImportEnvelopeSchema.safeParse(
          envelope({ catalogRows }),
        ).success,
      ).toBe(false);
    }
  });

  it("rejects broken child links, repeated provenance pairs and source rebound", () => {
    const second = canonicalCatalogRow({
      catalogImportId: "row-002",
      sourceId: "source-002",
      title: "虚构碑刻乙",
    });
    for (const value of [
      envelope({
        aliasRows: [
          { catalogImportId: "missing", alias: "别名", aliasType: "alternate" },
        ],
      }),
      envelope({
        provenanceRows: [
          { catalogImportId: "row-001", sourceId: "source-extra" },
          { catalogImportId: "row-001", sourceId: "source-extra" },
        ],
      }),
      envelope({
        catalogRows: [canonicalCatalogRow(), second],
        provenanceRows: [
          { catalogImportId: "row-002", sourceId: "source-001" },
        ],
      }),
    ]) {
      expect(
        canonicalCatalogImportEnvelopeSchema.safeParse(value).success,
      ).toBe(false);
    }
  });
});

describe("Canonical serialization and hashes", () => {
  it("uses deterministic RFC 8785-compatible canonical JSON", () => {
    const serialized = serializeCanonicalCatalogImportEnvelope(
      envelope({
        aliasRows: [
          {
            aliasType: "alternate",
            alias: "虚构别名",
            catalogImportId: "row-001",
          },
        ],
      }),
    );
    const hash = createHash("sha256").update(serialized, "utf8").digest("hex");

    expect(serialized.startsWith('{"aliasRows":')).toBe(true);
    expect(hash).toBe(
      "0ce0dc14105e05e8aefad5608e56c710870a28dc7e888a7bd4005a5bb21424c5",
    );
    expect(
      serializeCanonicalCatalogImportEnvelope(
        envelope({
          aliasRows: [
            {
              catalogImportId: "row-001",
              alias: "虚构别名",
              aliasType: "alternate",
            },
          ],
        }),
      ),
    ).toBe(serialized);
    expect(
      createHash("sha256")
        .update(
          serializeCanonicalCatalogImportEnvelope(
            envelope({
              catalogRows: [canonicalCatalogRow({ title: "语义变更" })],
            }),
          ),
          "utf8",
        )
        .digest("hex"),
    ).not.toBe(hash);
    const withoutOwnerNote =
      serializeCanonicalCatalogImportEnvelope(envelope());
    const withOwnerNote = serializeCanonicalCatalogImportEnvelope(
      envelope({
        catalogRows: [
          canonicalCatalogRow({ ownerNote: "Owner-only review note" }),
        ],
      }),
    );
    expect(withOwnerNote).toContain('"ownerNote":"Owner-only review note"');
    expect(
      createHash("sha256").update(withOwnerNote, "utf8").digest("hex"),
    ).not.toBe(
      createHash("sha256").update(withoutOwnerNote, "utf8").digest("hex"),
    );
    expect(() =>
      serializeCanonicalCatalogImportEnvelope(
        envelope({
          catalogRows: [canonicalCatalogRow({ title: "\ud800" })],
        }),
      ),
    ).toThrow(/unpaired UTF-16 surrogate/);
  });

  it("fixes the v1 business-key row-order golden vector", () => {
    const rowZ = canonicalCatalogRow({
      catalogImportId: "row-z",
      sourceId: "source-primary-z",
      title: "虚构碑刻乙",
    });
    const rowA = canonicalCatalogRow({
      catalogImportId: "row-a",
      sourceId: "source-primary-a",
      title: "虚构碑刻甲",
      catalogKind: "calligraphy",
    });
    const aliasZ = {
      catalogImportId: "row-z",
      alias: "乙旧称",
      aliasType: "historical",
    };
    const aliasA = {
      catalogImportId: "row-a",
      alias: "甲别名",
      aliasType: "alternate",
    };
    const aliasAFirst = {
      catalogImportId: "row-a",
      alias: "A-alias",
      aliasType: "alternate",
    };
    const provenanceZ = {
      catalogImportId: "row-z",
      sourceId: "source-primary-z",
      sourceTitle: "乙主来源扩展",
    };
    const provenanceA = {
      catalogImportId: "row-a",
      sourceId: "source-secondary-z",
      sourceTypeRaw: "地方旧志",
    };
    const provenanceAFirst = {
      catalogImportId: "row-a",
      sourceId: "source-secondary-a",
      sourceTitle: "甲补充来源",
    };
    const submitted = envelope({
      catalogRows: [rowZ, rowA],
      aliasRows: [aliasZ, aliasA, aliasAFirst],
      provenanceRows: [provenanceZ, provenanceA, provenanceAFirst],
    });
    const presentationReordered = envelope({
      catalogRows: [rowA, rowZ],
      aliasRows: [aliasAFirst, aliasA, aliasZ],
      provenanceRows: [provenanceAFirst, provenanceA, provenanceZ],
    });

    const serialized = serializeCanonicalCatalogImportEnvelope(submitted);
    const representation = JSON.parse(serialized) as {
      catalogRows: { catalogImportId: string }[];
      aliasRows: { alias: string; catalogImportId: string }[];
      provenanceRows: { catalogImportId: string; sourceId: string }[];
    };
    expect(
      representation.catalogRows.map(({ catalogImportId }) => catalogImportId),
    ).toEqual(["row-a", "row-z"]);
    expect(
      representation.aliasRows.map(
        ({ catalogImportId, alias }) => `${catalogImportId}/${alias}`,
      ),
    ).toEqual(["row-a/A-alias", "row-a/甲别名", "row-z/乙旧称"]);
    expect(
      representation.provenanceRows.map(
        ({ catalogImportId, sourceId }) => `${catalogImportId}/${sourceId}`,
      ),
    ).toEqual([
      "row-a/source-secondary-a",
      "row-a/source-secondary-z",
      "row-z/source-primary-z",
    ]);

    const hash = createHash("sha256").update(serialized, "utf8").digest("hex");
    expect(hash).toBe(
      "bb16bfca66165acccafbdf63134f26ea480184d846b26491d29619a3ba2bae1b",
    );
    expect(serializeCanonicalCatalogImportEnvelope(presentationReordered)).toBe(
      serialized,
    );
    expect(submitted.catalogRows).toEqual([rowZ, rowA]);
    expect(
      createHash("sha256")
        .update(
          serializeCanonicalCatalogImportEnvelope({
            ...presentationReordered,
            aliasRows: [
              aliasAFirst,
              { ...aliasA, aliasType: "historical" },
              aliasZ,
            ],
          }),
          "utf8",
        )
        .digest("hex"),
    ).not.toBe(hash);
    expect(
      createHash("sha256")
        .update(
          serializeCanonicalCatalogImportEnvelope({
            ...presentationReordered,
            aliasRows: [aliasAFirst, aliasZ],
          }),
          "utf8",
        )
        .digest("hex"),
    ).not.toBe(hash);
  });

  it("exports a strict Draft 2020-12 canonical envelope schema", () => {
    expect(canonicalCatalogImportEnvelopeJsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      additionalProperties: false,
    });
  });
});

const criticalFinding = {
  findingId: "finding-001",
  catalogImportId: "row-001",
  sourceId: "source-001",
  catalogId: "catalog-001",
  category: "CRITICAL_CHANGE",
  field: "title",
  protectionLevel: "LEVEL_B",
  persistenceDisposition: "SUPPORTED_NOW",
  operation: "SET",
  approvable: true,
  requiresFieldApproval: true,
  message: "Title changed",
} as const;

const counts = {
  add: 0,
  update: 1,
  unchanged: 0,
  conflict: 0,
  identityConflict: 0,
  error: 0,
  duplicateCandidate: 0,
};

const dryRun = (overrides: Record<string, unknown> = {}) => ({
  importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
  canonicalInputSha256: hashA,
  dryRunResultSha256: hashB,
  state: "PASSED",
  completedAt: "2026-08-12T10:00:00+08:00",
  rowCounts: { catalog: 1, aliases: 0, provenance: 0 },
  resultCounts: counts,
  findings: [criticalFinding],
  duplicateCandidates: [],
  applyBlockers: [],
  applyReady: true,
  ...overrides,
});

const approval = (overrides: Record<string, unknown> = {}) => ({
  importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
  canonicalInputSha256: hashA,
  dryRunResultSha256: hashB,
  state: "APPROVED",
  approvedFindingIds: ["finding-001"],
  decidedBy: "Owner",
  decidedAt: "2026-08-12T10:30:00+08:00",
  ...overrides,
});

describe("Dry-run, persistence blockers and approval", () => {
  it("keeps identity conflicts non-approvable and separate from critical changes", () => {
    expect(dryRunFindingSchema.safeParse(criticalFinding).success).toBe(true);
    const identity = {
      ...criticalFinding,
      category: "IDENTITY_CONFLICT",
      identityConflictReason: "SOURCE_ID_REBOUND",
      applyBlocker: "IDENTITY_CONFLICT",
      approvable: false,
      requiresFieldApproval: false,
      message: "SourceId belongs to another Catalog",
    };
    expect(dryRunFindingSchema.safeParse(identity).success).toBe(true);
    expect(
      dryRunFindingSchema.safeParse({ ...identity, approvable: true }).success,
    ).toBe(false);
    for (const field of ["catalogId", "sourceId"]) {
      expect(
        dryRunFindingSchema.safeParse({ ...criticalFinding, field }).success,
      ).toBe(false);
    }
    expect(
      dryRunFindingSchema.safeParse({
        ...criticalFinding,
        requiresFieldApproval: false,
      }).success,
    ).toBe(false);
  });

  it("requires field approval for every explicit CLEAR", () => {
    expect(
      dryRunFindingSchema.safeParse({
        ...criticalFinding,
        category: "ORDINARY_CHANGE",
        field: "description",
        protectionLevel: "LEVEL_C",
        operation: "CLEAR",
        requiresFieldApproval: false,
      }).success,
    ).toBe(false);
  });

  it("matches the current persistence capability and safely retires stale blockers", () => {
    const supportedNow = Object.entries(CATALOG_IMPORT_FIELD_POLICY)
      .filter(([, policy]) => policy.persistence === "SUPPORTED_NOW")
      .map(([field]) => field)
      .sort();
    const rawOnly = Object.entries(CATALOG_IMPORT_FIELD_POLICY)
      .filter(([, policy]) => policy.persistence === "RAW_ONLY")
      .map(([field]) => field)
      .sort();

    expect(supportedNow).toEqual(
      [
        "sourceId",
        "catalogId",
        "title",
        "catalogKind",
        "dynasty",
        "dateText",
        "province",
        "prefecture",
        "county",
        "currentLocation",
        "currentCustodian",
        "description",
        "alias",
        "aliasType",
        "sourceTitle",
        "sourceTypeRaw",
        "sourceUrl",
        "sourceNote",
      ].sort(),
    );
    expect(rawOnly).toEqual(["catalogImportId", "ownerNote"]);
    for (const retired of [
      "ALIAS_TYPE_STORAGE_REQUIRED",
      "PROVENANCE_STORAGE_REQUIRED",
    ]) {
      expect(applyBlockerCodeSchema.safeParse(retired).success).toBe(false);
    }
  });

  it("accepts supported alias and provenance findings without storage blockers", () => {
    for (const field of ["aliasType", "sourceTypeRaw"] as const) {
      const finding = {
        ...criticalFinding,
        findingId: `finding-${field}`,
        field,
        persistenceDisposition: "SUPPORTED_NOW",
        applyBlocker: undefined,
      };
      expect(dryRunFindingSchema.safeParse(finding).success).toBe(true);
      expect(
        catalogImportDryRunSchema.safeParse(dryRun({ findings: [finding] }))
          .success,
      ).toBe(true);
    }
  });

  it("requires the generic preservation blocker for RAW_ONLY findings", () => {
    const ownerNoteFinding = {
      ...criticalFinding,
      category: "ERROR",
      field: "ownerNote",
      persistenceDisposition: "RAW_ONLY",
      applyBlocker: "DEFERRED_FIELD_NOT_PRESERVED",
      approvable: false,
      requiresFieldApproval: false,
      message: "ownerNote cannot be silently discarded by apply",
    } as const;
    expect(dryRunFindingSchema.safeParse(ownerNoteFinding).success).toBe(true);
    expect(
      dryRunFindingSchema.safeParse({
        ...ownerNoteFinding,
        applyBlocker: undefined,
      }).success,
    ).toBe(false);
  });

  it("binds approval to version, canonical input hash and dry-run hash", () => {
    expect(importApprovalSchema.safeParse(approval()).success).toBe(true);
    expect(
      importBatchSchema.safeParse({
        batchId: "batch-001",
        importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
        state: "APPLIED",
        inputFormat: "XLSX",
        sourceArtifactSha256: "c".repeat(64),
        canonicalInputSha256: hashA,
        createdAt: "2026-08-12T09:00:00+08:00",
        rowCounts: { catalog: 1, aliases: 0, provenance: 0 },
        dryRun: dryRun(),
        approval: approval(),
        appliedAt: "2026-08-12T11:00:00+08:00",
      }).success,
    ).toBe(true);
    for (const badApproval of [
      approval({ canonicalInputSha256: "d".repeat(64) }),
      approval({ dryRunResultSha256: "e".repeat(64) }),
      approval({ importContractVersion: "catalog-import/v2" }),
    ]) {
      expect(
        importBatchSchema.safeParse({
          batchId: "batch-001",
          importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
          state: "AWAITING_APPROVAL",
          inputFormat: "CSV",
          canonicalInputSha256: hashA,
          createdAt: "2026-08-12T09:00:00+08:00",
          rowCounts: { catalog: 1, aliases: 0, provenance: 0 },
          dryRun: dryRun(),
          approval: badApproval,
        }).success,
      ).toBe(false);
    }
  });

  it("does not let approval convert an identity conflict into apply", () => {
    const identityFinding = {
      ...criticalFinding,
      category: "IDENTITY_CONFLICT",
      identityConflictReason: "CATALOG_ID_MISMATCH",
      applyBlocker: "IDENTITY_CONFLICT",
      approvable: false,
      requiresFieldApproval: false,
    };
    expect(
      importBatchSchema.safeParse({
        batchId: "batch-identity",
        importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
        state: "APPLY_BLOCKED",
        inputFormat: "XLSX",
        canonicalInputSha256: hashA,
        createdAt: "2026-08-12T09:00:00+08:00",
        rowCounts: { catalog: 1, aliases: 0, provenance: 0 },
        dryRun: dryRun({
          state: "FAILED",
          resultCounts: {
            ...counts,
            update: 0,
            conflict: 1,
            identityConflict: 1,
          },
          findings: [identityFinding],
          applyBlockers: ["IDENTITY_CONFLICT"],
          applyReady: false,
        }),
        approval: approval({ approvedFindingIds: ["finding-001"] }),
        appliedAt: "2026-08-12T11:00:00+08:00",
      }).success,
    ).toBe(false);
  });

  it("keeps batch phase independent and consistent with dry-run and approval", () => {
    const baseBatch = {
      batchId: "batch-phase",
      importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
      inputFormat: "CSV",
      canonicalInputSha256: hashA,
      createdAt: "2026-08-12T09:00:00+08:00",
      rowCounts: { catalog: 1, aliases: 0, provenance: 0 },
      dryRun: dryRun(),
    } as const;
    expect(
      importBatchSchema.safeParse({
        ...baseBatch,
        state: "APPROVED",
        approval: approval(),
      }).success,
    ).toBe(true);
    expect(
      importBatchSchema.safeParse({
        ...baseBatch,
        state: "APPROVED",
        approval: approval({
          state: "PENDING",
          decidedBy: undefined,
          decidedAt: undefined,
        }),
      }).success,
    ).toBe(false);
    expect(
      importBatchSchema.safeParse({
        ...baseBatch,
        state: "APPLY_BLOCKED",
        approval: approval(),
      }).success,
    ).toBe(false);
    expect(
      importBatchSchema.safeParse({
        ...baseBatch,
        state: "AWAITING_APPROVAL",
        approval: approval(),
      }).success,
    ).toBe(false);
  });
});
