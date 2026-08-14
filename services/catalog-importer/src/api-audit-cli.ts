import { readFile, writeFile } from "node:fs/promises";

import { canonicalCatalogImportEnvelopeSchema } from "@moya/contracts/internal/catalog-import";

import type { CatalogImportApplicationResult } from "./index.js";

const [baseUrl, applicationPath, envelopePath, outputPath] =
  process.argv.slice(2);
if (
  baseUrl === undefined ||
  applicationPath === undefined ||
  envelopePath === undefined ||
  outputPath === undefined
) {
  throw new Error(
    "Usage: api-audit <base-url> <application-result> <canonical-envelope> <output>",
  );
}

const application = JSON.parse(
  await readFile(applicationPath, "utf8"),
) as CatalogImportApplicationResult;
const envelope = canonicalCatalogImportEnvelopeSchema.parse(
  JSON.parse(await readFile(envelopePath, "utf8")),
);
const healthResponse = await fetch(`${baseUrl}/health`);
const health = await healthResponse.json();
const listResponse = await fetch(`${baseUrl}/v1/catalog?page=1&pageSize=100`);
const list = (await listResponse.json()) as {
  readonly items: readonly Record<string, unknown>[];
  readonly total: number;
  readonly totalPages: number;
};
const aliasesByImport = new Map<string, string[]>();
for (const alias of envelope.aliasRows) {
  const key = String(alias.catalogImportId);
  aliasesByImport.set(key, [...(aliasesByImport.get(key) ?? []), alias.alias]);
}
const records = [];
for (const mapping of application.catalogIdMap) {
  const response = await fetch(`${baseUrl}/v1/catalog/${mapping.catalogId}`);
  const actual = (await response.json()) as Record<string, unknown>;
  const expected = envelope.catalogRows.find(
    ({ catalogImportId }) =>
      String(catalogImportId) === mapping.catalogImportId,
  );
  if (expected === undefined)
    throw new Error("Catalog import mapping is missing");
  const expectedAliases = aliasesByImport.get(mapping.catalogImportId) ?? [];
  const exposedMatches =
    response.status === 200 &&
    actual.id === mapping.catalogId &&
    actual.title === expected.title &&
    actual.kind === expected.catalogKind &&
    JSON.stringify(actual.aliases) === JSON.stringify(expectedAliases) &&
    (expected.description.state !== "VALUE" ||
      actual.description === expected.description.value);
  records.push({
    ...mapping,
    httpStatus: response.status,
    expected: {
      title: expected.title,
      kind: expected.catalogKind,
      aliases: expectedAliases,
      ...(expected.description.state === "VALUE"
        ? { description: expected.description.value }
        : {}),
    },
    actual,
    exposedMatches,
    persistedButNotExposed: [
      "sourceId provenance",
      "aliasType",
      "dynasty/dateText/geography/location/custodian values and states",
    ],
    disposition: "NOT_EXPOSED_BY_CURRENT_PUBLIC_CONTRACT",
  });
}
await writeFile(
  outputPath,
  `${JSON.stringify(
    {
      health: { httpStatus: healthResponse.status, body: health },
      list: {
        httpStatus: listResponse.status,
        total: list.total,
        totalPages: list.totalPages,
        returned: list.items.length,
      },
      details: records,
      allExposedFieldsMatched: records.every(
        ({ exposedMatches }) => exposedMatches,
      ),
    },
    null,
    2,
  )}\n`,
);
