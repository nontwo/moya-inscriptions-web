import type {
  CatalogId,
  CatalogListTransportQuery,
  CatalogPage,
  CatalogSummary,
  MediaId,
} from "@moya/contracts";
import type { HomeCatalogSource } from "../features/home/load-home-catalog";

const populatedItems = [
  {
    aliases: ["QA synthetic inscription"],
    id: "qa-scenario-inscription-with-media" as CatalogId,
    kind: "inscription",
    periodLabel: "QA 时期",
    representativeMedia: {
      alt: "QA synthetic inscription media",
      height: 1600,
      id: "qa-scenario-inscription-media" as MediaId,
      kind: "image",
      src: "https://qa.invalid/scenarios/inscription.jpg",
      width: 1200,
    },
    summary: "Synthetic QA record with representative media.",
    title: "QA 场景碑刻（合成）",
  },
  {
    aliases: ["QA synthetic calligraphy"],
    id: "qa-scenario-calligraphy-no-media" as CatalogId,
    kind: "calligraphy",
    periodLabel: "QA 时期",
    summary: "Synthetic QA record without media.",
    title: "QA 场景书帖（合成无图）",
  },
] satisfies CatalogSummary[];

const page = (
  items: CatalogSummary[],
  query: CatalogListTransportQuery = {},
): CatalogPage => {
  const matchingItems =
    query.kind === undefined
      ? items
      : items.filter(({ kind }) => kind === query.kind);
  const pageNumber = Number(query.page ?? "1");
  const pageSize = Number(query.pageSize ?? "20");
  const offset = (pageNumber - 1) * pageSize;

  return {
    items: matchingItems.slice(offset, offset + pageSize),
    page: pageNumber,
    pageSize,
    total: matchingItems.length,
    totalPages:
      matchingItems.length === 0
        ? 0
        : Math.ceil(matchingItems.length / pageSize),
  };
};

export const homeCatalogScenarioSources = {
  populated: async (query) => ({
    page: page(populatedItems, query),
    state: "success",
  }),
  empty: async (query) => ({
    page: page([], query),
    state: "success",
  }),
  unavailable: async () => ({ state: "unavailable" }),
  unexpectedError: async () => ({ state: "unexpected-error" }),
} satisfies Record<string, HomeCatalogSource>;
