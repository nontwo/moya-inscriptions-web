import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

const readJson = async (filePath: string) =>
  JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;

describe("current repository truth and local configuration", () => {
  it("keeps root development commands and port ownership explicit", async () => {
    const rootManifest = await readJson(
      path.join(repositoryRoot, "package.json"),
    );
    const adminManifest = await readJson(
      path.join(repositoryRoot, "apps", "admin", "package.json"),
    );

    expect(rootManifest.scripts).toMatchObject({
      dev: "pnpm dev:web",
      "dev:admin": "pnpm --filter admin dev",
      "dev:all": "turbo run dev --filter=web --filter=admin",
      "dev:web": "pnpm --filter web dev",
    });
    expect(adminManifest.scripts).toMatchObject({
      dev: "next dev --port 3002",
      start: "next start --port 3002",
    });
  });

  it("exposes only implemented variables in the active environment template", async () => {
    const environmentTemplate = (
      await readFile(path.join(repositoryRoot, ".env.example"), "utf8")
    ).trimEnd();

    expect(environmentTemplate.split("\n")).toEqual([
      "NODE_ENV=development",
      "",
      "HOST=127.0.0.1",
      "PORT=3001",
      "",
      "MOYA_PUBLIC_API_BASE_URL=http://127.0.0.1:3001",
      "",
      "DATABASE_URL=",
      "TEST_DATABASE_URL=",
    ]);
  });

  it("uses current Yoyi branding in Web and Admin metadata", async () => {
    const [webLayout, adminLayout, adminPage] = await Promise.all([
      readFile(
        path.join(repositoryRoot, "apps", "web", "app", "layout.tsx"),
        "utf8",
      ),
      readFile(
        path.join(repositoryRoot, "apps", "admin", "app", "layout.tsx"),
        "utf8",
      ),
      readFile(
        path.join(repositoryRoot, "apps", "admin", "app", "page.tsx"),
        "utf8",
      ),
    ]);

    expect(webLayout).toContain('title: "由艺（Yoyi）"');
    expect(adminLayout).toContain('title: "由艺（Yoyi）管理端"');
    expect(adminPage).toContain("由艺（Yoyi）");
  });

  it("keeps CloudBase examples archived and UI URL guidance resolved", async () => {
    const archiveRoot = path.join(
      repositoryRoot,
      "docs",
      "archive",
      "deployment",
      "cloudbase-t03-candidate",
    );
    await Promise.all([
      access(path.join(archiveRoot, "README.md")),
      access(path.join(archiveRoot, "cloudbase-mainland-architecture.md")),
      access(
        path.join(archiveRoot, "infra", "cloudbase", "deployment.example.yaml"),
      ),
      access(
        path.join(archiveRoot, "infra", "cloudbase", "runtime.env.example"),
      ),
    ]);

    const uiReadme = await readFile(
      path.join(repositoryRoot, "packages", "ui", "README.md"),
      "utf8",
    );
    expect(uiReadme).toContain("PublicMedia.src");
    expect(uiReadme).not.toContain("从对象 key 派生");
  });
});
