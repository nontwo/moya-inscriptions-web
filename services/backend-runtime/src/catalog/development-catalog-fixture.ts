import { catalogIdSchema } from "@moya/contracts/schemas";

import type {
  CatalogDetailProjection,
  CatalogListItemProjection,
  CatalogQueryPort,
  CatalogRecord,
  CatalogSourceCitationProjection,
} from "@moya/api";

interface DevelopmentFixtureEntry {
  readonly record: CatalogRecord;
  readonly sourceCitations: readonly CatalogSourceCitationProjection[];
  /** Deliberately private fixture state used to verify the projection boundary. */
  readonly privateFixtureMetadata: {
    readonly internalSourceId: string;
    readonly rawSourceExcerpt: string;
    readonly verificationNote: string;
  };
}

const fixtureId = (value: string) => catalogIdSchema.parse(value);

/**
 * TEST / DEVELOPMENT FIXTURE ONLY.
 *
 * The sequence is deterministic for boundary tests. It does not define a
 * production browse, chronology, popularity, recommendation, or search order.
 */
const developmentFixture: readonly DevelopmentFixtureEntry[] = Object.freeze([
  {
    record: {
      id: fixtureId("fixture-catalog-001"),
      kind: "calligraphy",
      title: "九成宫醴泉铭",
      aliases: ["九成宫碑"],
      summary: "T05.1 开发测试夹具中的书法类条目。",
      description:
        "仅用于验证 Catalog detail HTTP boundary 与 Public DTO 映射。",
      periodLabel: "唐",
    },
    sourceCitations: [{ label: "T05.1 test/development fixture" }],
    privateFixtureMetadata: {
      internalSourceId: "fixture-source-001",
      rawSourceExcerpt: "fixture-only raw source",
      verificationNote: "not production verification data",
    },
  },
  {
    record: {
      id: fixtureId("fixture-catalog-002"),
      kind: "inscription",
      title: "好太王碑",
      aliases: ["广开土王碑"],
      summary: "T05.1 开发测试夹具中的碑刻类条目。",
      description: "仅用于验证 deterministic list、pagination 与 detail 查询。",
      periodLabel: "东晋",
    },
    sourceCitations: [{ label: "T05.1 test/development fixture" }],
    privateFixtureMetadata: {
      internalSourceId: "fixture-source-002",
      rawSourceExcerpt: "fixture-only raw source",
      verificationNote: "not production verification data",
    },
  },
  {
    record: {
      id: fixtureId("fixture-catalog-003"),
      kind: "inscription",
      title: "泰山经石峪金刚经",
      aliases: ["经石峪摩崖刻经"],
      summary: "T05.1 开发测试夹具中的摩崖刻经条目。",
      description: "仅用于覆盖 inscription CatalogKind 与越界分页行为。",
      periodLabel: "北齐",
    },
    sourceCitations: [{ label: "T05.1 test/development fixture" }],
    privateFixtureMetadata: {
      internalSourceId: "fixture-source-003",
      rawSourceExcerpt: "fixture-only raw source",
      verificationNote: "not production verification data",
    },
  },
]);

const toListProjection = ({
  record,
}: DevelopmentFixtureEntry): CatalogListItemProjection =>
  ({
    id: record.id,
    kind: record.kind,
    title: record.title,
    aliases: [...record.aliases],
    ...(record.summary === undefined ? {} : { summary: record.summary }),
    ...(record.periodLabel === undefined
      ? {}
      : { periodLabel: record.periodLabel }),
  }) satisfies CatalogListItemProjection;

const toDetailProjection = (
  entry: DevelopmentFixtureEntry,
): CatalogDetailProjection => {
  return {
    ...toListProjection(entry),
    sourceCitations: entry.sourceCitations.map((citation) => ({ ...citation })),
    ...(entry.record.description === undefined
      ? {}
      : { description: entry.record.description }),
  } satisfies CatalogDetailProjection;
};

/** Creates the non-production Catalog adapter used only by development/tests. */
export const createDevelopmentCatalogFixtureQueryPort =
  (): CatalogQueryPort => ({
    async list({ page, pageSize }) {
      const total = developmentFixture.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
      const offset = (page - 1) * pageSize;

      return {
        items: developmentFixture
          .slice(offset, offset + pageSize)
          .map(toListProjection),
        total,
        page,
        pageSize,
        totalPages,
      };
    },

    async getById(id) {
      const entry = developmentFixture.find(({ record }) => record.id === id);
      return entry === undefined ? null : toDetailProjection(entry);
    },
  });
