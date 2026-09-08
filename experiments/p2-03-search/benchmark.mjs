import process from "node:process";
import console from "node:console";
import { performance } from "node:perf_hooks";
import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  corpus,
  goldenQueries,
  generateScaleCorpus,
  primarySyntheticQueryIds,
} from "./corpus.mjs";
import {
  publicCorpus,
  publicGoldenQueries,
  sourceAttributions,
} from "./public-corpus.mjs";
import {
  normalize,
  project,
  pgDocument,
  tier,
  judgedResult,
  summarize,
  distribution,
  normalization,
} from "./model.mjs";
import { loadPrivateInput } from "./private-input.mjs";
import { createPgEngine } from "./pg-engine.mjs";
import { createMeiliEngine } from "./meili-engine.mjs";
import { startEngine, stopEngine, resourceSnapshot } from "./isolation.mjs";

const pgModes = [
  "raw-exact",
  "normalized-exact",
  "prefix",
  "contains",
  "trgm",
  "fts",
  "policy",
];
const scales = (process.env.P203_SCALES ?? "1000,10000,100000")
  .split(",")
  .map(Number);
if (scales.some((n) => ![1000, 10000, 100000].includes(n)))
  throw new Error("INVALID_SCALE");
const selectedEngine = process.env.P203_ENGINE ?? "both";
if (!["both", "postgres", "meili"].includes(selectedEngine))
  throw new Error("INVALID_ENGINE");
const repeats = 5;
const seed = 20320260907;
const primaryIds = new Set(primarySyntheticQueryIds);
const privateInput = await loadPrivateInput(process.env.P203_PRIVATE_INPUT);
const groups = [
  {
    name: "official-open-data",
    sources: publicCorpus,
    queries: publicGoldenQueries,
  },
  { name: "designed-synthetic", sources: corpus, queries: goldenQueries },
  ...(privateInput.documents.length
    ? [
        {
          name: "private-authorized-pilot",
          sources: privateInput.documents,
          queries: privateInput.queries,
        },
      ]
    : []),
];
const digest = (v) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
const report = {
  schemaVersion: 1,
  evaluationOnly: true,
  startedAt: new Date().toISOString(),
  seed,
  environment: {
    node: process.version,
    runnerArchitecture: process.arch,
    runnerPlatform: process.platform,
    sequentialEngines: true,
    cpuPerEngine: 2,
    memoryPerEngineBytes: 2147483648,
    concurrency: 1,
    warmRepeats: repeats,
  },
  normalization,
  publicCorpusDigest: digest(publicCorpus),
  syntheticCorpusDigest: digest(corpus),
  primaryGoldenDigest: digest([
    ...publicGoldenQueries,
    ...goldenQueries.filter((q) => primaryIds.has(q.id)),
  ]),
  primaryGoldenCount: publicGoldenQueries.length + primaryIds.size,
  sourceAttributions,
  privateInput: {
    status: privateInput.status,
    records: privateInput.documents.length,
    probes: privateInput.queries.length,
    labeling: privateInput.labeling,
  },
  measurementNotes: [
    "Quality corpora are evaluated separately. Official, private, and fictional instances are not merged by presumed identity.",
    "Primary Golden contains 24 official queries and 26 designed boundary queries. Remaining synthetic queries are supplemental.",
    "Scale corpora are synthetic capacity probes, not labeled relevance corpora.",
    "First pass follows indexing; it is not a proven OS-cold-cache run. Warm repeats use the same single client.",
    "Adapter wall latency includes its local database protocol or HTTP transport; no formal Search API exists or is timed.",
    "CPU is Linux container cgroup usage; memory records anonymous memory and total cgroup peak including file cache, not per-process RSS.",
    "Resources include all experimental PostgreSQL indexes, not a minimized final deployment schema.",
    "Private input text, query text, source paths, operational identities, URLs, and connection credentials are excluded from exported results.",
    "Post-query Meili tier ordering is evaluated only on exhaustive small-corpus hits, not a proposed top-N production reranker.",
  ],
  engines: {},
  failures: [],
};
await mkdir(".local", { recursive: true, mode: 0o700 });
async function checkpoint() {
  await writeFile(
    ".local/results.json",
    JSON.stringify(report, null, 2) + "\n",
    { mode: 0o600 },
  );
}
function progress(stage, extra = {}) {
  console.log(JSON.stringify({ stage, ...extra }));
}
function safeError(error) {
  return /^[A-Z][A-Z0-9_]+$/.test(error?.message ?? "")
    ? error.message
    : "EVALUATION_UNCLASSIFIED_ERROR";
}
function measuredRow(q, result, documents, mode, group) {
  return {
    id: q.id,
    category: q.category,
    mode,
    group,
    primary:
      group === "official-open-data" ||
      (group === "designed-synthetic" && primaryIds.has(q.id)),
    ...(q.private ? {} : { query: q.query }),
    ...judgedResult(q, result.hits, documents),
    clientTimeMs: result.clientTimeMs ?? result.wallTimeMs,
    processingTimeMs: result.processingTimeMs ?? null,
    degraded: result.degraded ?? false,
  };
}
async function quality(engine, engineName, instance) {
  const rows = [];
  const setup = [];
  for (const group of groups) {
    const docs = group.sources.map(project);
    const documents = new Map(docs.map((d) => [d.id, d]));
    const started = performance.now();
    const visibleDocs = docs.filter((doc) => doc.visible);
    const info = await engine.setup(
      engineName === "postgres" ? visibleDocs.map(pgDocument) : visibleDocs,
      { profile: "strict" },
    );
    setup.push({
      group: group.name,
      documents: docs.length,
      initializeMs: performance.now() - started,
      info,
    });
    progress("quality-corpus-ready", {
      engine: engineName,
      group: group.name,
      records: docs.length,
    });
    if (engineName === "postgres") {
      for (const q of group.queries) {
        for (const mode of pgModes) {
          const result = await engine.rawSearch(q.query, {
            normalizedQuery: normalize(q.query),
            kind: q.kind,
            mode,
            limit: 1000,
          });
          rows.push(measuredRow(q, result, documents, mode, group.name));
        }
      }
    } else {
      for (const mode of ["strict", "relaxed"]) {
        if (mode === "relaxed") await engine.configureProfile(mode);
        for (const q of group.queries) {
          const startedQuery = performance.now();
          const result = await engine.rawSearch(normalize(q.query), {
            kind: q.kind,
            mode,
            limit: 1000,
          });
          result.wallTimeMs = performance.now() - startedQuery;
          rows.push(measuredRow(q, result, documents, mode, group.name));
          const fullCandidateSet = result.hits.length < 1000;
          if (!fullCandidateSet)
            throw new Error("QUALITY_CANDIDATE_SET_TRUNCATED");
          const ranked = [...result.hits].sort(
            (a, b) =>
              tier(documents.get(a.id), q.query) -
                tier(documents.get(b.id), q.query) || a.id.localeCompare(b.id),
          );
          rows.push(
            measuredRow(
              q,
              { ...result, hits: ranked },
              documents,
              mode + "-tiers",
              group.name,
            ),
          );
        }
      }
    }
  }
  const summaries = {};
  for (const group of groups.map((g) => g.name)) {
    summaries[group] = {};
    for (const mode of [...new Set(rows.map((r) => r.mode))]) {
      const selection = rows.filter(
        (r) => r.mode === mode && r.group === group,
      );
      summaries[group][mode] = {
        ...summarize(selection),
        primary: summarize(selection.filter((r) => r.primary)),
        latencyMs: distribution(
          selection.map((r) => r.clientTimeMs).filter(Number.isFinite),
        ),
      };
    }
  }
  return { summaries, rows, setup, resourcesAfter: resourceSnapshot(instance) };
}
async function updates(engine, engineName, documents) {
  // Disjoint literal tokens isolate update visibility from Chinese segmentation.
  const sample = {
    ...documents[0],
    id: "incremental-probe",
    title: "p203insertneedleunique",
    aliases: [],
    normalizedTitle: "p203insertneedleunique",
    normalizedAliases: [],
    visible: true,
  };
  const convert = (d) => (engineName === "postgres" ? pgDocument(d) : d);
  const options = (query) =>
    engineName === "postgres"
      ? { normalizedQuery: normalize(query), mode: "policy", limit: 1000 }
      : { mode: "strict", limit: 1000 };
  const stages = [];
  let started = performance.now();
  await engine.update(convert(sample));
  let hits = (await engine.rawSearch(sample.title, options(sample.title))).hits;
  stages.push({
    operation: "insert-to-queryable",
    ms: performance.now() - started,
    passed: hits.some((h) => h.id === sample.id),
  });
  const previousTitle = sample.title;
  sample.title = "p203replaceneedleunique";
  sample.normalizedTitle = normalize(sample.title);
  started = performance.now();
  await engine.update(convert(sample));
  hits = (await engine.rawSearch(sample.title, options(sample.title))).hits;
  const oldHits = (
    await engine.rawSearch(previousTitle, options(previousTitle))
  ).hits;
  stages.push({
    operation: "replace-to-queryable",
    ms: performance.now() - started,
    passed:
      hits.some((h) => h.id === sample.id) &&
      !oldHits.some((h) => h.id === sample.id),
  });
  started = performance.now();
  await engine.remove(sample.id);
  hits = (await engine.rawSearch(sample.title, options(sample.title))).hits;
  stages.push({
    operation: "delete-to-invisible",
    ms: performance.now() - started,
    passed: !hits.some((h) => h.id === sample.id),
  });
  started = performance.now();
  for (let i = 0; i < 10; i++)
    await engine.update(convert({ ...sample, id: `incremental-batch-${i}` }));
  hits = (await engine.rawSearch(sample.title, options(sample.title))).hits;
  stages.push({
    operation: "ten-sequential-updates-to-queryable",
    ms: performance.now() - started,
    passed:
      hits.filter((h) => h.id.startsWith("incremental-batch-")).length === 10,
  });
  return stages;
}
async function capacity(engine, engineName, instance) {
  const results = [];
  const queryIds = [
    "q-01",
    "q-11",
    "q-12",
    "q-14",
    "q-17",
    "q-19",
    "q-26",
    "q-28",
    "q-29",
    "q-30",
    "q-41",
    "q-46",
  ];
  const queries = goldenQueries.filter((q) => queryIds.includes(q.id));
  if (queries.length !== 12 || new Set(queries.map((q) => q.id)).size !== 12)
    throw new Error("CAPACITY_QUERY_SET_INCOMPLETE");
  for (const count of scales) {
    const normalizeStarted = performance.now();
    const runnerBefore = process.resourceUsage();
    const docs = generateScaleCorpus(count, seed).map(project);
    const normalizeMs = performance.now() - normalizeStarted;
    const runnerAfter = process.resourceUsage();
    const before = resourceSnapshot(instance);
    progress("capacity-initializing", { engine: engineName, count });
    const initialized = performance.now();
    const visibleDocs = docs.filter((doc) => doc.visible);
    const info = await engine.setup(
      engineName === "postgres" ? visibleDocs.map(pgDocument) : visibleDocs,
      { profile: "strict" },
    );
    const initializeMs = performance.now() - initialized;
    const afterInitialize = resourceSnapshot(instance);
    const modes = engineName === "postgres" ? pgModes : ["strict"];
    const timings = {};
    for (const mode of modes) {
      const samples = [],
        firstPass = [],
        perQuery = {};
      const queryResourcesBefore = resourceSnapshot(instance);
      for (let repetition = 0; repetition <= repeats; repetition++) {
        for (const q of queries) {
          const start = performance.now();
          const result = await engine.rawSearch(
            engineName === "postgres" ? q.query : normalize(q.query),
            {
              normalizedQuery: normalize(q.query),
              mode,
              kind: q.kind,
              limit: 20,
            },
          );
          const elapsed = performance.now() - start;
          const sample = {
            id: q.id,
            query: q.query,
            clientTimeMs: elapsed,
            processingTimeMs: result.processingTimeMs ?? null,
            resultCount: result.hits.length,
            degraded: result.degraded ?? false,
          };
          if (repetition === 0) firstPass.push(sample);
          else {
            samples.push(elapsed);
            (perQuery[q.id] ??= []).push(elapsed);
          }
        }
      }
      const queryResourcesAfter = resourceSnapshot(instance);
      const plans = [];
      if (engineName === "postgres") {
        for (const q of queries.filter((q) =>
          ["q-01", "q-11", "q-12", "q-17"].includes(q.id),
        )) {
          plans.push({
            queryId: q.id,
            query: q.query,
            ...(await engine.explain(q.query, {
              normalizedQuery: normalize(q.query),
              kind: q.kind,
              mode,
              limit: 20,
            })),
          });
        }
      }
      timings[mode] = {
        firstPass,
        warmClientMs: distribution(samples),
        perQueryWarmClientMs: Object.fromEntries(
          Object.entries(perQuery).map(([id, values]) => [
            id,
            distribution(values),
          ]),
        ),
        queryCpuSeconds:
          queryResourcesAfter.cpuSeconds - queryResourcesBefore.cpuSeconds,
        queryResourcesBefore,
        queryResourcesAfter,
        plans,
      };
      if (samples.length !== queries.length * repeats)
        throw new Error("CAPACITY_SAMPLE_COUNT_MISMATCH");
      progress("capacity-mode-complete", { engine: engineName, count, mode });
    }
    const afterQueries = resourceSnapshot(instance);
    const updateResults = await updates(engine, engineName, docs);
    if (updateResults.some((result) => !result.passed))
      throw new Error("UPDATE_VISIBILITY_CHECK_FAILED");
    const stats = await engine.stats();
    results.push({
      count,
      indexedVisible: docs.filter((d) => d.visible).length,
      normalizeMs,
      generationAndNormalization: {
        userCpuMs: (runnerAfter.userCPUTime - runnerBefore.userCPUTime) / 1000,
        systemCpuMs:
          (runnerAfter.systemCPUTime - runnerBefore.systemCPUTime) / 1000,
        runnerLifetimePeakRssKiB: runnerAfter.maxRSS,
      },
      initializeMs,
      info,
      stats,
      resources: {
        before,
        afterInitialize,
        afterQueries,
        afterUpdates: resourceSnapshot(instance),
        initializeCpuSeconds: afterInitialize.cpuSeconds - before.cpuSeconds,
        queryCpuSeconds: afterQueries.cpuSeconds - afterInitialize.cpuSeconds,
      },
      timings,
      updates: updateResults,
    });
    report.engines[engineName].capacity = results;
    await checkpoint();
  }
  return results;
}

let active;
try {
  for (const engineName of ["postgres", "meili"].filter(
    (name) => selectedEngine === "both" || selectedEngine === name,
  )) {
    active = await startEngine(engineName);
    report.engines[engineName] = {
      provenance: active.provenance,
      idleResources: resourceSnapshot(active),
    };
    const engine =
      engineName === "postgres"
        ? createPgEngine({
            connection: {
              host: "127.0.0.1",
              port: active.port,
              user: "postgres",
              database: "p203",
            },
          })
        : createMeiliEngine({
            url: `http://127.0.0.1:${active.port}`,
            ephemeralKey: active.ephemeralKey,
          });
    try {
      report.engines[engineName].quality = await quality(
        engine,
        engineName,
        active,
      );
      await checkpoint();
      report.engines[engineName].capacity = await capacity(
        engine,
        engineName,
        active,
      );
      await engine.close?.();
    } finally {
      stopEngine(active);
      active = null;
    }
  }
  report.completedAt = new Date().toISOString();
  await checkpoint();
  progress("evaluation-complete", {
    engines: Object.keys(report.engines),
    primaryGoldenCount: report.primaryGoldenCount,
  });
} catch (error) {
  report.failures.push({
    category: safeError(error),
    at: new Date().toISOString(),
  });
  await checkpoint();
  progress("evaluation-failed", { category: safeError(error) });
  process.exitCode = 1;
} finally {
  if (active) {
    try {
      stopEngine(active);
    } catch {
      progress("cleanup-failed");
    }
  }
}
