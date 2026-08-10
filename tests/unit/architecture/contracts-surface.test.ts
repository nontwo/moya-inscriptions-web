import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { repositoryRoot } from "./workspace-scanner.js";

const contractsRoot = path.join(repositoryRoot, "packages", "contracts");

describe("contracts package surface", () => {
  it("keeps the root declaration limited to approved public types", async () => {
    const declaration = await readFile(
      path.join(contractsRoot, "dist", "index.d.ts"),
      "utf8",
    );
    const approved = [
      "ApiError",
      "ApiErrorCode",
      "ArchiveItemDetail",
      "ArchiveItemId",
      "ArchiveItemListQuery",
      "ArchiveItemListTransportQuery",
      "ArchiveItemPage",
      "ArchiveItemSummary",
      "CatalogDetail",
      "CatalogId",
      "CatalogKind",
      "CatalogListTransportQuery",
      "CatalogPage",
      "CatalogSummary",
      "HealthResponse",
      "PublicSourceCitation",
    ];
    const exportBlock = declaration.match(
      /export type\s*\{([\s\S]*?)\}\s*from/,
    )?.[1];
    const exported = (exportBlock ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name !== "")
      .sort();

    expect(exported).toEqual(approved.sort());

    for (const removed of [
      "ArchiveItemRecord",
      "ArchiveItemLifecycleStatus",
      "ArchiveItemSearchQuery",
      "CatalogDetailProjection",
      "CatalogListItemProjection",
      "CatalogListPageProjection",
      "CatalogListQuery",
      "CatalogQueryPort",
      "CatalogRecord",
      "CategoryFacet",
      "ImageAsset",
      "PublicLocation",
    ]) {
      expect(declaration).not.toContain(removed);
    }
  });

  it("keeps the root JavaScript empty and free of Zod imports", async () => {
    const runtime = await readFile(
      path.join(contractsRoot, "dist", "index.js"),
      "utf8",
    );

    expect(runtime).toMatch(/^export \{\};/);
    expect(runtime).not.toContain("zod");
    expect(runtime).not.toContain("schemas.js");
  });

  it("keeps explicit runtime subpaths and side-effect-free metadata", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(contractsRoot, "package.json"), "utf8"),
    ) as {
      exports?: Record<string, unknown>;
      sideEffects?: boolean;
    };

    expect(Object.keys(manifest.exports ?? {}).sort()).toEqual(
      [".", "./json-schema", "./schemas", "./types"].sort(),
    );
    expect(manifest.sideEffects).toBe(false);
  });
});
