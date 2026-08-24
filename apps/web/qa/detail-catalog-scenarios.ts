import type {
  CatalogDetailPresentation,
  CatalogDetailSection,
} from "../features/detail/catalog-detail-presentation";
import type { MediaId, PublicMedia } from "@moya/contracts";

export const detailQaScenarioKeys = [
  "single-portrait",
  "single-landscape",
  "single-ultrawide",
  "inscription-complete",
  "calligraphy-mixed",
  "tablet-ultrawide-grid",
  "no-media",
  "long-partial",
] as const;

export type DetailQaScenarioKey = (typeof detailQaScenarioKeys)[number];

export interface DetailQaScenario {
  readonly catalogId: string;
  readonly detail: CatalogDetailPresentation;
  readonly key: DetailQaScenarioKey;
  readonly label: string;
}

const section = (
  id: CatalogDetailSection["id"],
  title: string,
  content: string,
): CatalogDetailSection => ({ content, id, title });

const normalizeMediaOrigin = (mediaOrigin: string): string => {
  const url = new URL(mediaOrigin);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError("Detail QA media origin must use HTTP or HTTPS");
  }
  return url.origin;
};

const assetPath = (fileName: string) =>
  `/docs/design-system/assets/demo/${fileName}`;

const qaMedia = (
  origin: string,
  scenario: DetailQaScenarioKey,
  index: number,
  fileName: string,
  alt: string,
  width: number,
  height: number,
): PublicMedia => ({
  alt,
  height,
  id: `qa-detail-${scenario}-media-${index}` as MediaId,
  kind: "image",
  src: new URL(assetPath(fileName), origin).href,
  width,
});

const completeSections = (prefix: string): readonly CatalogDetailSection[] => [
  section(
    "introduction",
    "简介",
    `${prefix}简介用于核对正式 Detail 的独立阅读板块与连续排版。`,
  ),
  section(
    "transcription",
    "释文",
    `${prefix}释文独立展示，不与简介、历史背景或研究内容合并。`,
  ),
  section(
    "historical-context",
    "历史背景",
    `${prefix}历史背景用于核对时代语境与事实资料之间的阅读层级。`,
  ),
  section(
    "scholarly-research",
    "学术研究",
    `${prefix}学术研究用于核对较长学术文字的行宽和段落节奏。`,
  ),
  section(
    "explanation",
    "说明",
    `${prefix}说明属于独立补充内容，不改写正式 Catalog 语义。`,
  ),
];

export const createDetailQaScenarios = (
  mediaOrigin: string,
): readonly DetailQaScenario[] => {
  const origin = normalizeMediaOrigin(mediaOrigin);

  return [
    {
      catalogId: "qa-visual-inscription-01",
      detail: {
        aliases: ["甲刻单幅"],
        facts: [{ label: "图像构图", value: "单张竖图" }],
        id: "qa-detail-single-portrait",
        kind: "inscription",
        media: [
          qaMedia(
            origin,
            "single-portrait",
            1,
            "discovery-stone.svg",
            "单张竖向碑刻视觉 QA 合成图",
            600,
            760,
          ),
        ],
        periodLabel: "QA 合成时期甲",
        sections: [
          section("introduction", "简介", "单张竖图 Detail 视觉验收场景。"),
          section("transcription", "释文", "甲刻竖图释文视觉校样。"),
          section("historical-context", "历史背景", "竖图历史背景校样。"),
          section("scholarly-research", "学术研究", "竖图学术研究校样。"),
        ],
        source: "qa",
        sourceCitations: [],
        title: "甲刻（单张竖图 QA）",
      },
      key: "single-portrait",
      label: "Single portrait",
    },
    {
      catalogId: "qa-visual-calligraphy-01",
      detail: {
        aliases: ["甲帖横幅"],
        facts: [
          { label: "类型", value: "纸本书帖" },
          { label: "书体", value: "行书（QA presentation）" },
        ],
        id: "qa-detail-single-landscape",
        kind: "calligraphy",
        media: [
          qaMedia(
            origin,
            "single-landscape",
            1,
            "inscription-rubbing.svg",
            "单张普通横向书帖视觉 QA 合成图",
            600,
            420,
          ),
        ],
        periodLabel: "QA 合成时期甲",
        sections: [
          section("introduction", "简介", "单张普通横图 Detail 视觉验收场景。"),
          section("transcription", "释文", "甲帖横幅释文视觉校样。"),
          section("historical-context", "历史背景", "横图历史背景校样。"),
          section("scholarly-research", "学术研究", "横图学术研究校样。"),
        ],
        source: "qa",
        sourceCitations: [],
        title: "甲帖（单张横图 QA）",
      },
      key: "single-landscape",
      label: "Single landscape",
    },
    {
      catalogId: "qa-visual-inscription-04",
      detail: {
        aliases: [],
        facts: [{ label: "图像比例", value: "2.4:1 边界值" }],
        id: "qa-detail-single-ultrawide",
        kind: "inscription",
        media: [
          qaMedia(
            origin,
            "single-ultrawide",
            1,
            "qa-visual-ultrawide.svg",
            "单张二点四比一超宽碑刻视觉 QA 合成图",
            960,
            400,
          ),
        ],
        periodLabel: "QA 合成时期丙",
        sections: [
          section("introduction", "简介", "单张超宽横图边界验收场景。"),
          section("transcription", "释文", "横幅拓片释文视觉校样。"),
          section("historical-context", "历史背景", "超宽图历史背景校样。"),
          section("scholarly-research", "学术研究", "超宽图研究内容校样。"),
        ],
        source: "qa",
        sourceCitations: [],
        title: "横幅拓片（单张超宽 QA）",
      },
      key: "single-ultrawide",
      label: "Single ultra-wide",
    },
    {
      catalogId: "qa-visual-inscription-02",
      detail: {
        aliases: ["山门题名", "北壁旧刻"],
        facts: [
          { label: "朝代", value: "唐" },
          { label: "年代", value: "开元八年" },
          { label: "地区", value: "陕西 · 汉中" },
          { label: "现址", value: "山门北壁" },
          { label: "保管 / 现藏单位", value: "QA 山门文管所" },
        ],
        id: "qa-detail-inscription-complete",
        kind: "inscription",
        media: [
          qaMedia(
            origin,
            "inscription-complete",
            1,
            "stone-detail.svg",
            "完整碑刻正面 QA 图",
            360,
            610,
          ),
          qaMedia(
            origin,
            "inscription-complete",
            2,
            "rubbing-fragment.svg",
            "完整碑刻拓片 QA 图",
            360,
            480,
          ),
          qaMedia(
            origin,
            "inscription-complete",
            3,
            "discovery-stone.svg",
            "完整碑刻局部 QA 图",
            600,
            760,
          ),
        ],
        periodLabel: "唐 / 开元年间",
        sections: completeSections("完整碑刻"),
        source: "qa",
        sourceCitations: [
          { citation: "卷一，山门北壁。", label: "QA 虚构金石录" },
          { label: "QA 调查笔记" },
        ],
        title: "试验山门题刻（完整 Detail QA）",
      },
      key: "inscription-complete",
      label: "Complete inscription",
    },
    {
      catalogId: "qa-visual-calligraphy-02",
      detail: {
        aliases: ["墨册试页"],
        facts: [
          { label: "类型", value: "纸本书帖" },
          { label: "书体", value: "行草（QA presentation）" },
          { label: "现藏单位", value: "QA 虚构书院" },
        ],
        id: "qa-detail-calligraphy-mixed",
        kind: "calligraphy",
        media: [
          qaMedia(
            origin,
            "calligraphy-mixed",
            1,
            "calligraphy-sheet.svg",
            "混合书帖竖图 QA",
            600,
            760,
          ),
          qaMedia(
            origin,
            "calligraphy-mixed",
            2,
            "inscription-rubbing.svg",
            "混合书帖横图 QA",
            600,
            420,
          ),
          qaMedia(
            origin,
            "calligraphy-mixed",
            3,
            "qa-visual-square.svg",
            "混合书帖方图 QA",
            600,
            600,
          ),
        ],
        periodLabel: "QA 合成时期乙",
        sections: completeSections("混合书帖"),
        source: "qa",
        sourceCitations: [{ label: "QA 虚构法书草目" }],
        title: "墨册试页（混合 Gallery QA）",
      },
      key: "calligraphy-mixed",
      label: "Mixed calligraphy",
    },
    {
      catalogId: "qa-visual-calligraphy-05",
      detail: {
        aliases: ["横卷书样"],
        facts: [{ label: "验收重点", value: "Tablet 两列与超宽跨列" }],
        id: "qa-detail-tablet-ultrawide-grid",
        kind: "calligraphy",
        media: [
          qaMedia(
            origin,
            "tablet-ultrawide-grid",
            1,
            "calligraphy-sheet.svg",
            "Tablet Gallery 主图 QA",
            600,
            760,
          ),
          qaMedia(
            origin,
            "tablet-ultrawide-grid",
            2,
            "stone-detail.svg",
            "Tablet Gallery 普通竖图 QA",
            360,
            610,
          ),
          qaMedia(
            origin,
            "tablet-ultrawide-grid",
            3,
            "valley-wall.svg",
            "Tablet Gallery 超宽跨列 QA",
            1600,
            400,
          ),
          qaMedia(
            origin,
            "tablet-ultrawide-grid",
            4,
            "qa-visual-square.svg",
            "Tablet Gallery 跨列后方图 QA",
            600,
            600,
          ),
          qaMedia(
            origin,
            "tablet-ultrawide-grid",
            5,
            "inscription-rubbing.svg",
            "Tablet Gallery 跨列后横图 QA",
            600,
            420,
          ),
        ],
        periodLabel: "QA 合成时期丙",
        sections: completeSections("Tablet 超宽 Gallery"),
        source: "qa",
        sourceCitations: [{ label: "QA Tablet 视觉验收记录" }],
        title: "横卷书样（Tablet 超宽 Gallery QA）",
      },
      key: "tablet-ultrawide-grid",
      label: "Tablet ultra-wide grid",
    },
    {
      catalogId: "qa-visual-inscription-09",
      detail: {
        aliases: [],
        facts: [{ label: "媒体状态", value: "显式无公开媒体" }],
        id: "qa-detail-no-media",
        kind: "inscription",
        media: [],
        periodLabel: "QA 合成时期己",
        sections: [
          section("introduction", "简介", "显式无媒体 Detail 场景。"),
          section("transcription", "释文", "无媒体场景仍保留独立释文板块。"),
          section("historical-context", "历史背景", "无媒体历史背景校样。"),
          section("scholarly-research", "学术研究", "无媒体研究内容校样。"),
        ],
        source: "qa",
        sourceCitations: [],
        title: "无图碑刻甲（Detail QA）",
      },
      key: "no-media",
      label: "No media",
    },
    {
      catalogId: "qa-visual-inscription-03",
      detail: {
        aliases: ["长内容残刻"],
        facts: [],
        factsPlaceholder: "资料待接入",
        id: "qa-detail-long-partial",
        kind: "inscription",
        media: [
          qaMedia(
            origin,
            "long-partial",
            1,
            "stone-detail.svg",
            "长内容碑刻视觉 QA 图",
            360,
            610,
          ),
          qaMedia(
            origin,
            "long-partial",
            2,
            "cliff-gate.svg",
            "长内容碑刻横向 QA 图",
            1600,
            1060,
          ),
        ],
        periodLabel: "QA 合成时期乙",
        sections: [
          section(
            "introduction",
            "简介",
            "这是一段较长的简介，用于核对窄屏、平板与桌面阅读宽度。内容连续展开，不依赖折叠控件，也不把不同语义的文字合并成一个通用说明字段。",
          ),
          section(
            "transcription",
            "释文",
            "山川相缪，郁乎苍苍。此处使用较长的合成释文反复核对自然换行、标点节奏和长页面滚动。释文保持独立，不进入简介或学术研究。",
          ),
          section(
            "scholarly-research",
            "学术研究",
            "本段为视觉 QA 合成长研究内容。第一层观察字形与石面关系，第二层比较旧拓与近照，第三层记录不同设备上的行宽、段距与滚动恢复。历史背景和说明被有意省略，用来证明部分内容缺失时不会出现虚假文本。",
          ),
        ],
        source: "qa",
        sourceCitations: [],
        title:
          "视觉验收用超长碑刻标题用于检验手机平板与桌面多行换行以及返回后滚动恢复（合成 Detail QA）",
      },
      key: "long-partial",
      label: "Long partial content",
    },
  ];
};

export const detailQaScenarioForCatalogId = (
  scenarios: readonly DetailQaScenario[],
  catalogId: string,
): DetailQaScenario | undefined =>
  scenarios.find((scenario) => scenario.catalogId === catalogId);

export const detailQaScenarioByKey = (
  scenarios: readonly DetailQaScenario[],
  key: string | undefined,
): DetailQaScenario | undefined =>
  scenarios.find((scenario) => scenario.key === key);
