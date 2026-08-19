import calligraphySheet from "../../../docs/design-system/assets/demo/calligraphy-sheet.svg";
import cliffGate from "../../../docs/design-system/assets/demo/cliff-gate.svg";
import discoveryStone from "../../../docs/design-system/assets/demo/discovery-stone.svg";
import inkAlbum from "../../../docs/design-system/assets/demo/ink-album.svg";
import inscriptionRubbing from "../../../docs/design-system/assets/demo/inscription-rubbing.svg";
import rubbingFragment from "../../../docs/design-system/assets/demo/rubbing-fragment.svg";
import steleShadow from "../../../docs/design-system/assets/demo/stele-shadow.svg";
import stoneDetail from "../../../docs/design-system/assets/demo/stone-detail.svg";
import valleyWall from "../../../docs/design-system/assets/demo/valley-wall.svg";

export type DemoContentId = string & {
  readonly __demoContentId: unique symbol;
};
export type DemoTopicId = string & { readonly __demoTopicId: unique symbol };

export interface DemoMedia {
  readonly id: string;
  readonly src: string;
  readonly alt: string;
  readonly width: number;
  readonly height: number;
}

export interface DemoSourceCitation {
  readonly label: string;
  readonly citation?: string | undefined;
}

export interface DemoCatalogRecord {
  readonly id: DemoContentId;
  readonly kind: "inscription" | "calligraphy";
  readonly title: string;
  readonly periodLabel?: string | undefined;
  readonly styleLabel?: string | undefined;
  readonly category?: "ink" | "rubbing" | undefined;
  readonly aliases: readonly string[];
  readonly summary?: string | undefined;
  readonly description?: string | undefined;
  readonly media: readonly DemoMedia[];
  readonly facts?: Readonly<Record<string, string>> | undefined;
  readonly sources: readonly DemoSourceCitation[];
  readonly searchText: string;
}

export type DemoTopicBlock =
  | { readonly type: "lead" | "rich-text" | "quote"; readonly text: string }
  | {
      readonly type: "image";
      readonly src: string;
      readonly alt: string;
      readonly caption?: string | undefined;
    }
  | { readonly type: "video"; readonly caption: string };

export interface DemoTopic {
  readonly id: DemoTopicId;
  readonly title: string;
  readonly blurb: string;
  readonly cover: string;
  readonly coverAlt: string;
  readonly blocks: readonly DemoTopicBlock[];
}

const demoId = (value: string) => value as DemoContentId;
const topicId = (value: string) => value as DemoTopicId;
type DemoAsset = string | { readonly src: string };
const asset = (value: DemoAsset) =>
  typeof value === "string" ? value : value.src;
const media = (
  id: string,
  image: DemoAsset,
  alt: string,
  width: number,
  height: number,
): DemoMedia => ({ id, src: asset(image), alt, width, height });

const simpleRecord = ({
  id,
  kind,
  title,
  image,
  alt,
  periodLabel,
  styleLabel,
  category,
}: {
  id: string;
  kind: DemoCatalogRecord["kind"];
  title: string;
  image: DemoAsset;
  alt: string;
  periodLabel?: string;
  styleLabel?: string;
  category?: DemoCatalogRecord["category"];
}): DemoCatalogRecord => ({
  id: demoId(id),
  kind,
  title,
  periodLabel,
  styleLabel,
  category,
  aliases: [],
  media: [media(`${id}-1`, image, alt, 1200, 900)],
  sources: [],
  searchText: [
    title,
    kind === "inscription" ? "碑刻" : "书帖",
    periodLabel,
    styleLabel,
  ]
    .filter(Boolean)
    .join(" "),
});

const richRecords: readonly DemoCatalogRecord[] = [
  {
    id: demoId("discover-cliff-gate"),
    kind: "inscription",
    title: "山门北壁题记",
    periodLabel: "唐 / 开元年间",
    aliases: ["山门题名", "北壁旧刻"],
    summary:
      "山门北壁一区题记，用来核对图像、身份行和基本资料同屏阅读的详情结构。",
    description:
      "山门北壁题记为虚构档案条目，用来核对详情页在多图、长说明和基本资料同时出现时的阅读节奏。文字保持连续可读，不展开释文或校勘层。石面风化后字口变浅，旧拓与近照并陈，便于核对照相比例与图文关系。附近崖壁另有数处残字，未并入本条。",
    media: [
      media("discover-cliff-gate-1", cliffGate, "虚构山门摩崖图", 1600, 1060),
      media(
        "discover-cliff-gate-2",
        stoneDetail,
        "虚构山门题记局部图",
        1200,
        1600,
      ),
      media("discover-cliff-gate-3", valleyWall, "虚构山门侧壁图", 1600, 900),
    ],
    facts: {
      朝代: "唐",
      年代: "开元八年",
      省份: "陕西",
      地区: "汉中",
      现址: "山门北壁",
      保管: "虚构山门文管所",
    },
    sources: [
      { label: "虚构金石录", citation: "卷一，山门北壁。" },
      { label: "地方志摘抄" },
      { label: "调查笔记", citation: "近照对照说明。" },
    ],
    searchText: "山门北壁题记 山门题名 北壁旧刻 唐 开元 碑刻",
  },
  {
    id: demoId("inscription-shimen"),
    kind: "inscription",
    title: "石门东侧残刻",
    aliases: [],
    media: [
      media(
        "inscription-shimen-1",
        stoneDetail,
        "虚构石门东侧残刻缩略图",
        1200,
        900,
      ),
    ],
    sources: [],
    searchText: "石门东侧残刻 碑刻 东汉 隶书 汉中石门",
  },
  {
    id: demoId("inscription-road"),
    kind: "inscription",
    title: "古道石刻",
    periodLabel: "宋",
    aliases: [],
    media: [],
    sources: [],
    searchText: "古道石刻 碑刻 宋 楷书 浙东古道",
  },
  {
    id: demoId("inscription-yunfeng"),
    kind: "inscription",
    title: "云峰山题名",
    periodLabel: "北魏",
    aliases: ["云峰题名"],
    summary: "多图碑刻条目，用来核对图库切换、页码、底部小点与不同长宽比适配。",
    media: [
      media(
        "inscription-yunfeng-1",
        rubbingFragment,
        "虚拟测试图片 云峰山题名-01（竖图）",
        360,
        480,
      ),
      media(
        "inscription-yunfeng-2",
        cliffGate,
        "虚拟测试图片 云峰山题名-02（横图）",
        1600,
        900,
      ),
      media(
        "inscription-yunfeng-3",
        discoveryStone,
        "虚拟测试图片 云峰山题名-03（方图）",
        1100,
        1100,
      ),
      media(
        "inscription-yunfeng-4",
        steleShadow,
        "虚拟测试图片 云峰山题名-04（超长竖图）",
        640,
        2200,
      ),
      media(
        "inscription-yunfeng-5",
        inscriptionRubbing,
        "虚拟测试图片 云峰山题名-05（超宽横图）",
        1800,
        420,
      ),
    ],
    sources: [{ label: "云峰山调查草目" }],
    searchText: "云峰山题名 云峰题名 碑刻 北魏 楷书 山东云峰山",
  },
  {
    id: demoId("inscription-tianzhu"),
    kind: "inscription",
    title: "天柱山摩崖",
    periodLabel: "唐",
    aliases: [],
    description: "天柱山一处高窄摩崖，用来核对着录图像的极端竖向比例。",
    media: [
      media(
        "inscription-tianzhu-1",
        inscriptionRubbing,
        "虚构天柱山摩崖缩略图",
        640,
        2200,
      ),
    ],
    sources: [],
    searchText: "天柱山摩崖 碑刻 唐 行书 安徽天柱山",
  },
  {
    id: demoId("inscription-longmen"),
    kind: "inscription",
    title: "龙门北壁造像记",
    periodLabel: "北魏",
    aliases: ["龙门造像记"],
    summary: "长说明与多来源条目，用来核对比详情更长的阅读密度。",
    description:
      "龙门北壁造像记用来核对长说明与多来源并陈时的阅读宽度。正文连续排下，不使用展开全文，也不进入释文、校勘或批注系统。造像记文字虽短，说明层仍给出足够段落，观察详情在桌面分栏之下如何把长文约束在舒适行宽内，同时让图像保持独立的视觉尺度。附近还有若干未收录残字，仅作背景，不构成本条正文。第二段继续铺陈调查经过、旧拓流传和近照对照，使来源列表与说明之间有稳定的节奏，而不是数据库字段的机械堆叠。",
    media: [
      media(
        "inscription-longmen-1",
        cliffGate,
        "虚构龙门北壁造像记缩略图",
        1600,
        1060,
      ),
    ],
    sources: [
      { label: "龙门草目" },
      { label: "石刻叙录", citation: "北壁造像记条。" },
      { label: "旧拓题记" },
      { label: "调查摘录", citation: "近照对照一则。" },
    ],
    searchText: "龙门北壁造像记 龙门造像记 碑刻 北魏 魏碑 洛阳龙门",
  },
  {
    id: demoId("calligraphy-autumn"),
    kind: "calligraphy",
    title: "秋山札",
    periodLabel: "宋",
    styleLabel: "行书",
    category: "ink",
    aliases: ["秋山手札"],
    summary: "纸本墨迹，用来核对书帖与碑刻共用的详情结构。",
    description:
      "秋山札为书帖共用详情壳层的核对本。版式、图库、来源和基本资料与碑刻同一套结构，不另开书帖详情系统。",
    media: [
      media("calligraphy-autumn-1", inkAlbum, "虚构秋山札图", 1200, 1600),
      media(
        "calligraphy-autumn-2",
        calligraphySheet,
        "虚构秋山札续页图",
        1200,
        900,
      ),
      media(
        "calligraphy-autumn-3",
        discoveryStone,
        "虚拟测试图片 秋山札-03（方图）",
        900,
        900,
      ),
    ],
    facts: {
      朝代: "宋",
      年代: "南宋",
      省份: "浙江",
      现址: "纸本册页",
      保管: "虚构书院",
    },
    sources: [
      { label: "虚构法书记", citation: "册页第三开。" },
      { label: "馆藏草目" },
    ],
    searchText: "秋山札 秋山手札 宋 行书 墨迹",
  },
  {
    id: demoId("calligraphy-pine"),
    kind: "calligraphy",
    title: "松窗帖",
    periodLabel: "明",
    styleLabel: "楷书",
    category: "ink",
    aliases: ["松窗"],
    summary: "七图书帖条目，用来核对较多页码与底部小点。",
    description:
      "松窗帖为虚拟多图压力测试条目，七张演示图覆盖竖图、横图、方图、超长、超宽与特殊比例。",
    media: [
      media(
        "calligraphy-pine-1",
        calligraphySheet,
        "虚拟测试图片 松窗帖-01（竖图）",
        600,
        760,
      ),
      media(
        "calligraphy-pine-2",
        inscriptionRubbing,
        "虚拟测试图片 松窗帖-02（横图）",
        600,
        420,
      ),
      media(
        "calligraphy-pine-3",
        discoveryStone,
        "虚拟测试图片 松窗帖-03（方图）",
        800,
        800,
      ),
      media(
        "calligraphy-pine-4",
        stoneDetail,
        "虚拟测试图片 松窗帖-04（超长竖图）",
        360,
        1400,
      ),
      media(
        "calligraphy-pine-5",
        valleyWall,
        "虚拟测试图片 松窗帖-05（超宽横图）",
        1600,
        400,
      ),
      media(
        "calligraphy-pine-6",
        steleShadow,
        "虚拟测试图片 松窗帖-06（近方形）",
        900,
        960,
      ),
      media(
        "calligraphy-pine-7",
        cliffGate,
        "虚拟测试图片 松窗帖-07（特殊比例）",
        480,
        720,
      ),
    ],
    facts: { 朝代: "明", 年代: "明" },
    sources: [{ label: "虚构法书草目" }],
    searchText: "松窗帖 松窗 明 楷书 墨迹",
  },
];

const additionalInscriptions = [
  simpleRecord({
    id: "inscription-ridge",
    kind: "inscription",
    title: "云岭残题",
    image: valleyWall,
    alt: "虚构云岭残题图",
    periodLabel: "唐",
  }),
  simpleRecord({
    id: "inscription-temple",
    kind: "inscription",
    title: "南寺碑廊",
    image: steleShadow,
    alt: "虚构南寺碑廊图",
    periodLabel: "明",
  }),
];

const additionalCalligraphy = [
  simpleRecord({
    id: "calligraphy-preface",
    kind: "calligraphy",
    title: "集字圣教序",
    image: rubbingFragment,
    alt: "虚构集字圣教序拓本图",
    periodLabel: "唐",
    styleLabel: "行书",
    category: "rubbing",
  }),
  simpleRecord({
    id: "calligraphy-cursive",
    kind: "calligraphy",
    title: "草书残卷",
    image: inkAlbum,
    alt: "虚构草书残卷图",
    periodLabel: "唐",
    styleLabel: "草书",
    category: "ink",
  }),
  simpleRecord({
    id: "calligraphy-beihai",
    kind: "calligraphy",
    title: "北海刻帖",
    image: inscriptionRubbing,
    alt: "虚构北海刻帖拓本图",
    periodLabel: "唐",
    styleLabel: "楷书",
    category: "rubbing",
  }),
  simpleRecord({
    id: "calligraphy-shimen",
    kind: "calligraphy",
    title: "石门铭拓片",
    image: stoneDetail,
    alt: "虚构石门铭拓片图",
    periodLabel: "北魏",
    styleLabel: "魏碑",
    category: "rubbing",
  }),
  simpleRecord({
    id: "calligraphy-caoquan",
    kind: "calligraphy",
    title: "曹全碑拓",
    image: steleShadow,
    alt: "虚构曹全碑拓图",
    periodLabel: "东汉",
    styleLabel: "隶书",
    category: "rubbing",
  }),
  simpleRecord({
    id: "calligraphy-lanting",
    kind: "calligraphy",
    title: "兰亭临本",
    image: calligraphySheet,
    alt: "虚构兰亭临本图",
    periodLabel: "晋",
    styleLabel: "行书",
    category: "ink",
  }),
  simpleRecord({
    id: "calligraphy-yizijue",
    kind: "calligraphy",
    title: "龙门二十品",
    image: cliffGate,
    alt: "虚构龙门二十品图",
    periodLabel: "北魏",
    styleLabel: "魏碑",
    category: "rubbing",
  }),
  simpleRecord({
    id: "calligraphy-hanshan",
    kind: "calligraphy",
    title: "寒山诗札",
    image: inkAlbum,
    alt: "虚构寒山诗札图",
    periodLabel: "唐",
    styleLabel: "行草",
    category: "ink",
  }),
  simpleRecord({
    id: "calligraphy-yanqinli",
    kind: "calligraphy",
    title: "颜勤礼碑",
    image: inscriptionRubbing,
    alt: "虚构颜勤礼碑图",
    periodLabel: "唐",
    styleLabel: "楷书",
    category: "rubbing",
  }),
  simpleRecord({
    id: "calligraphy-huashan",
    kind: "calligraphy",
    title: "华山庙碑",
    image: valleyWall,
    alt: "虚构华山庙碑图",
    periodLabel: "东汉",
    styleLabel: "隶书",
    category: "rubbing",
  }),
];

export const demoCatalogRecords = [
  ...richRecords,
  ...additionalInscriptions,
  ...additionalCalligraphy,
] as const;

export const demoInscriptions = demoCatalogRecords.filter(
  (record) => record.kind === "inscription",
);
export const demoCalligraphy = demoCatalogRecords.filter(
  (record) => record.kind === "calligraphy",
);

const nearbyBase = [
  ["nearby-valley", "城北石壁", valleyWall, "虚构城北石壁图"],
  ["nearby-rubbing", "旧拓残片", rubbingFragment, "虚构旧拓残片图"],
  ["nearby-gate", "溪谷题名", cliffGate, "虚构溪谷题名图"],
  ["nearby-stele", "西岭碑影", steleShadow, "虚构西岭石碑图"],
  ["nearby-sheet", "寺中藏帖", calligraphySheet, "虚构寺中藏帖图"],
  ["nearby-cliff", "近郊摩崖", discoveryStone, "虚构近郊摩崖图"],
  ["nearby-temple", "南寺碑廊", steleShadow, "虚构南寺碑廊图"],
  ["nearby-stream", "东涧题名", valleyWall, "虚构东涧题名图"],
  ["nearby-pass", "山口残刻", cliffGate, "虚构山口残刻图"],
  ["nearby-paper", "旧藏墨册", inkAlbum, "虚构旧藏墨册图"],
  ["nearby-fragment", "桥北断碑", stoneDetail, "虚构桥北断碑图"],
  ["nearby-ink", "近郊拓影", inscriptionRubbing, "虚构近郊拓影图"],
] as const;

export const demoNearbyRecords = nearbyBase.map(([id, title, image, alt]) =>
  simpleRecord({ id, kind: "inscription", title, image, alt }),
);

export const demoCatalogById = new Map(
  [...demoCatalogRecords, ...demoNearbyRecords].map((record) => [
    record.id,
    record,
  ]),
);

const topic = (
  id: string,
  title: string,
  blurb: string,
  cover: DemoAsset,
  coverAlt: string,
  lead: string,
  body: string,
  quote?: string,
): DemoTopic => ({
  id: topicId(id),
  title,
  blurb,
  cover: asset(cover),
  coverAlt,
  blocks: [
    { type: "lead", text: lead },
    { type: "image", src: asset(cover), alt: coverAlt },
    { type: "rich-text", text: body },
    ...(quote === undefined ? [] : [{ type: "quote" as const, text: quote }]),
  ],
});

export const demoTopics: readonly DemoTopic[] = [
  topic(
    "topic-cliff-paths",
    "摩崖之路",
    "沿着山壁阅读石刻与题名的策展短篇。",
    cliffGate,
    "虚构摩崖山门图",
    "本专栏演示策展混排：以虚构条目呈现主题浏览气质，不代表真实著录。",
    "正式产品中的内容模型、发布主体与数据边界另行决定；本占位不代表用户帖或低代码万能稿件。",
    "志于道，据于德，依于仁，游于艺。",
  ),
  topic(
    "topic-rubbing-light",
    "拓影光痕",
    "从拓片肌理到墨色层次的阅读提示。",
    rubbingFragment,
    "虚构拓片残片图",
    "拓片不是简单的黑白对比，而是纸、墨与石面之间的痕迹。",
    "第二阶段媒体主线仍是原图与衍生图；本处视频仅为轻量占位，不引入外链 CDN。",
  ),
  topic(
    "topic-stele-shadow",
    "碑影侧记",
    "竖碑、残刻与馆藏语境的短篇导览。",
    steleShadow,
    "虚构碑影图",
    "石碑立于庭院或山门，影子与铭文一同被观看。",
    "卡片来源标识为专题策展；正式内容模型仍由未来 Topic capability 决定。",
    "游于艺，是在规矩之中找到观看的余韵。",
  ),
  topic(
    "topic-stone-gates",
    "石门访古",
    "从山门、关隘与洞窟入口辨认题刻所在的空间。",
    cliffGate,
    "虚构石门访古图",
    "石门既是通道，也是题名聚集的界面；不同年代的字迹在此彼此叠映。",
    "测试专栏以多段内容模拟真实策展阅读，用于检验首次进入、连续滚动和返回位置。",
    "门内门外，石壁记录着往来者的名字。",
  ),
  topic(
    "topic-temple-steles",
    "山寺碑刻",
    "观察寺院、碑廊与山林之间保存文字的方式。",
    steleShadow,
    "虚构山寺碑刻图",
    "山寺碑刻常与道路、殿宇和庭院共同构成阅读次序。",
    "专题页面保留较长正文，便于验证手机和平板上的纵向滚动、旋转和历史返回。",
    "碑在山中，字随日影明灭。",
  ),
  topic(
    "topic-paper-stone",
    "纸墨与石",
    "比较原石、拓片与书帖之间不同的观看尺度。",
    inkAlbum,
    "虚构纸墨与石专题图",
    "同一文字从石面进入纸本，会获得新的墨色、边缘与阅读节奏。",
    "这里同时复用原型媒体资源，不新增外部地址或生产数据依赖。",
  ),
  topic(
    "topic-character-reading",
    "字口辨读",
    "从残损边缘、光线方向和拓印层次辨认字形。",
    stoneDetail,
    "虚构字口辨读图",
    "残字的辨读依赖轮廓、深浅与相邻笔画，单张照片往往不能提供全部信息。",
    "正式档案将结合多分辨率图像和著录信息；本页仅用于交互与布局验证。",
    "辨一画之起止，也是在重建观看的条件。",
  ),
  topic(
    "topic-travel-inscriptions",
    "行旅题名",
    "沿山路、溪谷与关口追踪古代行旅留下的题名。",
    valleyWall,
    "虚构行旅题名图",
    "题名标记一次到访，也把个人行迹留在更长久的地景中。",
    "该专题补足列表长度，并用于测试横竖屏转换后的分页对齐与滚动位置保持。",
    "山川不语，题名记录了经过。",
  ),
];

export const demoTopicById = new Map(demoTopics.map((item) => [item.id, item]));
