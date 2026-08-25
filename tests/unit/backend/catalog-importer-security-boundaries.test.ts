import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const importerSource = (...parts: string[]) =>
  path.join(repositoryRoot, "services", "catalog-importer", "src", ...parts);

describe("catalog importer remediation boundaries", () => {
  it("keeps the default validation CLI dry-run only", async () => {
    const source = await readFile(importerSource("validation-cli.ts"), "utf8");

    expect(source).not.toContain("applyCatalogImport");
    expect(source).not.toContain("importApprovalSchema");
    expect(source).not.toContain("OWNER / owner");
    expect(source).not.toContain('state: "APPROVED"');
  });

  it("keeps validation IDs and concrete platform formats outside importer core", async () => {
    const core = await readFile(importerSource("index.ts"), "utf8");
    const validationHarness = await readFile(
      importerSource("validation-apply-cli.ts"),
      "utf8",
    );

    expect(core).not.toContain("validation-catalog-");
    expect(core).not.toContain("randomUUID");
    expect(core).not.toContain("catalog-${");
    expect(validationHarness).toContain("validation-catalog-");
  });

  it("keeps the XLSX operational entry dry-run only", async () => {
    const source = await readFile(
      importerSource("xlsx-validation-cli.ts"),
      "utf8",
    );

    expect(source).toContain("parseCatalogImportXlsxFile");
    expect(source).toContain("createCatalogImportDryRun");
    expect(source).toContain("applied: false");
    expect(source).not.toContain("applyCatalogImport");
    expect(source).not.toContain("importApprovalSchema");
  });

  it("does not couple the controlled importer to Owner paths or research storage", async () => {
    for (const file of [
      "index.ts",
      "diagnostics.ts",
      "xlsx-validation-cli.ts",
      path.join("parsing", "csv.ts"),
      path.join("parsing", "xlsx.ts"),
      path.join("parsing", "ooxml-preflight.ts"),
    ]) {
      const source = await readFile(importerSource(file), "utf8");
      for (const forbidden of [
        "/Users/",
        "/private/",
        "Documents/",
        "ResearchRecord",
        "sqlite",
        "1658",
      ]) {
        expect(source).not.toContain(forbidden);
      }
      expect(source).not.toMatch(/(?:^|[/_.-])research(?:[/_.-]|$)/i);
    }
  });

  it("keeps XLSX parsing and authorization internals out of public/frontend packages", async () => {
    const guardedFiles = [
      path.join(repositoryRoot, "packages/contracts/src/index.ts"),
      path.join(repositoryRoot, "services/public-api/src/index.ts"),
      path.join(repositoryRoot, "apps/web/app/route.ts"),
      path.join(repositoryRoot, "apps/admin/app/page.tsx"),
      path.join(repositoryRoot, "packages/ui/src/index.ts"),
    ];
    for (const file of guardedFiles) {
      const source = await readFile(file, "utf8");
      expect(source).not.toContain("@moya/catalog-importer");
      expect(source).not.toContain("parseCatalogImportXlsx");
      expect(source).not.toContain("ownerNote");
      expect(source).not.toContain("sourceArtifactSha256");
    }
  });
});
