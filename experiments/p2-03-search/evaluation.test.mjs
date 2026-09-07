import assert from "node:assert/strict";
import test from "node:test";

import {
  corpus,
  generateScaleCorpus,
  goldenQueries,
  primarySyntheticQueryIds,
} from "./corpus.mjs";
import {
  distribution,
  judgedResult,
  normalize,
  pgDocument,
  project,
  summarize,
  tier,
} from "./model.mjs";

const anchor = (number) => {
  const id = `syn-${String(number).padStart(3, "0")}`;
  const source = corpus.find((record) => record.id === id);
  assert.ok(source, "The manually selected anchor must exist");
  return source;
};
const query = (number) => {
  const id = `q-${String(number).padStart(2, "0")}`;
  const selected = goldenQueries.find((item) => item.id === id);
  assert.ok(selected, "The manually selected judgment must exist");
  return selected;
};

test("the index projection admits approved text and omits internal/media carriers", () => {
  const source = {
    ...globalThis.structuredClone(anchor(1)),
    internalNotes: "FICTIONAL_INTERNAL_SENTINEL",
    privatePath: "FICTIONAL_PATH_SENTINEL",
    credentials: { token: "FICTIONAL_CREDENTIAL_SENTINEL" },
    media: [{ id: "fictional-media", src: "FICTIONAL_MEDIA_SENTINEL" }],
    objectKey: "FICTIONAL_OBJECT_SENTINEL",
    sourceCitations: [{ url: "FICTIONAL_CITATION_SENTINEL" }],
  };
  const projected = pgDocument(project(source));
  const serialized = JSON.stringify(projected);
  assert.ok(projected.body.includes(source.summary));
  assert.ok(projected.structuredText.includes(source.contributors[0].name));
  for (const forbidden of [
    "internalNotes",
    "privatePath",
    "credentials",
    "media",
    "objectKey",
    "sourceCitations",
    "provenance",
    "fictional",
  ])
    assert.equal(Object.hasOwn(projected, forbidden), false);
  assert.equal(serialized.includes("SENTINEL"), false);
});

test("every non-VALUE state excludes its payload from searchable text", () => {
  for (const state of ["UNSUPPLIED", "UNKNOWN", "NOT_APPLICABLE", "CLEAR"]) {
    const source = globalThis.structuredClone(anchor(20));
    for (const field of [
      "dynasty",
      "dateText",
      "scriptStyle",
      "province",
      "prefecture",
      "county",
      "currentLocation",
      "currentCustodian",
      "transcription",
      "summary",
      "description",
    ])
      source[field] = { state, value: "FICTIONAL_NON_VALUE_SENTINEL" };
    assert.equal(
      JSON.stringify(pgDocument(project(source))).includes("SENTINEL"),
      false,
    );
  }
});

test("a transcription string without explicit VALUE is not supplied content", () => {
  const source = {
    ...globalThis.structuredClone(anchor(40)),
    transcription: "FICTIONAL_UNTAGGED_SENTINEL",
  };
  assert.equal(project(source).body, "");
  source.transcription = { state: "VALUE", value: "合成释文已供应" };
  assert.equal(project(source).body, "合成释文已供应");
});

test("normalization creates a separate copy and does not rewrite source identity or aliases", () => {
  const source = globalThis.structuredClone(anchor(3));
  const before = globalThis.structuredClone(source);
  const projected = project(source);
  assert.equal(projected.title, "雲嶺記");
  assert.equal(projected.normalizedTitle, "云岭记");
  assert.equal(projected.id, source.id);
  projected.aliases.push("仅修改投影的合成别名");
  assert.deepEqual(source, before);
  assert.equal(normalize(normalize("雲嶺記")), normalize("雲嶺記"));
});

test("raw title outranks a raw approved alias and a normalized exact collision", () => {
  const rawTitle = tier(project(anchor(1)), "云岭记");
  const rawAlias = tier(project(anchor(2)), "云岭记");
  const normalizedTitle = tier(project(anchor(3)), "云岭记");
  const partialTitle = tier(project(anchor(4)), "云岭记");
  assert.ok(rawTitle < rawAlias);
  assert.ok(rawAlias < normalizedTitle);
  assert.ok(normalizedTitle < partialTitle);
  assert.ok(partialTitle < tier(project(anchor(5)), "云岭记"));
  assert.ok(
    tier(project(anchor(5)), "云岭记") < tier(project(anchor(6)), "云岭记"),
  );
});

test("raw priority follows the submitted script despite equal normalized titles", () => {
  const traditional = project(anchor(27));
  const simplified = project(anchor(28));
  const alias = project(anchor(29));
  assert.equal(traditional.normalizedTitle, simplified.normalizedTitle);
  assert.ok(tier(traditional, "遠山帖") < tier(alias, "遠山帖"));
  assert.ok(tier(alias, "遠山帖") < tier(simplified, "遠山帖"));
  assert.ok(tier(simplified, "远山帖") < tier(traditional, "远山帖"));
});

test("person and work terms must both occur in the same document", () => {
  const input = query(5);
  assert.deepEqual(input.expectedIds, ["syn-009"]);
  assert.equal(tier(project(anchor(9)), input.query), 4);
  assert.equal(tier(project(anchor(9)), query(6).query), 4);
  for (const number of [1, 10, 11]) {
    assert.equal(tier(project(anchor(number)), input.query), 6);
  }
  assert.equal(tier(project(anchor(21)), query(27).query), 4);
  assert.equal(tier(project(anchor(20)), query(27).query), 6);
});

test("title AND outranks mixed title/body AND; separate documents do not satisfy AND", () => {
  assert.equal(tier(project(anchor(37)), query(44).query), 3);
  assert.equal(tier(project(anchor(38)), query(44).query), 5);
  assert.equal(tier(project(anchor(37)), query(45).query), 3);
  assert.equal(tier(project(anchor(38)), query(45).query), 5);
  for (const number of [9, 17]) {
    assert.equal(tier(project(anchor(number)), query(56).query), 6);
  }
});

test("long-content stress fields remain absent from the main index", () => {
  const projected = pgDocument(project(anchor(26)));
  assert.equal(projected.normalizedText.includes("独立压力词"), false);
  assert.equal(Object.hasOwn(projected, "stressOnly"), false);
  assert.equal(Object.hasOwn(projected, "historicalContext"), false);
  assert.equal(Object.hasOwn(projected, "scholarlyResearch"), false);
});

test("evaluation reports hidden and explicitly prohibited hits even when a relevant hit is returned", () => {
  const documents = new Map(
    corpus.map((source) => [source.id, project(source)]),
  );
  const judged = judgedResult(
    { ...query(5), excludedIds: ["syn-011"] },
    [{ id: "syn-023" }, { id: "syn-011" }, { id: "syn-009" }],
    documents,
  );
  assert.equal(judged.top1, false);
  assert.equal(judged.top5, true);
  assert.equal(judged.firstRelevantRank, 3);
  assert.deepEqual(judged.missing, []);
  assert.deepEqual(judged.unexpected, ["syn-023", "syn-011"]);
  assert.deepEqual(judged.prohibited, ["syn-023", "syn-011"]);
});

test("zero-result correctness and missing positives are reported without invented ranks", () => {
  const documents = new Map(
    corpus.map((source) => [source.id, project(source)]),
  );
  const empty = judgedResult(query(46), [], documents);
  assert.equal(empty.top1, true);
  assert.equal(empty.top5, true);
  assert.equal(empty.firstRelevantRank, null);
  const missed = judgedResult(query(5), [], documents);
  assert.equal(missed.top1, false);
  assert.equal(missed.top5, false);
  assert.equal(missed.firstRelevantRank, null);
  assert.deepEqual(missed.missing, ["syn-009"]);
  assert.deepEqual(summarize([empty, missed]), {
    queries: 2,
    top1Correct: 1,
    top5Correct: 1,
    top1Rate: 0.5,
    top5Rate: 0.5,
    missedExpectedResults: 1,
    unexpectedResults: 0,
    prohibitedResults: 0,
  });
});

test("manually authored Golden labels refer only to eligible anchors in their own group", () => {
  const documents = new Map(corpus.map((source) => [source.id, source]));
  assert.equal(corpus.length, 40);
  assert.equal(goldenQueries.length, 58);
  assert.equal(new Set(goldenQueries.map((item) => item.id)).size, 58);
  for (const item of goldenQueries) {
    assert.equal(item.fictional, true);
    assert.ok(item.judgment.includes("Manually specified"));
    assert.equal(new Set(item.expectedIds).size, item.expectedIds.length);
    for (const id of item.expectedIds) {
      const document = documents.get(id);
      assert.ok(document);
      assert.equal(document.visible, true);
      if (item.kind) assert.equal(document.kind, item.kind);
    }
    for (const id of item.acceptableTop1)
      assert.ok(item.expectedIds.includes(id));
    for (const id of item.excludedIds ?? []) {
      assert.ok(documents.has(id));
      assert.equal(item.expectedIds.includes(id), false);
    }
  }
});

test("the primary synthetic 26 preserve field and exclusion coverage", () => {
  assert.equal(primarySyntheticQueryIds.length, 26);
  assert.equal(new Set(primarySyntheticQueryIds).size, 26);
  const primary = primarySyntheticQueryIds.map((id) =>
    goldenQueries.find((item) => item.id === id),
  );
  assert.ok(primary.every(Boolean));
  const categories = new Set(primary.map((item) => item.category));
  for (const category of [
    "person-work-and",
    "period-label",
    "dynasty",
    "date-text",
    "script-style",
    "province",
    "prefecture",
    "county",
    "current-location",
    "current-custodian",
    "summary-body",
    "description-body",
    "transcription-body",
    "two-han-characters",
    "two-han-traditional",
    "near-only",
    "visibility-zero",
    "cross-document-and-zero",
    "unsupplied-field-exclusion",
    "unknown-field-exclusion",
    "clear-field-exclusion",
    "not-applicable-field-exclusion",
    "historical-context-not-in-main",
    "scholarly-research-not-in-main",
  ])
    assert.ok(
      categories.has(category),
      `Primary coverage must include ${category}`,
    );
});

test("scale generation is reproducible and varies records without rewriting anchors", () => {
  const before = globalThis.structuredClone(corpus);
  const first = generateScaleCorpus(1000, 20260907);
  const repeat = generateScaleCorpus(1000, 20260907);
  const other = generateScaleCorpus(1000, 7);
  assert.deepEqual(first, repeat);
  assert.notDeepEqual(first, other);
  assert.deepEqual(corpus, before);
  assert.deepEqual(first.slice(0, corpus.length), corpus);
  assert.equal(new Set(first.map((item) => item.id)).size, 1000);
  assert.ok(new Set(first.map((item) => item.title)).size > 950);
  assert.ok(
    new Set(first.map((item) => item.transcription.value?.length ?? 0)).size >
      50,
  );
  for (const item of first) {
    assert.equal(item.fictional, true);
    assert.equal(item.provenance.type, "designed-synthetic");
    assert.equal(
      new Set(
        item.contributors.map((person) =>
          JSON.stringify([person.name, person.role]),
        ),
      ).size,
      item.contributors.length,
    );
  }
});

test("projection retains exclusion markers so the engine can filter before retrieval", () => {
  const documents = generateScaleCorpus(1000, 20260907).map(project);
  const visible = documents.filter((document) => document.visible);
  assert.ok(visible.length < documents.length);
  assert.ok(visible.length > 800);
  assert.ok(visible.some((document) => document.id === "syn-001"));
  assert.equal(
    visible.some((document) => document.id === "syn-022"),
    false,
  );
  assert.equal(
    visible.some((document) => document.id === "syn-023"),
    false,
  );
  assert.equal(
    documents.find((document) => document.id === "syn-023").visible,
    false,
  );
});

test("latency summaries preserve sample counts and use ordered percentiles", () => {
  const values = [100, 2, 3, 1, 4];
  assert.deepEqual(distribution(values), {
    samples: 5,
    p50: 3,
    p95: 100,
    max: 100,
  });
  assert.deepEqual(values, [100, 2, 3, 1, 4]);
  assert.deepEqual(distribution([]), {
    samples: 0,
    p50: null,
    p95: null,
    max: null,
  });
});
