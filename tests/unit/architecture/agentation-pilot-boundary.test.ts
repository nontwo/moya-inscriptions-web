import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { repositoryRoot } from "./workspace-scanner.js";

const webRoot = path.join(repositoryRoot, "apps", "web");
const pilotReference =
  /["'](?:agentation|[./]*features\/dev-pilot\/[a-z-]+)["']/u;

const sourceFiles = async (directory: string): Promise<string[]> =>
  (
    await readdir(path.join(webRoot, directory), {
      recursive: true,
      withFileTypes: true,
    })
  )
    .filter(
      (entry) =>
        entry.isFile() &&
        /\.(?:ts|tsx)$/u.test(entry.name) &&
        !/\.test\.tsx?$/u.test(entry.name),
    )
    .map((entry) =>
      path
        .relative(webRoot, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/"),
    );

describe("Agentation pilot stays inside the Development route tree", () => {
  it("is imported only by the /dev layout and its own client module", async () => {
    const files = [
      ...(await sourceFiles("app")),
      ...(await sourceFiles("features")),
    ];
    const importers: string[] = [];
    for (const file of files) {
      const source = await readFile(path.join(webRoot, file), "utf8");
      if (pilotReference.test(source)) importers.push(file);
    }
    expect(importers.sort()).toEqual([
      "app/dev/layout.tsx",
      "features/dev-pilot/agentation-pilot.tsx",
    ]);
  });

  it("gates composition on NODE_ENV and a loopback endpoint, never on a public build flag", async () => {
    const resolver = await readFile(
      path.join(webRoot, "features/dev-pilot/agentation-pilot-surface.ts"),
      "utf8",
    );
    expect(resolver).toContain('nodeEnv !== "development"');
    expect(resolver).not.toMatch(/NEXT_PUBLIC_/u);
    const layout = await readFile(
      path.join(webRoot, "app/dev/layout.tsx"),
      "utf8",
    );
    expect(layout).toContain("resolveAgentationPilotSurface()");
    expect(layout).toContain("pilot === null ? null");
  });
});
