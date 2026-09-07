import console from "node:console";
import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { corpus, goldenQueries, generateScaleCorpus } from "./corpus.mjs";
import { publicCorpus, publicGoldenQueries } from "./public-corpus.mjs";
import { normalize, project, pgDocument, distribution } from "./model.mjs";
import { createPgEngine } from "./pg-engine.mjs";
import { startEngine, stopEngine, resourceSnapshot } from "./isolation.mjs";

const queries = goldenQueries.filter((q) =>
  ["q-01", "q-11", "q-12", "q-14", "q-17", "q-26"].includes(q.id),
);
if (queries.length !== 6) throw new Error("BIGM_QUERY_SET_INCOMPLETE");
const result = {
  evaluationOnly: true,
  trigger:
    "100k rare two-Han LIKE scan was measured above 300 ms; targeted Owner-authorized extension comparison.",
  startedAt: new Date().toISOString(),
  seed: 20320260907,
  qualityEquivalence: [],
  scales: [],
};
const instance = await startEngine("postgres", { withBigm: true });
result.provenance = instance.provenance;
const engine = createPgEngine({
  connection: {
    host: "127.0.0.1",
    port: instance.port,
    user: "postgres",
    database: "p203",
  },
});
try {
  for (const group of [
    {
      name: "official-open-data",
      corpus: publicCorpus,
      queries: publicGoldenQueries,
    },
    { name: "designed-synthetic", corpus, queries: goldenQueries },
  ]) {
    await engine.setup(
      group.corpus
        .map(project)
        .filter((doc) => doc.visible)
        .map(pgDocument),
    );
    const answers = [];
    for (const q of group.queries)
      answers.push(
        (
          await engine.rawSearch(q.query, {
            normalizedQuery: normalize(q.query),
            kind: q.kind,
            mode: "policy",
            limit: 1000,
          })
        ).hits,
      );
    await engine.useBigmIndex();
    let mismatches = 0;
    for (const [i, q] of group.queries.entries()) {
      const answer = (
        await engine.rawSearch(q.query, {
          normalizedQuery: normalize(q.query),
          kind: q.kind,
          mode: "policy",
          limit: 1000,
        })
      ).hits;
      if (JSON.stringify(answer) !== JSON.stringify(answers[i])) mismatches++;
    }
    result.qualityEquivalence.push({
      group: group.name,
      queries: group.queries.length,
      mismatches,
    });
    if (mismatches) throw new Error("BIGM_CHANGED_QUERY_RESULTS");
  }
  for (const count of [10000, 100000]) {
    const docs = generateScaleCorpus(count, result.seed)
      .map(project)
      .filter((doc) => doc.visible)
      .map(pgDocument);
    const stage = { count, indexedVisible: docs.length, configs: {} };
    const started = performance.now();
    await engine.setup(docs);
    stage.baselineInitializeMs = performance.now() - started;
    for (const config of ["trigram-contains-index", "bigram-contains-index"]) {
      let replaceIndexMs = 0;
      if (config === "bigram-contains-index") {
        const startedIndex = performance.now();
        stage.extension = await engine.useBigmIndex();
        replaceIndexMs = performance.now() - startedIndex;
      }
      const before = resourceSnapshot(instance);
      const times = [],
        firstPass = [],
        perQuery = {};
      for (let repetition = 0; repetition <= 5; repetition++) {
        for (const q of queries) {
          const startedQuery = performance.now();
          const answer = await engine.rawSearch(q.query, {
            normalizedQuery: normalize(q.query),
            kind: q.kind,
            mode: "policy",
            limit: 20,
          });
          const elapsed = performance.now() - startedQuery;
          if (repetition === 0)
            firstPass.push({
              id: q.id,
              query: q.query,
              clientMs: elapsed,
              resultCount: answer.hits.length,
              resultDigest: createHash("sha256")
                .update(JSON.stringify(answer.hits))
                .digest("hex"),
            });
          else {
            times.push(elapsed);
            (perQuery[q.id] ??= []).push(elapsed);
          }
        }
      }
      if (times.length !== 30) throw new Error("BIGM_TIMING_SAMPLE_COUNT");
      const after = resourceSnapshot(instance);
      const plans = [];
      for (const q of queries)
        plans.push({
          id: q.id,
          query: q.query,
          ...(await engine.explain(q.query, {
            normalizedQuery: normalize(q.query),
            kind: q.kind,
            mode: "policy",
            limit: 20,
          })),
        });
      stage.configs[config] = {
        replaceIndexMs,
        firstPass,
        warmClientMs: distribution(times),
        perQueryWarmClientMs: Object.fromEntries(
          Object.entries(perQuery).map(([id, values]) => [
            id,
            distribution(values),
          ]),
        ),
        queryCpuSeconds: after.cpuSeconds - before.cpuSeconds,
        resourcesAfter: after,
        stats: await engine.stats(),
        plans,
      };
      console.log(
        JSON.stringify({ stage: "bigm-config-complete", count, config }),
      );
    }
    const [a, b] = Object.values(stage.configs);
    stage.top20Unchanged = a.firstPass.every(
      (row, i) => row.resultDigest === b.firstPass[i].resultDigest,
    );
    if (!stage.top20Unchanged) throw new Error("BIGM_CAPACITY_RESULTS_CHANGED");
    result.scales.push(stage);
    await writeFile(
      ".local/bigm-results.json",
      JSON.stringify(result, null, 2) + "\n",
      { mode: 0o600 },
    );
  }
  result.completedAt = new Date().toISOString();
  await writeFile(
    ".local/bigm-results.json",
    JSON.stringify(result, null, 2) + "\n",
    { mode: 0o600 },
  );
} finally {
  try {
    await engine.close();
  } finally {
    stopEngine(instance);
  }
}
