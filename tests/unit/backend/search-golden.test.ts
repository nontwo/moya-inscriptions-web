import { describe, expect, it } from "vitest";
import {
  matchCatalogSearchDocument,
  projectCatalogSearchDocument,
} from "@moya/search";

interface GoldenQuery {
  readonly id: string;
  readonly query: string;
  readonly category: string;
  readonly kind?: string;
  readonly expectedIds: string[];
  readonly acceptableTop1: string[];
  readonly excludedIds?: string[];
}
interface SourceFixture extends Record<string, unknown> {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly aliases: string[];
  readonly visible: boolean;
  readonly contributors?: { name: string }[];
}
// Import unchanged, attributed evaluation labels. This is a normalization/tier
// regression oracle, not a claim that these records were imported into Catalog.
const fictional = (await import(
  new URL("../../../experiments/p2-03-search/corpus.mjs", import.meta.url).href
)) as {
  corpus: SourceFixture[];
  goldenQueries: GoldenQuery[];
  primarySyntheticQueryIds: string[];
};
const official = (await import(
  new URL(
    "../../../experiments/p2-03-search/public-corpus.mjs",
    import.meta.url,
  ).href
)) as {
  publicCorpus: SourceFixture[];
  publicGoldenQueries: GoldenQuery[];
};
const deferred = new Map([
  ["pub-q-13", "Unapproved 姪/侄 relation"],
  ["pub-q-24", "Short typo correction"],
  ["q-41", "Short typo correction"],
]);
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
      : { contributors: record.contributors.map(({ name }) => ({ name })) }),
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

describe("unchanged evaluation Golden labels: supported versus explicitly deferred", () => {
  it("keeps all 50 primary plus 32 supplemental labels without erasing the three known misses", () => {
    expect(
      official.publicGoldenQueries.length +
        fictional.primarySyntheticQueryIds.length,
    ).toBe(50);
    expect(
      official.publicGoldenQueries.length + fictional.goldenQueries.length,
    ).toBe(82);
    expect(deferred.size).toBe(3);
  });
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
    const documents = group.records
      .filter((source) => source.visible)
      .map((source) => ({ source, document: documentFor(source) }));
    for (const query of group.queries) {
      it(`${group.label} ${query.id}: ${deferred.has(query.id) ? "DEFERRED label retained" : "supported"}`, () => {
        const kinds = [
          "title-exact",
          "alias-exact",
          "normalized-exact",
          "title-alias-partial",
          "structured",
          "body",
        ];
        const hits = documents
          .flatMap(({ source, document }) => {
            if (query.kind !== undefined && query.kind !== source.kind)
              return [];
            const kind = matchCatalogSearchDocument(document, query.query);
            return kind === null ? [] : [{ id: source.id, kind }];
          })
          .sort(
            (a, b) =>
              kinds.indexOf(a.kind) - kinds.indexOf(b.kind) ||
              (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
          );
        const ids = hits.map(({ id }) => id);
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
  }
});
