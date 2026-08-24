import type {
  CatalogId,
  CatalogListTransportQuery,
  CatalogPage,
  CatalogSummary,
  MediaId,
  PublicMedia,
} from "@moya/contracts";
import type { HomeCatalogSource } from "../features/home/load-home-catalog";

const visualAssetPath = (fileName: string) =>
  `/docs/design-system/assets/demo/${fileName}`;

const visualBrokenMediaPath = visualAssetPath(
  "qa-visual-intentionally-missing.svg",
);

const smallPopulatedMediaPath = visualAssetPath("rubbing-fragment.svg");

type VisualMediaDefinition = {
  readonly fileName: string;
  readonly height: number;
  readonly width: number;
};

type VisualCatalogItemDefinition = {
  readonly aliases: readonly string[];
  readonly id: string;
  readonly kind: CatalogSummary["kind"];
  readonly media?: VisualMediaDefinition;
  readonly periodLabel?: string;
  readonly summary?: string;
  readonly title: string;
};

const visualCatalogItemDefinitions: readonly VisualCatalogItemDefinition[] = [
  {
    aliases: ["QA synthetic inscription 01"],
    id: "qa-visual-inscription-01",
    kind: "inscription",
    media: { fileName: "discovery-stone.svg", height: 760, width: 600 },
    periodLabel: "QA 合成时期甲",
    summary: "仅用于视觉验收的合成碑刻摘要。",
    title: "甲刻（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic calligraphy 01"],
    id: "qa-visual-calligraphy-01",
    kind: "calligraphy",
    media: { fileName: "calligraphy-sheet.svg", height: 760, width: 600 },
    periodLabel: "QA 合成时期甲",
    summary: "仅用于视觉验收的合成书帖摘要。",
    title: "甲帖（视觉 QA 合成）",
  },
  {
    aliases: [],
    id: "qa-visual-inscription-02",
    kind: "inscription",
    media: { fileName: "cliff-gate.svg", height: 520, width: 360 },
    summary: "用于检验中等长度标题和纵向媒体。",
    title: "试验山门题刻（视觉 QA 合成）",
  },
  {
    aliases: [],
    id: "qa-visual-calligraphy-02",
    kind: "calligraphy",
    media: { fileName: "ink-album.svg", height: 540, width: 360 },
    summary: "用于检验书帖纵向媒体和缺少时期字段。",
    title: "墨册试页（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic long inscription"],
    id: "qa-visual-inscription-03",
    kind: "inscription",
    media: { fileName: "stone-detail.svg", height: 610, width: 360 },
    periodLabel: "QA 合成时期乙",
    summary: "用于检验超长标题、摘要和非常高的媒体比例。",
    title: "视觉验收用超长碑刻标题用于检验两行截断与窄屏换行（合成）",
  },
  {
    aliases: ["QA synthetic long calligraphy"],
    id: "qa-visual-calligraphy-03",
    kind: "calligraphy",
    media: { fileName: "stone-detail.svg", height: 610, width: 360 },
    periodLabel: "QA 合成时期乙",
    summary: "用于检验多列卡片中的超长标题和高度平衡。",
    title: "视觉验收用超长书帖标题用于检验多列卡片换行与高度平衡（合成）",
  },
  {
    aliases: [],
    id: "qa-visual-inscription-04",
    kind: "inscription",
    media: { fileName: "qa-visual-ultrawide.svg", height: 280, width: 960 },
    periodLabel: "QA 合成时期丙",
    title: "横幅拓片（视觉 QA 合成）",
  },
  {
    aliases: [],
    id: "qa-visual-calligraphy-04",
    kind: "calligraphy",
    media: { fileName: "qa-visual-square.svg", height: 600, width: 600 },
    title: "方幅书样（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic square inscription"],
    id: "qa-visual-inscription-05",
    kind: "inscription",
    media: { fileName: "qa-visual-square.svg", height: 600, width: 600 },
    summary: "用于检验严格一比一的合成媒体。",
    title: "方幅残刻（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic ultrawide calligraphy"],
    id: "qa-visual-calligraphy-05",
    kind: "calligraphy",
    media: { fileName: "qa-visual-ultrawide.svg", height: 280, width: 960 },
    periodLabel: "QA 合成时期丙",
    title: "横卷书样（视觉 QA 合成）",
  },
  {
    aliases: [],
    id: "qa-visual-inscription-06",
    kind: "inscription",
    media: { fileName: "rubbing-fragment.svg", height: 480, width: 360 },
    periodLabel: "QA 合成时期丁",
    summary: "用于检验常规纵向拓片。",
    title: "断片校样（视觉 QA 合成）",
  },
  {
    aliases: [],
    id: "qa-visual-calligraphy-06",
    kind: "calligraphy",
    media: { fileName: "inscription-rubbing.svg", height: 420, width: 600 },
    periodLabel: "QA 合成时期丁",
    summary: "用于检验横向书帖卡片。",
    title: "拓本札记（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic stele shadow"],
    id: "qa-visual-inscription-07",
    kind: "inscription",
    media: { fileName: "stele-shadow.svg", height: 400, width: 360 },
    title: "碑影测试（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic running script"],
    id: "qa-visual-calligraphy-07",
    kind: "calligraphy",
    media: { fileName: "rubbing-fragment.svg", height: 480, width: 360 },
    summary: "用于检验缺少时期字段的书帖卡片。",
    title: "纸本行草校样（视觉 QA 合成）",
  },
  {
    aliases: [],
    id: "qa-visual-inscription-08",
    kind: "inscription",
    media: { fileName: "valley-wall.svg", height: 430, width: 360 },
    periodLabel: "QA 合成时期戊",
    title: "谷壁试刻（视觉 QA 合成）",
  },
  {
    aliases: [],
    id: "qa-visual-calligraphy-08",
    kind: "calligraphy",
    media: { fileName: "discovery-stone.svg", height: 760, width: 600 },
    periodLabel: "QA 合成时期戊",
    title: "碑帖合参（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic missing inscription 01"],
    id: "qa-visual-inscription-09",
    kind: "inscription",
    periodLabel: "QA 合成时期己",
    summary: "用于检验碑刻无图状态。",
    title: "无图碑刻甲（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic partial scroll"],
    id: "qa-visual-calligraphy-09",
    kind: "calligraphy",
    media: { fileName: "valley-wall.svg", height: 430, width: 360 },
    title: "长卷局部（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic missing inscription 02"],
    id: "qa-visual-inscription-10",
    kind: "inscription",
    title: "无图碑刻乙的较长标题用于稀疏字段验收（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic missing calligraphy 01"],
    id: "qa-visual-calligraphy-10",
    kind: "calligraphy",
    periodLabel: "QA 合成时期己",
    summary: "用于检验书帖无图状态。",
    title: "无图书帖甲（视觉 QA 合成）",
  },
  {
    aliases: [],
    id: "qa-visual-inscription-11",
    kind: "inscription",
    summary: "用于检验无媒体且缺少时期字段的碑刻。",
    title: "无图碑刻丙（视觉 QA 合成）",
  },
  {
    aliases: [],
    id: "qa-visual-calligraphy-11",
    kind: "calligraphy",
    title: "无图书帖乙的中等长度标题（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic broken media"],
    id: "qa-visual-inscription-12",
    kind: "inscription",
    media: {
      fileName: "qa-visual-intentionally-missing.svg",
      height: 760,
      width: 600,
    },
    periodLabel: "QA 合成时期庚",
    summary: "用于确定性检验图像加载失败。",
    title: "损坏媒体碑刻（视觉 QA 合成）",
  },
  {
    aliases: ["QA synthetic missing calligraphy 03"],
    id: "qa-visual-calligraphy-12",
    kind: "calligraphy",
    summary: "用于检验无媒体且缺少时期字段的书帖。",
    title: "无图书帖丙（视觉 QA 合成）",
  },
];

const normalizeVisualMediaOrigin = (mediaOrigin: string): string => {
  const origin = new URL(mediaOrigin);
  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    throw new TypeError("Visual media origin must use HTTP or HTTPS");
  }

  return origin.origin;
};

const toVisualMedia = (
  origin: string,
  item: VisualCatalogItemDefinition & { readonly media: VisualMediaDefinition },
): PublicMedia => ({
  alt: `${item.title}合成图像`,
  height: item.media.height,
  id: `${item.id}-media` as MediaId,
  kind: "image",
  src: new URL(visualAssetPath(item.media.fileName), origin).href,
  width: item.media.width,
});

export const createVisualCatalogItems = (
  mediaOrigin: string,
): CatalogSummary[] => {
  const origin = normalizeVisualMediaOrigin(mediaOrigin);

  return visualCatalogItemDefinitions.map((item) => ({
    aliases: [...item.aliases],
    id: item.id as CatalogId,
    kind: item.kind,
    ...(item.periodLabel === undefined
      ? {}
      : { periodLabel: item.periodLabel }),
    ...(item.summary === undefined ? {} : { summary: item.summary }),
    ...(item.media === undefined
      ? {}
      : {
          representativeMedia: toVisualMedia(origin, {
            ...item,
            media: item.media,
          }),
        }),
    title: item.title,
  }));
};

export const visualCatalogBrokenMediaPath = visualBrokenMediaPath;

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

export const createSmallPopulatedHomeCatalogSource = (
  mediaOrigin: string,
): HomeCatalogSource => {
  const origin = normalizeVisualMediaOrigin(mediaOrigin);
  const items = populatedItems.map((item): CatalogSummary => {
    if (!("representativeMedia" in item)) return item;

    return {
      ...item,
      representativeMedia: {
        ...item.representativeMedia,
        height: 480,
        src: new URL(smallPopulatedMediaPath, origin).href,
        width: 360,
      },
    };
  });

  return async (query) => ({
    page: page(items, query),
    state: "success",
  });
};

export const createVisualHomeCatalogSource = (
  mediaOrigin: string,
): HomeCatalogSource => {
  const items = createVisualCatalogItems(mediaOrigin);

  return async (query) => ({
    page: page(items, query),
    state: "success",
  });
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
