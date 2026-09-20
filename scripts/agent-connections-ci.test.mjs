import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { URL, fileURLToPath } from "node:url";

import { classifyTask } from "./ci-task-scope.mjs";

/**
 * Agent Connections V1 (Issue #141) — the acceptance harness is only evidence
 * if CI actually runs it.
 *
 * These assertions live in a dependency-free script test on purpose. A change
 * to `.github/workflows/` routes to the LIGHTWEIGHT job and to nothing else,
 * by the classifier's own design ("a workflow path cannot name the job an
 * edit affects"), and the lightweight entry runs every script test. So a
 * later edit that deleted the step, made it conditional, or let it fail
 * softly is caught by the one job such an edit selects. A Vitest architecture
 * test would have been selected by the `test` job, which that edit does not
 * start.
 */

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (file) =>
  readFileSync(new URL(file, new URL("../", import.meta.url)), "utf8");

const STEP =
  "Development OAuth consent, revocation and a real Backend tool read";
const COMMAND = "pnpm test:cms:agent-connections --profile complete";
const PRODUCTION_BROWSER = "pnpm test:cms:browser --profile complete";

const cmsJob = () => {
  const workflow = read(".github/workflows/ci.yml");
  const job = workflow.split("\n  cms:\n")[1]?.split("\n  build:\n")[0];
  assert.ok(job, "the cms job must exist");
  return job;
};

describe("the agent-connections acceptance runs in CI", () => {
  it("is a mandatory step of the cms job, after its browser preparation", () => {
    const job = cmsJob();
    const step = job.indexOf(`- name: ${STEP}`);
    assert.ok(step > 0, "the named step must exist");
    // After the Playwright install: the harness drives a real browser and
    // would otherwise fail on a missing one rather than on its own property.
    assert.ok(step > job.indexOf("playwright install --with-deps"));
    // And after the Production Admin browser check, which keeps running
    // against a tree this harness has not touched.
    assert.ok(step > job.indexOf(`run: ${PRODUCTION_BROWSER}`));
    assert.ok(job.includes(`run: ${COMMAND}`));
    // The COMPLETE profile, not a shorter one: the acceptance is the point.
    assert.doesNotMatch(job, /test:cms:agent-connections --profile feedback/u);
  });

  it("cannot pass softly", () => {
    const job = cmsJob();
    const at = job.indexOf(`- name: ${STEP}`);
    // Without this the whole check passes vacuously when the step is gone:
    // `indexOf` answers -1, `slice(-1)` is one character, and none of the
    // patterns below match one character. Measured by deleting the step.
    assert.ok(at > 0, "the named step must exist to be checked");
    const tail = job.slice(at);
    // No soft failure, no condition, and no `|| true` shell escape. Each is a
    // way to keep a green job while the acceptance never ran or never passed.
    assert.doesNotMatch(tail, /continue-on-error/u);
    assert.doesNotMatch(tail, /^\s+if:/mu);
    assert.doesNotMatch(tail, /\|\|\s*true/u);
    // Nothing from this step is uploaded. The harness holds two access tokens
    // and a synthetic Owner credential in its session directory, and an
    // artifact upload here would carry them out of the runner.
    assert.doesNotMatch(tail, /upload-artifact/u);
  });

  it("keeps the Production Admin browser coverage it was added beside", () => {
    const job = cmsJob();
    assert.ok(job.includes(`run: ${PRODUCTION_BROWSER}`));
    assert.ok(
      job.includes(
        "Native Owner create, publish, autosave, batch approval and restore",
      ),
    );
    // Two harnesses, two claims, neither standing in for the other. The
    // production one boots the STANDALONE build, where every
    // Development-gated surface is absent from the emitted JavaScript rather
    // than merely switched off; the acceptance one boots `next dev`, which is
    // the only place those surfaces exist at all. Asserted by their entry
    // points, because that difference is the whole reason both are kept.
    const production = read("scripts/editorial/verify-owner-browser.mjs");
    assert.ok(
      production.includes(".next/standalone/apps/admin"),
      "the production harness must still boot the standalone build",
    );
    assert.ok(
      production.includes("tests/cms/owner-browser.mjs"),
      "the production harness must still run the Owner browser suite",
    );
    const acceptance = read("scripts/editorial/verify-agent-connections.mjs");
    assert.ok(
      acceptance.includes(
        '"node_modules/next/dist/bin/next",\n          "dev"',
      ),
      "the acceptance harness must boot next dev, where the surface exists",
    );
    assert.ok(
      acceptance.includes("tests/cms/agent-connections-browser.mjs"),
      "the acceptance harness must run its own browser suite",
    );
  });

  it("routes the files it depends on to the cms job", () => {
    for (const file of [
      "scripts/editorial/verify-agent-connections.mjs",
      "scripts/editorial/agent-connections-backend.mjs",
      "tests/cms/agent-connections-browser.mjs",
      "services/agent-authorization/src/main.ts",
      "apps/admin/src/agent-connections/resource.ts",
    ]) {
      const plan = classifyTask([file]);
      assert.equal(plan.cms, true, file);
    }
  });

  it("fails acceptance when the Backend read did not happen", () => {
    const harness = read("scripts/editorial/verify-agent-connections.mjs");
    // The gate itself, by its literal text: a summary that does not say
    // VERIFIED throws, whatever the earlier stages reported.
    assert.match(
      harness,
      /summary\.backendToolRead !== "VERIFIED"\)\s*\n?\s*throw new Error\("BACKEND_TOOL_READ_NOT_VERIFIED"\)/u,
    );
    // And the three read stages are part of the exact expected sequence.
    for (const stage of [
      "backend-read-returns-the-seeded-record",
      "backend-read-denied-after-disconnect",
      "backend-read-restored-by-fresh-consent",
    ])
      assert.ok(harness.includes(`"${stage}"`), stage);
  });

  it("refuses to start a Backend that is not a disposable target this harness owns", () => {
    const backend = read("scripts/editorial/agent-connections-backend.mjs");
    for (const gate of [
      // Development only, and an explicit opt-in besides.
      'process.env.NODE_ENV !== "development"',
      'process.env[ENABLED] !== "true"',
      // Loopback, both for the listener and for the database.
      "guard.isLoopbackHostname(url.hostname)",
      'listen: { host: "127.0.0.1", port }',
      // A name this harness owns, by pattern rather than by allowance.
      "OWNED_DATABASE.test(name)",
      // The marker verified on the database actually connected to.
      "guard.assertDisposableTestTarget(probe.rows, name)",
      // And a role that is not another service's.
      "BACKEND_ROLE_SHARED_WITH_ANOTHER_SERVICE",
    ])
      assert.ok(backend.includes(gate), gate);
    // The production composition's own database-name condition is untouched.
    const production = readFileSync(
      new URL(
        "services/backend-production/src/composition.ts",
        new URL("file://" + root),
      ),
      "utf8",
    );
    assert.match(production, /assertLocalDevelopmentDatabase/u);
    assert.match(production, /yoyi_dev/u);
  });

  it("builds every workspace the services it starts depend on", () => {
    // The harness starts three processes out of `dist`. CI failed with
    // ERR_MODULE_NOT_FOUND because one workspace in that dependency
    // closure -- `@moya/public-api`, reached through `backend-runtime`'s
    // health handler -- was not in the build list, and locally an older
    // build had left its `dist` behind so nothing noticed.
    //
    // So the closure is COMPUTED from the manifests rather than restated:
    // adding a dependency to any of these services now fails this test
    // instead of failing CI a commit later.
    const manifests = new Map();
    for (const base of ["packages", "services", "apps"])
      for (const name of readdirSync(join(root, base))) {
        const file = join(root, base, name, "package.json");
        if (!existsSync(file)) continue;
        const pkg = JSON.parse(readFileSync(file, "utf8"));
        manifests.set(pkg.name, {
          directory: `${base}/${name}`,
          dependencies: Object.keys(pkg.dependencies ?? {}).filter((entry) =>
            entry.startsWith("@moya/"),
          ),
        });
      }
    const required = new Set();
    const visit = (name) => {
      const manifest = manifests.get(name);
      if (!manifest || required.has(name)) return;
      required.add(name);
      for (const dependency of manifest.dependencies) visit(dependency);
    };
    // The three processes the harness starts from `dist`, by the packages
    // their entry points resolve.
    for (const entry of [
      "@moya/agent-authorization",
      "@moya/catalog-postgres",
      "@moya/community-postgres",
      "@moya/backend-runtime",
    ])
      visit(entry);

    const harness = read("scripts/editorial/verify-agent-connections.mjs");
    const built = new Set(
      [...harness.matchAll(/\["[a-z-]+-build", "([a-z-]+\/[a-z-]+)"\]/gu)].map(
        (match) => match[1],
      ),
    );
    const expected = new Set(
      [...required].map((name) => manifests.get(name).directory),
    );
    assert.ok(expected.size > 1, "the closure must not be empty");
    assert.deepEqual(
      [...built].sort(),
      [...expected].sort(),
      "the harness must build exactly its services' workspace closure",
    );
  });

  it("gives the acceptance Backend a read-only role", () => {
    const grants = read(
      "infra/development/agent-connections/grant-authorization.sql",
    );
    const block = grants.slice(
      grants.indexOf("IF backend_role IS NOT NULL AND backend_role <> '' THEN"),
    );
    const body = block.slice(0, block.indexOf("END IF;"));
    assert.match(body, /GRANT SELECT ON TABLE/u);
    // No write anywhere in the Backend's block, and no reach into the
    // connection ledger: it never sees a token, only an asserted principal.
    assert.doesNotMatch(body, /INSERT|UPDATE|DELETE/u);
    assert.doesNotMatch(body, /agent_connection/u);
  });
});
