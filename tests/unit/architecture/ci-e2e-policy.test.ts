import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const classifierPath = path.join(
  repositoryRoot,
  "scripts",
  "ci-e2e-scope.mjs",
);

type E2eScope = "full" | "none" | "smoke";
type ClassifyE2eScope = (
  changedPaths: readonly string[],
  eventName?: string,
) => E2eScope;

const loadClassifier = async (): Promise<ClassifyE2eScope> => {
  const module = (await import(pathToFileURL(classifierPath).href)) as {
    classifyE2eScope: ClassifyE2eScope;
  };
  return module.classifyE2eScope;
};

describe("proportionate browser CI policy", () => {
  it("runs the full matrix only for browser-surface pull requests", async () => {
    const classify = await loadClassifier();

    expect(classify(["apps/web/app/page.tsx"])).toBe("full");
    expect(classify(["packages/ui/src/index.ts"])).toBe("full");
    expect(classify(["tests/e2e/formal-web.spec.ts"])).toBe("full");
    expect(classify(["docs/design-system/assets/example.svg"])).toBe("full");
    expect(classify(["apps/web/app/page.tsx"], "push")).toBe("smoke");
  });

  it("uses smoke or no-browser validation for narrower changes", async () => {
    const classify = await loadClassifier();

    expect(classify(["services/catalog-importer/src/index.ts"])).toBe("smoke");
    expect(classify(["packages/contracts/src/catalog.ts"])).toBe("smoke");
    expect(classify(["database/migrations/example.sql"])).toBe("smoke");
    expect(classify(["README.md", "docs/architecture.md"])).toBe("none");
    expect(
      classify(["docs/architecture.md", "services/api/src/index.ts"]),
    ).toBe("smoke");
    expect(classify([])).toBe("smoke");
  });

  it("keeps one stable required check and a parallel five-project matrix", async () => {
    const [
      ciWorkflow,
      fullWorkflow,
      rootManifestText,
      testsManifestText,
    ] = await Promise.all([
      readFile(
        path.join(repositoryRoot, ".github", "workflows", "ci.yml"),
        "utf8",
      ),
      readFile(
        path.join(repositoryRoot, ".github", "workflows", "e2e-full.yml"),
        "utf8",
      ),
      readFile(path.join(repositoryRoot, "package.json"), "utf8"),
      readFile(path.join(repositoryRoot, "tests", "package.json"), "utf8"),
    ]);
    const rootManifest = JSON.parse(rootManifestText) as {
      scripts: Record<string, string>;
    };
    const testsManifest = JSON.parse(testsManifestText) as {
      scripts: Record<string, string>;
    };

    expect(ciWorkflow).toContain("  classify_e2e:");
    expect(ciWorkflow).toContain("  e2e_smoke:");
    expect(ciWorkflow).toContain("  e2e_full:");
    expect(ciWorkflow).toContain("\n  e2e:\n");
    expect(ciWorkflow).toContain(
      "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
    );
    expect(ciWorkflow).not.toContain("run: pnpm test:e2e\n");

    for (const project of [
      "desktop-chromium",
      "desktop-webkit",
      "mobile-webkit",
      "tablet-webkit",
      "tablet-landscape-webkit",
    ]) {
      expect(ciWorkflow).toContain(`project: ${project}`);
      expect(fullWorkflow).toContain(`project: ${project}`);
    }

    expect(fullWorkflow).toContain("workflow_dispatch:");
    expect(fullWorkflow).toContain('cron: "23 7 * * *"');
    expect(fullWorkflow).toContain('- "v*"');

    expect(rootManifest.scripts["test:e2e:smoke"]).toBe(
      "pnpm --filter @moya/tests test:e2e:smoke",
    );
    expect(testsManifest.scripts["test:e2e:smoke"]).toContain(
      "formal-web.spec.ts",
    );
    expect(testsManifest.scripts["test:e2e:smoke"]).toContain(
      "--project=desktop-chromium",
    );
    expect(testsManifest.scripts["test:e2e:smoke"]).toContain("--workers=1");
  });
});
