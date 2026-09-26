import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  GIB,
  applyPlan,
  planPrune,
  resolveCacheDir,
  scanCache,
} from "./turbo-cache-prune.mjs";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

function makeCache() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "turbo-cache-prune-"));
  const cacheDir = path.join(root, ".turbo", "cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  return { root, cacheDir };
}

function writeGroup(
  cacheDir,
  hash,
  { sha = null, ageDays = 0, bytes = 1024, dev = false } = {},
) {
  const manifest = {
    files: dev
      ? {
          "apps/web/.next/cache/turbopack/x": {},
          "apps/web/.next/server/app/page.js": {},
        }
      : { "packages/contracts/dist/index.js": {} },
  };
  fs.writeFileSync(
    path.join(cacheDir, `${hash}.tar.zst`),
    Buffer.alloc(bytes, 1),
  );
  fs.writeFileSync(
    path.join(cacheDir, `${hash}-manifest.json`),
    JSON.stringify(manifest),
  );
  fs.writeFileSync(
    path.join(cacheDir, `${hash}-meta.json`),
    JSON.stringify({ hash, duration: 1, sha, dirty_hash: null }),
  );
  const when = new Date(NOW - ageDays * DAY);
  for (const suffix of [".tar.zst", "-manifest.json", "-meta.json"])
    fs.utimesSync(path.join(cacheDir, hash + suffix), when, when);
}

const h = (n) => n.toString(16).padStart(16, "0");

test("scanCache groups the three files per hash and flags legacy dev caches", () => {
  const { cacheDir } = makeCache();
  writeGroup(cacheDir, h(1), { sha: "a".repeat(40), dev: true });
  writeGroup(cacheDir, h(2));
  fs.writeFileSync(path.join(cacheDir, `${h(3)}-manifest.json.tmp`), "{}");
  const { groups, skipped } = scanCache(cacheDir);
  assert.deepEqual(
    groups.map((g) => [g.hash, g.legacy, g.sha, g.files.length]),
    [
      [h(1), true, "a".repeat(40), 3],
      [h(2), false, null, 3],
    ],
  );
  assert.deepEqual(skipped, [
    { name: `${h(3)}-manifest.json.tmp`, reason: "unrecognized-name" },
  ]);
});

test("planPrune keeps current hashes, worktree heads and recent groups, then fills the budget non-legacy first", () => {
  const { cacheDir } = makeCache();
  const bytes = 4096;
  writeGroup(cacheDir, h(1), { ageDays: 30, bytes }); // current hash
  writeGroup(cacheDir, h(2), { ageDays: 30, bytes, sha: "b".repeat(40) }); // worktree head
  writeGroup(cacheDir, h(3), { ageDays: 1, bytes }); // recent
  writeGroup(cacheDir, h(4), { ageDays: 10, bytes, dev: true }); // legacy, newer
  writeGroup(cacheDir, h(5), { ageDays: 20, bytes }); // plain, older
  writeGroup(cacheDir, h(6), { ageDays: 40, bytes }); // plain, oldest
  const { groups } = scanCache(cacheDir);
  const plan = planPrune(groups, {
    budgetBytes: groups[0].bytes * 4,
    keepDays: 3,
    keepHashes: new Set([h(1)]),
    keepShas: new Set(["b".repeat(40)]),
    now: NOW,
  });
  const reasons = Object.fromEntries(plan.keep.map((g) => [g.hash, g.reasons]));
  assert.deepEqual(reasons[h(1)], ["current-task-hash"]);
  assert.deepEqual(reasons[h(2)], ["worktree-head"]);
  assert.deepEqual(reasons[h(3)], ["newer-than-3d"]);
  assert.deepEqual(reasons[h(5)], ["within-budget"]);
  assert.deepEqual(
    plan.delete.map((g) => [g.hash, g.reasons[0]]),
    [
      [h(6), "over-budget"],
      [h(4), "over-budget-legacy-dev-cache"],
    ],
    "the legacy group loses to an older non-legacy group; deletions are ordered oldest first",
  );
  assert.equal(
    plan.totals.deleteBytes,
    plan.delete.reduce((s, g) => s + g.bytes, 0),
  );
  assert.equal(
    plan.totals.keepBytes + plan.totals.deleteBytes,
    plan.totals.bytes,
  );
});

test("resolveCacheDir refuses anything that is not a real <root>/.turbo/cache", () => {
  const { root, cacheDir } = makeCache();
  assert.equal(resolveCacheDir(cacheDir), fs.realpathSync(cacheDir));
  const other = path.join(root, "not-cache");
  fs.mkdirSync(other);
  assert.throws(() => resolveCacheDir(other), /not <root>\/\.turbo\/cache/u);
  const link = path.join(root, "linked-cache");
  fs.symlinkSync(cacheDir, link);
  assert.throws(() => resolveCacheDir(link), /not a real directory/u);
  assert.throws(() => resolveCacheDir(path.join(root, "missing")), /ENOENT/u);
});

test("applyPlan deletes only identical files, skips changed or symlinked ones, and is idempotent", () => {
  const { cacheDir } = makeCache();
  writeGroup(cacheDir, h(1), { ageDays: 30 });
  writeGroup(cacheDir, h(2), { ageDays: 30 });
  writeGroup(cacheDir, h(3), { ageDays: 30 });
  const real = fs.realpathSync(cacheDir);
  const plan = {
    cacheDir: real,
    ...planPrune(scanCache(real).groups, {
      budgetBytes: 0,
      keepDays: 0,
      now: NOW,
    }),
  };
  assert.equal(plan.delete.length, 3);
  // Group 2's archive changes after the plan; group 3's archive becomes a symlink.
  fs.writeFileSync(path.join(real, `${h(2)}.tar.zst`), Buffer.alloc(9999, 2));
  fs.unlinkSync(path.join(real, `${h(3)}.tar.zst`));
  fs.symlinkSync(
    path.join(real, `${h(1)}-meta.json`),
    path.join(real, `${h(3)}.tar.zst`),
  );
  const first = applyPlan(plan, real);
  const byHash = Object.fromEntries(first.results.map((r) => [r.hash, r]));
  assert.equal(byHash[h(1)].outcome, "deleted");
  assert.equal(byHash[h(2)].outcome, "partial");
  assert.equal(
    byHash[h(2)].files.find((f) => f.name.endsWith(".tar.zst")).outcome,
    "skipped-changed",
  );
  assert.equal(
    byHash[h(3)].files.find((f) => f.name.endsWith(".tar.zst")).outcome,
    "skipped-not-regular",
  );
  assert.ok(
    fs.existsSync(path.join(real, `${h(2)}.tar.zst`)),
    "a changed archive is never deleted",
  );
  assert.ok(
    fs.lstatSync(path.join(real, `${h(3)}.tar.zst`)).isSymbolicLink(),
    "a symlink is never unlinked",
  );
  const second = applyPlan(plan, real);
  assert.equal(
    second.results.find((r) => r.hash === h(1)).outcome,
    "already-absent",
  );
  assert.equal(second.deletedBytes, 0);
});

test("applyPlan enforces plan identity, containment and the batch limit", () => {
  const { cacheDir } = makeCache();
  for (let i = 1; i <= 3; i += 1)
    writeGroup(cacheDir, h(i), { ageDays: 30 + i, bytes: 8192 });
  const real = fs.realpathSync(cacheDir);
  const plan = {
    cacheDir: real,
    ...planPrune(scanCache(real).groups, {
      budgetBytes: 0,
      keepDays: 0,
      now: NOW,
    }),
  };
  assert.throws(() => applyPlan(plan, path.join(real, "..")), /Plan is for/u);
  assert.throws(() => applyPlan({ version: 2 }, real), /Not a v1 prune plan/u);
  const escaped = JSON.parse(JSON.stringify(plan));
  escaped.delete[0].files[0].name = `../${escaped.delete[0].files[0].name}`;
  assert.throws(() => applyPlan(escaped, real), /Invalid file in plan/u);
  const unlinked = [];
  const limited = applyPlan(plan, real, {
    maxBytes: 1,
    unlink: (f) => unlinked.push(f),
  });
  assert.equal(
    limited.results.filter((r) => r.outcome === "deleted").length,
    1,
    "one group crosses the limit, the rest defer",
  );
  assert.equal(
    limited.results.filter((r) => r.outcome === "deferred-batch-limit").length,
    2,
  );
  assert.ok(unlinked.every((f) => path.dirname(f) === real));
  assert.equal(plan.delete[0].hash, h(3), "oldest group first");
});

test("GIB is a binary gibibyte", () => {
  assert.equal(GIB, 1073741824);
});
