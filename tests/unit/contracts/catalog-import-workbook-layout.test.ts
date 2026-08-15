import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import {
  CATALOG_IMPORT_ALIAS_HEADERS,
  CATALOG_IMPORT_CATALOG_HEADERS,
  CATALOG_IMPORT_CONTRACT_VERSION,
  CATALOG_IMPORT_CSV_SPEC,
  CATALOG_IMPORT_PROVENANCE_HEADERS,
  CATALOG_IMPORT_PRESENTATION_REQUIREDNESS_LABELS,
  CATALOG_IMPORT_WORKBOOK_SPEC,
  CATALOG_IMPORT_XLSX_LAYOUT_SPEC,
  CATALOG_IMPORT_XLSX_LAYOUT_VERSION,
  canonicalizeAliasImportTableRow,
  canonicalizeCatalogImportTableRow,
  canonicalizeProvenanceImportTableRow,
  formatCatalogImportPresentationHeader,
  serializeCanonicalCatalogImportEnvelope,
} from "@moya/contracts/internal/catalog-import";
import { describe, expect, it } from "vitest";

const emptyCatalogRow = (): Record<string, string> =>
  Object.fromEntries(
    CATALOG_IMPORT_CATALOG_HEADERS.map((header) => [header, ""]),
  );

const validCatalogRow = (): Record<string, string> => ({
  ...emptyCatalogRow(),
  catalogImportId: "row-001",
  sourceId: "source-001",
  title: "纯合成测试条目",
  catalogKind: "inscription",
});

const collectSourceFiles = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!["dist", "node_modules", ".next", ".turbo"].includes(entry.name)) {
        files.push(
          ...(await collectSourceFiles(path.join(directory, entry.name))),
        );
      }
    } else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) {
      files.push(path.join(directory, entry.name));
    }
  }
  return files;
};

describe("Catalog Import XLSX layout authority", () => {
  it("freezes layout version, row roles, metadata cells and contract-derived enums", () => {
    expect(CATALOG_IMPORT_XLSX_LAYOUT_VERSION).toBe("catalog-import-xlsx/v1");
    expect(CATALOG_IMPORT_XLSX_LAYOUT_SPEC).toMatchObject({
      workbookLayoutVersion: "catalog-import-xlsx/v1",
      importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
      rowRoles: {
        presentationHeader: 1,
        machineHeader: 2,
        firstEditableRow: 3,
        lastEditableRow: 1_048_576,
      },
      instructions: {
        metadata: {
          sectionCell: "A68",
          workbookLayoutVersion: {
            keyCell: "A69",
            valueCell: "B69",
            value: "catalog-import-xlsx/v1",
          },
          importContractVersion: {
            keyCell: "A70",
            valueCell: "B70",
            value: CATALOG_IMPORT_CONTRACT_VERSION,
          },
        },
      },
    });
    expect(CATALOG_IMPORT_XLSX_LAYOUT_SPEC.validations.catalogKind.values).toBe(
      CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.catalogKind,
    );
    expect(CATALOG_IMPORT_XLSX_LAYOUT_SPEC.validations.aliasType.values).toBe(
      CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.aliasType,
    );
    expect(CATALOG_IMPORT_XLSX_LAYOUT_SPEC.validations.fieldState.values).toBe(
      CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.fieldState,
    );
    expect(
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.validations.descriptionState.values,
    ).toBe(CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.descriptionState);
  });

  it("binds every presentation field to the exact executable machine headers", () => {
    expect(
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets["01_Catalog"].fields.map(
        (field) => field.machineHeader,
      ),
    ).toEqual(CATALOG_IMPORT_CATALOG_HEADERS);
    expect(
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets["02_Aliases"].fields.map(
        (field) => field.machineHeader,
      ),
    ).toEqual(CATALOG_IMPORT_ALIAS_HEADERS);
    expect(
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets["03_Provenance"].fields.map(
        (field) => field.machineHeader,
      ),
    ).toEqual(CATALOG_IMPORT_PROVENANCE_HEADERS);
  });

  it("derives concise visible requiredness and synthetic examples from the layout authority", () => {
    expect(CATALOG_IMPORT_PRESENTATION_REQUIREDNESS_LABELS).toEqual({
      REQUIRED: "必填",
      OPTIONAL: "选填",
      UPDATE_ONLY: "更新时填",
      CHILD_ROW_REQUIRED: "子表行必填",
    });
    const allowedMachineExamples = new Set<string>([
      ...CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.catalogKind,
      ...CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.fieldState,
      ...CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.descriptionState,
      ...CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues.aliasType,
    ]);
    const expectedCatalogHeaders = {
      catalogImportId: "批次内关联 ID【必填】",
      sourceId: "来源 ID【必填】",
      catalogId: "平台目录 ID【更新时填】",
      title: "题名【必填】",
      catalogKind: "类别【必填】",
      ownerNote: "内部备注",
    };
    const fieldGroups = [
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets["01_Catalog"].fields,
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets["02_Aliases"].fields,
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets["03_Provenance"].fields,
    ] as const;
    const catalogFields =
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets["01_Catalog"].fields;
    for (const field of catalogFields) {
      const visibleHeader = formatCatalogImportPresentationHeader(
        field.presentationHeader,
        field.requiredness,
      );
      const expected =
        expectedCatalogHeaders[
          field.machineHeader as keyof typeof expectedCatalogHeaders
        ];
      if (expected !== undefined) expect(visibleHeader).toBe(expected);
      if (field.requiredness === "OPTIONAL") {
        expect(visibleHeader).not.toContain("【必填】");
        expect(visibleHeader).not.toContain("【更新时填】");
      }
    }
    for (const fields of fieldGroups) {
      for (const field of fields) {
        const visibleHeader = formatCatalogImportPresentationHeader(
          field.presentationHeader,
          field.requiredness,
        );
        if (
          field.requiredness === "REQUIRED" ||
          field.requiredness === "CHILD_ROW_REQUIRED"
        ) {
          expect(visibleHeader).toMatch(/【必填】$/);
        }
        if (field.requiredness === "UPDATE_ONLY") {
          expect(visibleHeader).toMatch(/【更新时填】$/);
        }
        expect(field.example).not.toBe("");
        expect(
          /synthetic|合成|example\.invalid/.test(field.example) ||
            allowedMachineExamples.has(field.example),
        ).toBe(true);
      }
    }
  });

  it("binds Catalog required/optional/update-only labels to canonicalization", () => {
    const fields =
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets["01_Catalog"].fields;
    expect(
      fields
        .filter((field) => field.requiredness === "REQUIRED")
        .map((field) => field.machineHeader),
    ).toEqual(["catalogImportId", "sourceId", "title", "catalogKind"]);
    expect(
      fields
        .filter((field) => field.requiredness === "UPDATE_ONLY")
        .map((field) => field.machineHeader),
    ).toEqual(["catalogId"]);

    for (const field of fields.filter(
      (candidate) => candidate.requiredness === "REQUIRED",
    )) {
      expect(() =>
        canonicalizeCatalogImportTableRow({
          ...validCatalogRow(),
          [field.machineHeader]: "",
        }),
      ).toThrow();
    }
    expect(
      canonicalizeCatalogImportTableRow(validCatalogRow()),
    ).not.toHaveProperty("catalogId");
    expect(
      canonicalizeCatalogImportTableRow({
        ...validCatalogRow(),
        catalogId: "catalog-001",
      }).catalogId,
    ).toBe("catalog-001");
    expect(() =>
      canonicalizeCatalogImportTableRow(validCatalogRow()),
    ).not.toThrow();
  });

  it("binds child-row requiredness to Alias and Provenance schemas", () => {
    const aliasFields =
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets["02_Aliases"].fields;
    expect(
      aliasFields.every((field) => field.requiredness === "CHILD_ROW_REQUIRED"),
    ).toBe(true);
    const validAlias = {
      catalogImportId: "row-001",
      alias: "纯合成别名",
      aliasType: "alternate",
    };
    for (const field of aliasFields) {
      expect(() =>
        canonicalizeAliasImportTableRow({
          ...validAlias,
          [field.machineHeader]: "",
        }),
      ).toThrow();
    }

    const provenanceFields =
      CATALOG_IMPORT_XLSX_LAYOUT_SPEC.dataSheets["03_Provenance"].fields;
    expect(
      provenanceFields
        .filter((field) => field.requiredness === "CHILD_ROW_REQUIRED")
        .map((field) => field.machineHeader),
    ).toEqual(["catalogImportId", "sourceId"]);
    const validProvenance = {
      catalogImportId: "row-001",
      sourceId: "source-001",
      sourceTitle: "",
      sourceTypeRaw: "",
      sourceUrl: "",
      sourceNote: "",
    };
    expect(() =>
      canonicalizeProvenanceImportTableRow(validProvenance),
    ).not.toThrow();
    for (const field of provenanceFields.filter(
      (candidate) => candidate.requiredness === "CHILD_ROW_REQUIRED",
    )) {
      expect(() =>
        canonicalizeProvenanceImportTableRow({
          ...validProvenance,
          [field.machineHeader]: "",
        }),
      ).toThrow();
    }
  });

  it("preserves the semantic/CSV snapshot and canonical golden vector", () => {
    expect(CATALOG_IMPORT_CSV_SPEC.files).toEqual({
      "00_manifest.csv": ["importContractVersion"],
      "catalog.csv": CATALOG_IMPORT_CATALOG_HEADERS,
      "aliases.csv": CATALOG_IMPORT_ALIAS_HEADERS,
      "provenance.csv": CATALOG_IMPORT_PROVENANCE_HEADERS,
    });
    expect(CATALOG_IMPORT_WORKBOOK_SPEC.allowedValues).toEqual({
      catalogKind: ["inscription", "calligraphy"],
      fieldState: ["VALUE", "UNSUPPLIED", "UNKNOWN", "NOT_APPLICABLE", "CLEAR"],
      descriptionState: ["VALUE", "UNSUPPLIED", "CLEAR"],
      aliasType: ["alternate", "historical"],
    });

    const rowZ = canonicalizeCatalogImportTableRow({
      ...validCatalogRow(),
      catalogImportId: "row-z",
      sourceId: "source-primary-z",
      title: "虚构碑刻乙",
    });
    const rowA = canonicalizeCatalogImportTableRow({
      ...validCatalogRow(),
      catalogImportId: "row-a",
      sourceId: "source-primary-a",
      title: "虚构碑刻甲",
      catalogKind: "calligraphy",
    });
    const serialized = serializeCanonicalCatalogImportEnvelope({
      importContractVersion: CATALOG_IMPORT_CONTRACT_VERSION,
      catalogRows: [rowZ, rowA],
      aliasRows: [
        { catalogImportId: "row-z", alias: "乙旧称", aliasType: "historical" },
        { catalogImportId: "row-a", alias: "甲别名", aliasType: "alternate" },
        { catalogImportId: "row-a", alias: "A-alias", aliasType: "alternate" },
      ],
      provenanceRows: [
        {
          catalogImportId: "row-z",
          sourceId: "source-primary-z",
          sourceTitle: "乙主来源扩展",
        },
        {
          catalogImportId: "row-a",
          sourceId: "source-secondary-z",
          sourceTypeRaw: "地方旧志",
        },
        {
          catalogImportId: "row-a",
          sourceId: "source-secondary-a",
          sourceTitle: "甲补充来源",
        },
      ],
    });
    expect(createHash("sha256").update(serialized, "utf8").digest("hex")).toBe(
      "bb16bfca66165acccafbdf63134f26ea480184d846b26491d29619a3ba2bae1b",
    );
  });

  it("keeps the layout internal and gives ExcelJS only the approved importer runtime boundary", async () => {
    const repositoryRoot = path.resolve(
      path.dirname(new URL(import.meta.url).pathname),
      "../../..",
    );
    const rootManifest = JSON.parse(
      await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(rootManifest.devDependencies?.exceljs).toBe("4.4.0");
    expect(rootManifest.dependencies?.exceljs).toBeUndefined();
    const importerManifest = JSON.parse(
      await readFile(
        path.join(repositoryRoot, "services/catalog-importer/package.json"),
        "utf8",
      ),
    ) as {
      dependencies?: Record<string, string>;
      moyaArchitecture?: { rawSourceAccess?: string };
    };
    expect(importerManifest.dependencies?.exceljs).toBe("4.4.0");
    expect(importerManifest.moyaArchitecture?.rawSourceAccess).toBe(
      "controlled-importer",
    );

    const publicRoot = await readFile(
      path.join(repositoryRoot, "packages/contracts/src/index.ts"),
      "utf8",
    );
    expect(publicRoot).not.toContain("CATALOG_IMPORT_XLSX_LAYOUT");
    const references = [];
    for (const root of ["apps", "services", "packages"] as const) {
      for (const file of await collectSourceFiles(
        path.join(repositoryRoot, root),
      )) {
        if ((await readFile(file, "utf8")).includes("exceljs")) {
          references.push(path.relative(repositoryRoot, file));
        }
      }
    }
    expect(references).toEqual([
      "services/catalog-importer/src/parsing/xlsx.ts",
    ]);
  });
});
