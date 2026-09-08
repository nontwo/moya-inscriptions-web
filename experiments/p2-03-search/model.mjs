import process from "node:process";
import OpenCC from "opencc";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const converter = new OpenCC("t2s.json");
const assetNames = [
  "t2s.json",
  "CJK_Compatibility_Ideographs.ocd2",
  "TSPhrases.ocd2",
  "TSCharactersExt.ocd2",
  "TSCharacters.ocd2",
];
const hashFile = (filename) =>
  createHash("sha256").update(readFileSync(filename)).digest("hex");
export const normalization = {
  library: "OpenCC",
  version: OpenCC.version,
  configuration: "t2s.json",
  assetsSha256: Object.fromEntries(
    assetNames.map((name) => [name, hashFile(join(OpenCC._assetsPath, name))]),
  ),
  nativeAddonSha256: hashFile(OpenCC._bindingPath),
  platform: process.platform,
  architecture: process.arch,
};
export const normalize = (text) => converter.convertSync(String(text));
export function supplied(value) {
  if (typeof value === "string") return value;
  return value?.state === "VALUE" && typeof value.value === "string"
    ? value.value
    : "";
}
const structuredFields = [
  "periodLabel",
  "dynasty",
  "dateText",
  "scriptStyle",
  "province",
  "prefecture",
  "county",
  "currentLocation",
  "currentCustodian",
];
export function project(source) {
  const structuredText = [
    ...(source.contributors ?? []).map((c) => c.name),
    ...structuredFields.map((field) => supplied(source[field])),
  ]
    .filter(Boolean)
    .join("\n");
  const body = [
    supplied(source.summary),
    supplied(source.description),
    source.transcription?.state === "VALUE"
      ? supplied(source.transcription)
      : "",
  ]
    .filter(Boolean)
    .join("\n");
  const doc = {
    id: source.id,
    kind: source.kind,
    title: source.title,
    aliases: [...(source.aliases ?? [])],
    structuredText,
    body,
    visible: source.visible !== false,
    normalizedTitle: normalize(source.title),
    normalizedAliases: (source.aliases ?? []).map(normalize),
    normalizedStructuredText: normalize(structuredText),
    normalizedBody: normalize(body),
  };
  return doc;
}
export function pgDocument(doc) {
  const titleAliasText = [doc.normalizedTitle, ...doc.normalizedAliases].join(
    "\n",
  );
  return {
    ...doc,
    titleAliasText,
    normalizedText: [
      titleAliasText,
      doc.normalizedStructuredText,
      doc.normalizedBody,
    ].join("\n"),
  };
}
export function tier(doc, query) {
  const q = query.trim();
  const n = normalize(q);
  if (doc.title === q) return 0;
  if (doc.aliases.includes(q)) return 1;
  if (doc.normalizedTitle === n || doc.normalizedAliases.includes(n)) return 2;
  const parts = n.split(/\s+/u).filter(Boolean);
  const high = [doc.normalizedTitle, ...doc.normalizedAliases].join("\n");
  if (parts.every((part) => high.includes(part))) return 3;
  const structured = high + "\n" + doc.normalizedStructuredText;
  if (parts.every((part) => structured.includes(part))) return 4;
  if (
    parts.every((part) =>
      (structured + "\n" + doc.normalizedBody).includes(part),
    )
  )
    return 5;
  return 6;
}
export function judgedResult(query, hits, documents) {
  const ids = hits.map((hit) => hit.id);
  const expected = new Set(query.expectedIds);
  const top1 =
    query.expectedIds.length === 0
      ? ids.length === 0
      : (query.acceptableTop1 ?? query.expectedIds).includes(ids[0]);
  const top5 =
    query.expectedIds.length === 0
      ? ids.length === 0
      : ids.slice(0, 5).some((id) => expected.has(id));
  const missing = [...expected].filter((id) => !ids.includes(id));
  const unexpected = ids.filter((id) => !expected.has(id));
  const prohibited = ids.filter(
    (id) =>
      query.excludedIds?.includes(id) || documents.get(id)?.visible === false,
  );
  return {
    top1,
    top5,
    firstRelevantRank: ids.findIndex((id) => expected.has(id)) + 1 || null,
    missing,
    unexpected,
    prohibited,
    visibilityLeaks: ids.filter((id) => documents.get(id)?.visible === false),
    resultIds: ids.slice(0, 10),
  };
}
export function summarize(rows) {
  const n = rows.length;
  return {
    queries: n,
    top1Correct: rows.filter((r) => r.top1).length,
    top5Correct: rows.filter((r) => r.top5).length,
    top1Rate: n ? rows.filter((r) => r.top1).length / n : null,
    top5Rate: n ? rows.filter((r) => r.top5).length / n : null,
    missedExpectedResults: rows.reduce((s, r) => s + r.missing.length, 0),
    unexpectedResults: rows.reduce((s, r) => s + r.unexpected.length, 0),
    prohibitedResults: rows.reduce((s, r) => s + r.prohibited.length, 0),
  };
}
export function distribution(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) =>
    sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] ?? null;
  return { samples: values.length, p50: at(0.5), p95: at(0.95), max: at(1) };
}
