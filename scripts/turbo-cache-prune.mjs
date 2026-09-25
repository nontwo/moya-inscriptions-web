#!/usr/bin/env node
/**
 * Budgeted, dry-run-by-default maintenance for the shared local Turborepo
 * cache (`<repo>/.turbo/cache`, shared by every linked worktree).
 *
 *   node scripts/turbo-cache-prune.mjs plan  [--budget-gib 10] [--keep-days 3]
 *        [--plan-file <path>] [--hashes-file <path>] [--skip-dry-run] [--json]
 *   node scripts/turbo-cache-prune.mjs apply --from-plan <plan.json>
 *        [--max-gib <n>] [--result-file <path>] [--allow-active]
 *
 * `plan` never deletes. It keeps an archive group when any existing registered
 * worktree currently produces its task hash (a read-only `turbo --dry-run`),
 * when its meta records a worktree's current HEAD, or when it is newer than the
 * retention window; the newest remaining history is then retained until the
 * size budget is full, dropping legacy archives that contain compiler or
 * development cache paths first. `apply` deletes exactly the reviewed plan
 * after re-checking every file's identity, and is idempotent.
 *
 * Recovery for a deleted archive is a rebuild; nothing here is source.
 * This is a workstation policy, not a Turbo requirement, and it is not a lock:
 * a concurrent `turbo run` is refused by a best-effort check only.
 */
import { execFileSync } from "node:child_process";
import console from "node:console";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const GIB = 1024 ** 3;
export const HASH_RE = /^[0-9a-f]{16}$/u;
export const SUFFIXES = Object.freeze([
  ".tar.zst",
  "-manifest.json",
  "-meta.json",
]);
export const DEV_CACHE_RE = /(?:^|\/)(?:\.next|dist)\/(?:cache|dev)\//u;
export const TASKS = Object.freeze(["build", "lint", "typecheck", "test"]);
const ENTRY_RE = /^([0-9a-f]{16})(\.tar\.zst|-manifest\.json|-meta\.json)$/u;

const git = (cwd, ...args) =>
  execFileSync(
    "git",
    ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args],
    {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_OPTIONAL_LOCKS: "0",
        GIT_TERMINAL_PROMPT: "0",
      },
      timeout: 20_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );

/** The main checkout that owns `.turbo/cache` for every linked worktree. */
export function repoRootFrom(cwd = process.cwd()) {
  const common = git(cwd, "rev-parse", "--git-common-dir").trim();
  return path.dirname(fs.realpathSync(path.resolve(cwd, common)));
}

/** Resolves and guards the cache directory: a real `.turbo/cache` directory. */
export function resolveCacheDir(explicit, cwd = process.cwd()) {
  const candidate = explicit
    ? path.resolve(cwd, explicit)
    : path.join(repoRootFrom(cwd), ".turbo", "cache");
  const st = fs.lstatSync(candidate);
  if (st.isSymbolicLink() || !st.isDirectory())
    throw new Error(`Cache directory is not a real directory: ${candidate}`);
  const real = fs.realpathSync(candidate);
  if (
    path.basename(real) !== "cache" ||
    path.basename(path.dirname(real)) !== ".turbo"
  )
    throw new Error(
      `Refusing a directory that is not <root>/.turbo/cache: ${real}`,
    );
  return real;
}

/** HEAD of every registered worktree whose directory still exists. */
export function worktreeHeads(repoRoot) {
  const heads = new Set();
  const dirs = [];
  let current = null;
  for (const line of git(repoRoot, "worktree", "list", "--porcelain").split(
    "\n",
  )) {
    if (line.startsWith("worktree "))
      current = { dir: line.slice(9), head: null };
    else if (line.startsWith("HEAD ") && current) current.head = line.slice(5);
    else if (line === "" && current) {
      if (current.head && fs.existsSync(current.dir)) {
        heads.add(current.head);
        dirs.push(current.dir);
      }
      current = null;
    }
  }
  if (current?.head && fs.existsSync(current.dir)) {
    heads.add(current.head);
    dirs.push(current.dir);
  }
  return { heads, dirs };
}

/** Task hashes each existing worktree would use today (read-only dry runs). */
export function currentTaskHashes(
  dirs,
  { tasks = TASKS, log = () => {} } = {},
) {
  const hashes = new Set();
  const covered = [];
  for (const dir of dirs) {
    const bin = path.join(dir, "node_modules", ".bin", "turbo");
    if (!fs.existsSync(bin)) continue;
    try {
      const out = execFileSync(
        bin,
        [
          "run",
          ...tasks,
          "--dry-run=json",
          "--cache=local:r",
          "--no-update-notifier",
        ],
        {
          cwd: dir,
          encoding: "utf8",
          timeout: 120_000,
          maxBuffer: 64 * 1024 * 1024,
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      const json = JSON.parse(out.slice(out.indexOf("{")));
      for (const task of json.tasks ?? [])
        if (HASH_RE.test(task.hash)) hashes.add(task.hash);
      covered.push(dir);
    } catch (error) {
      log(`dry-run skipped for ${dir}: ${error.message.split("\n")[0]}`);
    }
  }
  return { hashes, covered };
}

const lstatFile = (dir, name) => {
  const file = path.join(dir, name);
  if (path.dirname(file) !== dir || !ENTRY_RE.test(name)) return null;
  let st;
  try {
    st = fs.lstatSync(file);
  } catch {
    return null;
  }
  if (!st.isFile() || st.isSymbolicLink()) return { name, unsafe: true };
  return {
    name,
    size: st.size,
    allocated: st.blocks * 512,
    ino: st.ino,
    dev: st.dev,
    mtimeMs: st.mtimeMs,
  };
};

/** Groups `<hash>.tar.zst` + `-manifest.json` + `-meta.json` and reads metadata. */
export function scanCache(cacheDir) {
  const groups = [];
  const skipped = [];
  for (const name of fs.readdirSync(cacheDir).sort()) {
    const match = ENTRY_RE.exec(name);
    if (!match) {
      skipped.push({ name, reason: "unrecognized-name" });
      continue;
    }
    if (match[2] !== ".tar.zst") continue;
    const hash = match[1];
    const files = SUFFIXES.map((suffix) =>
      lstatFile(cacheDir, hash + suffix),
    ).filter(Boolean);
    if (files.some((f) => f.unsafe)) {
      skipped.push({ name, reason: "not-a-regular-file" });
      continue;
    }
    const archive = files[0];
    let sha = null;
    let legacy = false;
    try {
      sha =
        JSON.parse(
          fs.readFileSync(path.join(cacheDir, `${hash}-meta.json`), "utf8"),
        ).sha ?? null;
    } catch {
      /* no meta: still prunable, never a keep reason */
    }
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(cacheDir, `${hash}-manifest.json`), "utf8"),
      );
      legacy = Object.keys(manifest.files ?? {}).some((p) =>
        DEV_CACHE_RE.test(p),
      );
    } catch {
      /* no manifest: treated as non-legacy */
    }
    groups.push({
      hash,
      sha,
      legacy,
      mtimeMs: archive.mtimeMs,
      bytes: files.reduce((sum, f) => sum + f.allocated, 0),
      files,
    });
  }
  return { groups, skipped };
}

/** Pure retention decision. */
export function planPrune(groups, policy) {
  const {
    budgetBytes,
    keepDays,
    keepHashes = new Set(),
    keepShas = new Set(),
    now = Date.now(),
  } = policy;
  const cutoff = now - keepDays * 86_400_000;
  const keep = [];
  const rest = [];
  for (const g of groups) {
    const reasons = [];
    if (keepHashes.has(g.hash)) reasons.push("current-task-hash");
    if (g.sha && keepShas.has(g.sha)) reasons.push("worktree-head");
    if (g.mtimeMs >= cutoff) reasons.push(`newer-than-${keepDays}d`);
    if (reasons.length) keep.push({ ...g, reasons });
    else rest.push(g);
  }
  let used = keep.reduce((s, g) => s + g.bytes, 0);
  rest.sort(
    (a, b) => Number(a.legacy) - Number(b.legacy) || b.mtimeMs - a.mtimeMs,
  );
  const del = [];
  for (const g of rest) {
    if (used + g.bytes <= budgetBytes) {
      used += g.bytes;
      keep.push({ ...g, reasons: ["within-budget"] });
    } else
      del.push({
        ...g,
        reasons: [g.legacy ? "over-budget-legacy-dev-cache" : "over-budget"],
      });
  }
  del.sort((a, b) => a.mtimeMs - b.mtimeMs);
  const total = groups.reduce((s, g) => s + g.bytes, 0);
  const deleteBytes = del.reduce((s, g) => s + g.bytes, 0);
  const strip = ({ files, ...g }) => ({
    ...g,
    mtime: new Date(g.mtimeMs).toISOString(),
    files,
  });
  return {
    version: 1,
    policy: {
      budgetBytes,
      keepDays,
      keepHashes: keepHashes.size,
      keepShas: keepShas.size,
    },
    totals: {
      groups: groups.length,
      bytes: total,
      keepGroups: keep.length,
      keepBytes: total - deleteBytes,
      deleteGroups: del.length,
      deleteBytes,
    },
    keep: keep.map((g) => ({
      hash: g.hash,
      sha: g.sha,
      legacy: g.legacy,
      bytes: g.bytes,
      reasons: g.reasons,
      mtime: new Date(g.mtimeMs).toISOString(),
    })),
    delete: del.map(strip),
  };
}

/** Best-effort quiescence signal; documented as a check, not a proof. */
export function activeWriters(
  cacheDir,
  { windowMs = 30_000, now = Date.now() } = {},
) {
  const signals = [];
  try {
    const pids = execFileSync("pgrep", ["-x", "turbo"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (pids) signals.push(`turbo processes: ${pids.split("\n").join(",")}`);
  } catch {
    /* no matching process */
  }
  for (const name of fs.readdirSync(cacheDir)) {
    const st = fs.lstatSync(path.join(cacheDir, name));
    if (now - st.mtimeMs < windowMs) {
      signals.push(`recent write: ${name}`);
      break;
    }
  }
  return signals;
}

/** Deletes exactly the reviewed groups; re-checks identity; idempotent. */
export function applyPlan(
  plan,
  cacheDir,
  { maxBytes = Infinity, unlink = fs.unlinkSync } = {},
) {
  if (plan?.version !== 1 || !Array.isArray(plan.delete))
    throw new Error("Not a v1 prune plan");
  if (plan.cacheDir !== cacheDir)
    throw new Error(`Plan is for ${plan.cacheDir}, not ${cacheDir}`);
  const results = [];
  let deletedBytes = 0;
  let deletedLogicalBytes = 0;
  for (const group of plan.delete) {
    if (deletedBytes >= maxBytes) {
      results.push({ hash: group.hash, outcome: "deferred-batch-limit" });
      continue;
    }
    if (!HASH_RE.test(group.hash))
      throw new Error(`Invalid hash in plan: ${group.hash}`);
    const outcomes = [];
    for (const planned of group.files) {
      if (!planned.name.startsWith(group.hash) || !ENTRY_RE.test(planned.name))
        throw new Error(`Invalid file in plan: ${planned.name}`);
      const file = path.join(cacheDir, planned.name);
      if (path.dirname(file) !== cacheDir)
        throw new Error(`Escapes cache dir: ${planned.name}`);
      let st;
      try {
        st = fs.lstatSync(file);
      } catch (error) {
        if (error.code === "ENOENT") {
          outcomes.push({ name: planned.name, outcome: "already-absent" });
          continue;
        }
        throw error;
      }
      if (!st.isFile() || st.isSymbolicLink()) {
        outcomes.push({ name: planned.name, outcome: "skipped-not-regular" });
        continue;
      }
      if (
        st.ino !== planned.ino ||
        st.dev !== planned.dev ||
        st.size !== planned.size ||
        st.mtimeMs !== planned.mtimeMs
      ) {
        outcomes.push({ name: planned.name, outcome: "skipped-changed" });
        continue;
      }
      unlink(file);
      deletedBytes += planned.allocated;
      deletedLogicalBytes += planned.size;
      outcomes.push({
        name: planned.name,
        outcome: "deleted",
        bytes: planned.allocated,
      });
    }
    results.push({
      hash: group.hash,
      outcome: outcomes.every((o) => o.outcome === "deleted")
        ? "deleted"
        : outcomes.every((o) => o.outcome === "already-absent")
          ? "already-absent"
          : "partial",
      files: outcomes,
    });
  }
  return { deletedBytes, deletedLogicalBytes, results };
}

function parseArgs(argv) {
  const opts = {
    mode: "plan",
    budgetGib: 10,
    keepDays: 3,
    json: false,
    skipDryRun: false,
    allowActive: false,
    maxGib: Infinity,
  };
  const rest = [...argv];
  if (rest[0] === "plan" || rest[0] === "apply") opts.mode = rest.shift();
  while (rest.length) {
    const arg = rest.shift();
    const value = () => {
      const v = rest.shift();
      if (v === undefined) throw new Error(`Missing value for ${arg}`);
      return v;
    };
    if (arg === "--budget-gib") opts.budgetGib = Number(value());
    else if (arg === "--keep-days") opts.keepDays = Number(value());
    else if (arg === "--max-gib") opts.maxGib = Number(value());
    else if (arg === "--cache-dir") opts.cacheDir = value();
    else if (arg === "--plan-file") opts.planFile = value();
    else if (arg === "--from-plan") opts.fromPlan = value();
    else if (arg === "--result-file") opts.resultFile = value();
    else if (arg === "--hashes-file") opts.hashesFile = value();
    else if (arg === "--skip-dry-run") opts.skipDryRun = true;
    else if (arg === "--allow-active") opts.allowActive = true;
    else if (arg === "--json") opts.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  for (const [k, v] of Object.entries({
    budgetGib: opts.budgetGib,
    keepDays: opts.keepDays,
    maxGib: opts.maxGib,
  }))
    if (!(v >= 0)) throw new Error(`Invalid numeric option ${k}`);
  return opts;
}

const fmt = (bytes) => `${(bytes / GIB).toFixed(3)} GiB`;

function main(argv) {
  const opts = parseArgs(argv);
  const cacheDir = resolveCacheDir(opts.cacheDir);
  const repoRoot = path.dirname(path.dirname(cacheDir));
  const log = (m) => opts.json || console.error(m);
  if (opts.mode === "plan") {
    const { heads, dirs } = worktreeHeads(repoRoot);
    const keepHashes = new Set();
    if (opts.hashesFile)
      for (const h of fs.readFileSync(opts.hashesFile, "utf8").split("\n"))
        if (HASH_RE.test(h.trim())) keepHashes.add(h.trim());
    let covered = [];
    if (!opts.skipDryRun) {
      const r = currentTaskHashes(dirs, { log });
      for (const h of r.hashes) keepHashes.add(h);
      covered = r.covered;
    }
    const { groups, skipped } = scanCache(cacheDir);
    const plan = {
      generatedAt: new Date().toISOString(),
      cacheDir,
      worktrees: {
        registeredExisting: dirs.length,
        dryRunCovered: covered.length,
        heads: heads.size,
      },
      ...planPrune(groups, {
        budgetBytes: opts.budgetGib * GIB,
        keepDays: opts.keepDays,
        keepHashes,
        keepShas: heads,
      }),
      skipped,
    };
    if (opts.planFile)
      fs.writeFileSync(opts.planFile, JSON.stringify(plan, null, 2), {
        mode: 0o600,
      });
    if (opts.json) console.log(JSON.stringify(plan));
    else {
      const t = plan.totals;
      console.log(`turbo cache ${cacheDir}`);
      console.log(
        `groups ${t.groups} (${fmt(t.bytes)}) · keep ${t.keepGroups} (${fmt(t.keepBytes)}) · delete ${t.deleteGroups} (${fmt(t.deleteBytes)})`,
      );
      console.log(
        `keep reasons: current task hashes ${keepHashes.size} from ${covered.length} worktree dry-runs; ${heads.size} worktree HEADs; newer than ${opts.keepDays}d; budget ${opts.budgetGib} GiB`,
      );
      if (skipped.length)
        console.log(
          `skipped entries: ${skipped.length} (${skipped
            .map((s) => s.name)
            .slice(0, 5)
            .join(", ")}${skipped.length > 5 ? ", …" : ""})`,
        );
      console.log(
        opts.planFile
          ? `plan written: ${opts.planFile}`
          : "dry run only; pass --plan-file to write a reviewable plan, then apply --from-plan",
      );
    }
    return 0;
  }
  if (!opts.fromPlan) throw new Error("apply requires --from-plan <plan.json>");
  const plan = JSON.parse(fs.readFileSync(opts.fromPlan, "utf8"));
  const signals = activeWriters(cacheDir);
  if (signals.length && !opts.allowActive)
    throw new Error(
      `Cache may be in use (${signals.join("; ")}); rerun when quiet or pass --allow-active`,
    );
  const result = {
    appliedAt: new Date().toISOString(),
    cacheDir,
    fromPlan: path.resolve(opts.fromPlan),
    maxBytes: opts.maxGib * GIB,
    ...applyPlan(plan, cacheDir, { maxBytes: opts.maxGib * GIB }),
  };
  if (opts.resultFile)
    fs.writeFileSync(opts.resultFile, JSON.stringify(result, null, 2), {
      mode: 0o600,
    });
  const counts = {};
  for (const r of result.results)
    counts[r.outcome] = (counts[r.outcome] ?? 0) + 1;
  if (opts.json) console.log(JSON.stringify(result));
  else
    console.log(
      `applied: ${JSON.stringify(counts)} · freed ${fmt(result.deletedBytes)} allocated (${fmt(result.deletedLogicalBytes)} logical)${opts.resultFile ? ` · result ${opts.resultFile}` : ""}`,
    );
  return 0;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(`turbo-cache-prune: ${error.message}`);
    process.exitCode = 1;
  }
}
