import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { repositoryRoot } from "./workspace-scanner.js";

const imageRoot = path.join(repositoryRoot, "packages", "image");

describe("@moya/image server-only surface", () => {
  it("depends only on the application resolver port and Media identity", async () => {
    const manifest = JSON.parse(
      await readFile(path.join(imageRoot, "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      sideEffects?: boolean;
    };

    expect(manifest.dependencies).toEqual({
      "@moya/api": "workspace:*",
      "@moya/contracts": "workspace:*",
    });
    expect(manifest.sideEffects).toBe(false);
  });

  it("exports only backend resolvers and contains no HTTP policy", async () => {
    expect(Object.keys(await import("@moya/image")).sort()).toEqual([
      "MappedStorageUrlResolver",
      "UnconfiguredStorageUrlResolver",
    ]);
    const source = await readFile(
      path.join(imageRoot, "src", "index.ts"),
      "utf8",
    );

    expect(source).not.toMatch(/SERVICE_UNAVAILABLE|INTERNAL_ERROR|\b503\b/);
    expect(source).not.toMatch(/s3|cos|r2|oss|bucket|credentials/i);
  });
});
