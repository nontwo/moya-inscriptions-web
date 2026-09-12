import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBackendApplication,
  createBackendServer,
  startServer,
  stopServer,
} from "@moya/backend-runtime";
import {
  closePostgresPool,
  createPostgresPool,
  parsePostgresConfig,
  PostgresCatalogQueryAdapter,
  runMigrations,
} from "@moya/catalog-postgres";
import { catalogSearchPageSchema } from "@moya/contracts/schemas";
import { UnconfiguredStorageUrlResolver } from "@moya/image";
import { projectCatalogSearchDocument } from "@moya/search";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { requireSyntheticTestDatabaseUrl } from "./synthetic-test-database.js";

interface SourceFixture extends Record<string, unknown> {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly aliases: string[];
  readonly visible: boolean;
  readonly contributors?: { name: string }[];
}
interface GoldenQuery {
  readonly id: string;
  readonly query: string;
  readonly kind?: string;
  readonly expectedIds: string[];
  readonly acceptableTop1: string[];
  readonly excludedIds?: string[];
}
const fictional = (await import(
  new URL("../../../experiments/p2-03-search/corpus.mjs", import.meta.url).href
)) as { corpus: SourceFixture[]; goldenQueries: GoldenQuery[] };
const official = (await import(
  new URL(
    "../../../experiments/p2-03-search/public-corpus.mjs",
    import.meta.url,
  ).href
)) as { publicCorpus: SourceFixture[]; publicGoldenQueries: GoldenQuery[] };
const supplied = (value: unknown): string | undefined => {
  if (typeof value === "string") return value;
  if (
    value &&
    typeof value === "object" &&
    "state" in value &&
    value.state === "VALUE" &&
    "value" in value &&
    typeof value.value === "string"
  )
    return value.value;
  return undefined;
};
const documentFor = (record: SourceFixture) =>
  projectCatalogSearchDocument({
    title: record.title,
    aliases: record.aliases,
    ...(record.contributors === undefined
      ? {}
      : { contributors: record.contributors }),
    ...Object.fromEntries(
      [
        "summary",
        "periodLabel",
        "dynasty",
        "dateText",
        "scriptStyle",
        "province",
        "prefecture",
        "county",
        "currentLocation",
        "currentCustodian",
        "description",
        "transcription",
      ].flatMap((field) => {
        const value = supplied(record[field]);
        return value === undefined ? [] : [[field, value]];
      }),
    ),
  });
const testDatabaseUrl = requireSyntheticTestDatabaseUrl();
const schema = "p203_search_golden";
const administration = createPostgresPool(
  parsePostgresConfig({ DATABASE_URL: testDatabaseUrl }),
);
const isolated = new URL(testDatabaseUrl);
isolated.searchParams.set("options", `-c search_path=${schema}`);
const pool = createPostgresPool(
  parsePostgresConfig({ DATABASE_URL: isolated.toString() }),
);
const adapter = new PostgresCatalogQueryAdapter(pool);
const server = createBackendServer(
  createBackendApplication({
    nodeEnv: "production",
    catalogQueryPort: adapter,
    catalogSearchQueryPort: adapter,
    storageUrlResolver: new UnconfiguredStorageUrlResolver(),
  }),
);
let base: string;
beforeAll(async () => {
  await administration.query(`CREATE SCHEMA ${schema}`);
  await runMigrations(
    pool,
    path.join(
      fileURLToPath(new URL("../../../", import.meta.url)),
      "database/migrations",
    ),
  );
  const address = await startServer(server, { host: "127.0.0.1", port: 0 });
  base = `http://${address.address}:${address.port}`;
});
afterAll(async () => {
  await stopServer(server);
  await closePostgresPool(pool);
  await administration.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await closePostgresPool(administration);
});
const deferred = new Set(["pub-q-13", "pub-q-24", "q-41"]);
// These are frozen evaluation projections in an isolated schema, never a Catalog
// import. Official authors have supplied names but no approved domain roles:
// direct fixture projections preserve those names without inventing role rows.
// Source-to-projection extraction and write consistency have separate PG tests.
for (const group of [
  {
    label: "official open excerpts",
    records: official.publicCorpus,
    queries: official.publicGoldenQueries,
  },
  {
    label: "explicit fiction",
    records: fictional.corpus,
    queries: fictional.goldenQueries,
  },
]) {
  describe.sequential(
    `real HTTP/PostgreSQL Golden labels: ${group.label}`,
    () => {
      beforeAll(async () => {
        await pool.query("TRUNCATE catalog_entries CASCADE");
        for (const record of group.records.filter(({ visible }) => visible)) {
          await pool.query(
            "INSERT INTO catalog_entries(catalog_id,title,kind) VALUES($1,$2,$3)",
            [record.id, record.title, record.kind],
          );
          const doc = documentFor(record);
          await pool.query(
            `INSERT INTO catalog_search_documents(catalog_id,normalization_version,title,aliases,normalized_title,normalized_aliases,title_alias_text,structured_text,combined_text) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              record.id,
              doc.normalizationVersion,
              doc.title,
              doc.aliases,
              doc.normalizedTitle,
              doc.normalizedAliases,
              doc.titleAliasText,
              doc.structuredText,
              doc.combinedText,
            ],
          );
        }
      });
      for (const query of group.queries) {
        it(`${query.id}: ${deferred.has(query.id) ? "DEFERRED positive label retained" : "supported"}`, async () => {
          const url = new URL("/v1/catalog-search", base);
          url.searchParams.set("q", query.query);
          url.searchParams.set("pageSize", "100");
          if (query.kind !== undefined)
            url.searchParams.set("kind", query.kind);
          const response = await fetch(url);
          expect(response.status).toBe(200);
          const ids: string[] = catalogSearchPageSchema
            .parse(await response.json())
            .items.map(({ id }) => id);
          if (deferred.has(query.id)) {
            expect(query.expectedIds.length).toBeGreaterThan(0);
            expect(ids).toEqual([]);
            return;
          }
          if (query.expectedIds.length === 0) expect(ids).toEqual([]);
          else {
            expect(query.acceptableTop1).toContain(ids[0]);
            expect(
              query.expectedIds.some((id) => ids.slice(0, 5).includes(id)),
            ).toBe(true);
            expect(ids).toEqual(expect.arrayContaining(query.expectedIds));
          }
          expect(
            ids.filter((id) => (query.excludedIds ?? []).includes(id)),
          ).toEqual([]);
        });
      }
    },
  );
}
