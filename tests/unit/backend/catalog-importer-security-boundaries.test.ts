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
});
