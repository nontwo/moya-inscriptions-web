import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

const readJson = async (filePath: string) =>
  JSON.parse(await readFile(filePath, "utf8")) as Record<string, unknown>;

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

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
      "# Optional comma-separated hostnames for Next.js LAN device QA.",
      "# Example: MOYA_ALLOWED_DEV_ORIGINS=192.168.1.25,dev.yoyi.local",
      "MOYA_ALLOWED_DEV_ORIGINS=",
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

  it("pins the Formal root and current documents to the React Product Shell", async () => {
    const [
      formalPage,
      rootReadme,
      webReadme,
      architecture,
      projectStatus,
      milestones,
      agents,
      currentAuthorityAmendment,
    ] = await Promise.all([
      readFile(
        path.join(repositoryRoot, "apps", "web", "app", "page.tsx"),
        "utf8",
      ),
      readFile(path.join(repositoryRoot, "README.md"), "utf8"),
      readFile(path.join(repositoryRoot, "apps", "web", "README.md"), "utf8"),
      readFile(path.join(repositoryRoot, "docs", "architecture.md"), "utf8"),
      readFile(path.join(repositoryRoot, "docs", "project-status.md"), "utf8"),
      readFile(
        path.join(repositoryRoot, "docs", "history", "milestones.md"),
        "utf8",
      ),
      readFile(path.join(repositoryRoot, "AGENTS.md"), "utf8"),
      readFile(
        path.join(
          repositoryRoot,
          "docs",
          "governance",
          "amendments",
          "2026-09-04-react-product-current-authority.md",
        ),
        "utf8",
      ),
    ]);

    expect(formalPage).toContain("loadProductionProductStates");
    expect(formalPage).toContain("<T02pProductPreview");
    expect(
      await fileExists(
        path.join(repositoryRoot, "apps", "web", "app", "route.ts"),
      ),
    ).toBe(false);

    for (const currentDocument of [
      rootReadme,
      webReadme,
      architecture,
      projectStatus,
    ]) {
      expect(currentDocument).toContain("apps/web/app/page.tsx");
      expect(currentDocument).not.toContain("apps/web/app/route.ts");
    }

    expect(projectStatus).toContain("T09-C0:  CLOSED / PASS");
    expect(projectStatus).toContain("T09-B1A: CLOSED / PASS");
    expect(projectStatus).toContain("T09-B1B: CLOSED / PASS");
    expect(projectStatus).toContain("T09-F1:  PENDING");
    expect(projectStatus).not.toContain("Current verified commit:");
    expect(projectStatus).not.toContain("Current verified tree:");
    expect(projectStatus).not.toContain(
      "02de3c1f1d1baeb5eb938d88030c56bc37a2cadc",
    );
    expect(projectStatus).not.toContain("Next backend task after P2-00");

    expect(milestones).toContain("MIG-CUTOVER");
    expect(milestones).toContain("T09-B1B");
    expect(milestones).not.toContain("Production T02 bridge 仍保留");

    expect(agents).toContain("2026-09-04-react-product-current-authority.md");
    expect(currentAuthorityAmendment).toContain("apps/web/app/page.tsx");
    expect(currentAuthorityAmendment).toContain("T09-F1");
  });

  it("keeps current authority on the single main trunk", async () => {
    const currentAuthorityPaths = [
      "AGENTS.md",
      "README.md",
      "SECURITY.md",
      "CONTRIBUTING.md",
      ".github/workflows/ci.yml",
      "docs/README.md",
      "docs/project-status.md",
      "docs/branching-strategy.md",
      "docs/module-ownership.md",
      "docs/architecture.md",
      "docs/governance/amendments/2026-08-24-machine-verified-review-and-merge.md",
      "docs/governance/amendments/2026-09-04-react-product-current-authority.md",
    ];
    const currentAuthorityDocuments = await Promise.all(
      currentAuthorityPaths.map((relativePath) =>
        readFile(path.join(repositoryRoot, relativePath), "utf8"),
      ),
    );

    for (const currentDocument of currentAuthorityDocuments) {
      expect(currentDocument).not.toContain("integration/mvp");
      expect(currentDocument).not.toContain("origin/integration/mvp");
    }

    const [
      rootReadme,
      security,
      contributing,
      workflow,
      projectStatus,
      branchingStrategy,
      architecture,
      singleMainAmendment,
      historicalContractAdr,
      historicalLineageAudit,
    ] = await Promise.all([
      readFile(path.join(repositoryRoot, "README.md"), "utf8"),
      readFile(path.join(repositoryRoot, "SECURITY.md"), "utf8"),
      readFile(path.join(repositoryRoot, "CONTRIBUTING.md"), "utf8"),
      readFile(
        path.join(repositoryRoot, ".github", "workflows", "ci.yml"),
        "utf8",
      ),
      readFile(path.join(repositoryRoot, "docs", "project-status.md"), "utf8"),
      readFile(
        path.join(repositoryRoot, "docs", "branching-strategy.md"),
        "utf8",
      ),
      readFile(path.join(repositoryRoot, "docs", "architecture.md"), "utf8"),
      readFile(
        path.join(
          repositoryRoot,
          "docs",
          "governance",
          "amendments",
          "2026-09-04-single-main-trunk-unification.md",
        ),
        "utf8",
      ),
      readFile(
        path.join(
          repositoryRoot,
          "docs",
          "adr",
          "0004-catalog-contract-design-freeze.md",
        ),
        "utf8",
      ),
      readFile(
        path.join(
          repositoryRoot,
          "docs",
          "governance",
          "history",
          "2026-09-04-status-and-lineage-reset-rule-audit.md",
        ),
        "utf8",
      ),
    ]);

    expect(rootReadme).toMatch(/最新\s+`origin\/main`/);
    expect(security).toContain("current default branch, `main`");
    expect(contributing).toContain("Sync `main`");
    expect(contributing).toContain("Draft PR to `main`");
    expect(workflow.match(/^\s+- main$/gm)).toHaveLength(2);
    expect(projectStatus).toContain("Shared development branch:\nmain");
    expect(projectStatus).toContain("fresh latest origin/main");
    expect(branchingStrategy).toContain("verified `main` commit");
    expect(branchingStrategy).toContain("annotated tag");
    expect(branchingStrategy).toContain("GitHub Release");
    expect(architecture).toContain("latest `origin/main`");

    expect(singleMainAmendment).toContain(
      "The following are no longer current operations:",
    );
    expect(singleMainAmendment).toContain(
      "`integration/mvp` as a live shared branch",
    );
    expect(singleMainAmendment).toContain(
      "`origin/integration/mvp` as a task baseline",
    );

    expect(historicalContractAdr).toContain(
      "integration/mvp@9e99bb6d01afe3e4f7d7778a5cd2975787fd53bc",
    );
    expect(historicalLineageAudit).toContain("latest `origin/integration/mvp`");
  });
});
