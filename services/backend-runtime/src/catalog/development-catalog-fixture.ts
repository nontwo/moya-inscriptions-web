import { catalogIdSchema, mediaIdSchema } from "@moya/contracts/schemas";

import type {
  CatalogDetailProjection,
  CatalogListItemProjection,
  CatalogMediaProjection,
  CatalogQueryPort,
  CatalogRecord,
  CatalogSourceCitationProjection,
  CatalogStatefulTextProjection,
} from "@moya/api";
import { deriveCatalogPeriodLabel } from "@moya/api";

interface DevelopmentFixtureEntry {
  readonly record: CatalogRecord;
  readonly detailFields: {
    readonly dynasty?: CatalogStatefulTextProjection;
    readonly dateText?: CatalogStatefulTextProjection;
    readonly province?: CatalogStatefulTextProjection;
    readonly prefecture?: CatalogStatefulTextProjection;
    readonly county?: CatalogStatefulTextProjection;
    readonly currentLocation?: CatalogStatefulTextProjection;
    readonly currentCustodian?: CatalogStatefulTextProjection;
  };
  readonly media: readonly CatalogMediaProjection[];
  readonly sourceCitations: readonly CatalogSourceCitationProjection[];
  /** Deliberately private fixture state used to verify the projection boundary. */
  readonly privateFixtureMetadata: {
    readonly internalSourceId: string;
    readonly rawSourceExcerpt: string;
    readonly verificationNote: string;
  };
}

const fixtureId = (value: string) => catalogIdSchema.parse(value);
const fixtureMediaId = (value: string) => mediaIdSchema.parse(value);
const valueField = (value: string): CatalogStatefulTextProjection => ({
  state: "VALUE",
  value,
});
const periodLabelField = (value: string | undefined) =>
  value === undefined ? {} : { periodLabel: value };
const emptyStateField = (
  state: Exclude<CatalogStatefulTextProjection["state"], "VALUE">,
): CatalogStatefulTextProjection => ({ state });

export const developmentMediaUrlsByObjectKey: ReadonlyMap<string, string> =
  new Map([
    [
      "fixtures/catalog/fixture-catalog-001/gallery-detail.jpg",
      "https://media.example.invalid/fixture-catalog-001/gallery-detail.jpg",
    ],
    [
      "fixtures/catalog/fixture-catalog-001/representative.jpg",
      "https://media.example.invalid/fixture-catalog-001/representative.jpg",
    ],
  ]);

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
      ...periodLabelField(
        deriveCatalogPeriodLabel({
          dynasty: valueField("唐"),
          dateText: valueField("贞观十年"),
        }),
      ),
    },
    detailFields: {
      dynasty: valueField("唐"),
      dateText: valueField("贞观十年"),
      province: valueField("陕西"),
      prefecture: emptyStateField("CLEAR"),
      county: emptyStateField("UNSUPPLIED"),
      currentLocation: valueField("陕西省碑林区"),
      currentCustodian: valueField("碑林博物馆"),
    },
    sourceCitations: [{ label: "T05.1 test/development fixture" }],
    media: [
      {
        id: fixtureMediaId("fixture-media-001"),
        position: 0,
        isRepresentative: false,
        kind: "image",
        alt: "九成宫醴泉铭局部测试图",
        width: 1_200,
        height: 1_600,
        objectKey: "fixtures/catalog/fixture-catalog-001/gallery-detail.jpg",
      },
      {
        id: fixtureMediaId("fixture-media-002"),
        position: 1,
        isRepresentative: true,
        kind: "image",
        alt: "九成宫醴泉铭代表测试图",
        width: 1_600,
        height: 1_200,
        objectKey: "fixtures/catalog/fixture-catalog-001/representative.jpg",
      },
    ],
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
      ...periodLabelField(
        deriveCatalogPeriodLabel({
          dynasty: valueField("东晋"),
        }),
      ),
    },
    detailFields: {
      dynasty: valueField("东晋"),
      dateText: emptyStateField("UNSUPPLIED"),
      province: emptyStateField("UNSUPPLIED"),
      prefecture: emptyStateField("UNSUPPLIED"),
      county: emptyStateField("UNSUPPLIED"),
      currentLocation: emptyStateField("UNSUPPLIED"),
      currentCustodian: emptyStateField("UNSUPPLIED"),
    },
    sourceCitations: [{ label: "T05.1 test/development fixture" }],
    media: [],
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
      ...periodLabelField(
        deriveCatalogPeriodLabel({
          dateText: valueField("北齐"),
        }),
      ),
    },
    detailFields: {
      dynasty: emptyStateField("UNSUPPLIED"),
      dateText: valueField("北齐"),
      province: emptyStateField("UNSUPPLIED"),
      prefecture: emptyStateField("UNSUPPLIED"),
      county: emptyStateField("UNSUPPLIED"),
      currentLocation: emptyStateField("UNSUPPLIED"),
      currentCustodian: emptyStateField("UNSUPPLIED"),
    },
    sourceCitations: [{ label: "T05.1 test/development fixture" }],
    media: [],
    privateFixtureMetadata: {
      internalSourceId: "fixture-source-003",
      rawSourceExcerpt: "fixture-only raw source",
      verificationNote: "not production verification data",
    },
  },
]);

const toListProjection = ({
  record,
  media,
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
    ...(() => {
      const representativeMedia = media.find(
        ({ isRepresentative }) => isRepresentative,
      );
      return representativeMedia === undefined
        ? {}
        : { representativeMedia: { ...representativeMedia } };
    })(),
  }) satisfies CatalogListItemProjection;

const toDetailProjection = (
  entry: DevelopmentFixtureEntry,
): CatalogDetailProjection => {
  return {
    ...toListProjection(entry),
    ...entry.detailFields,
    sourceCitations: entry.sourceCitations.map((citation) => ({ ...citation })),
    media: entry.media.map((media) => ({ ...media })),
    ...(entry.record.description === undefined
      ? {}
      : { description: entry.record.description }),
  } satisfies CatalogDetailProjection;
};

/** Creates the non-production Catalog adapter used only by development/tests. */
export const createDevelopmentCatalogFixtureQueryPort =
  (): CatalogQueryPort => ({
    async list({ kind, page, pageSize }) {
      const filteredFixture =
        kind === undefined
          ? developmentFixture
          : developmentFixture.filter(({ record }) => record.kind === kind);
      const total = filteredFixture.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);
      const offset = (page - 1) * pageSize;

      return {
        items: filteredFixture
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
