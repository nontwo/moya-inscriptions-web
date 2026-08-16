/**
 * Prototype-only Catalog Detail records for layout and interaction QA.
 * Public-shaped fields follow CatalogDetail names; nested prototypeFacts are
 * not Public API fields. Local demo `src` paths are not production Media URLs.
 */

(() => {
  const asset = (name) => `../../design-system/assets/demo/${name}.svg`;
  const media = (id, name, alt, width, height) => ({
    alt,
    height,
    id,
    kind: "image",
    src: asset(name),
    width,
  });

  const records = {
    "discover-cliff-gate": {
      aliases: ["山门题名", "北壁旧刻"],
      description:
        "山门北壁题记为虚构档案条目，用来核对详情页在多图、长说明和基本资料同时出现时的阅读节奏。文字保持连续可读，不展开释文或校勘层。石面风化后字口变浅，旧拓与近照并陈，便于核对照相比例与图文关系。附近崖壁另有数处残字，未并入本条。",
      id: "discover-cliff-gate",
      kind: "inscription",
      media: [
        media(
          "discover-cliff-gate-1",
          "cliff-gate",
          "虚构山门摩崖图",
          1600,
          1060,
        ),
        media(
          "discover-cliff-gate-2",
          "stone-detail",
          "虚构山门题记局部图",
          1200,
          1600,
        ),
        media(
          "discover-cliff-gate-3",
          "valley-wall",
          "虚构山门侧壁图",
          1600,
          900,
        ),
      ],
      periodLabel: "唐 / 开元年间",
      prototypeFacts: {
        currentCustodian: "虚构山门文管所",
        currentLocation: "山门北壁",
        dateText: "开元八年",
        dynasty: "唐",
        prefecture: "汉中",
        province: "陕西",
      },
      representativeMedia: media(
        "discover-cliff-gate-1",
        "cliff-gate",
        "虚构山门摩崖图",
        1600,
        1060,
      ),
      sourceCitations: [
        {
          citation: "卷一，山门北壁。",
          label: "虚构金石录",
          url: "https://example.invalid/cliff-gate",
        },
        { label: "地方志摘抄" },
        {
          citation: "近照对照说明。",
          label: "调查笔记",
        },
      ],
      summary:
        "山门北壁一区题记，用来核对图像、身份行和基本资料同屏阅读的详情结构。",
      title: "山门北壁题记",
    },
    "inscription-shimen": {
      aliases: [],
      id: "inscription-shimen",
      kind: "inscription",
      media: [
        media(
          "inscription-shimen-1",
          "stone-detail",
          "虚构石门东侧残刻缩略图",
          1200,
          900,
        ),
      ],
      representativeMedia: media(
        "inscription-shimen-1",
        "stone-detail",
        "虚构石门东侧残刻缩略图",
        1200,
        900,
      ),
      sourceCitations: [],
      title: "石门东侧残刻",
    },
    "inscription-road": {
      aliases: [],
      id: "inscription-road",
      kind: "inscription",
      media: [],
      sourceCitations: [],
      title: "古道石刻",
    },
    "inscription-yunfeng": {
      aliases: ["云峰题名"],
      id: "inscription-yunfeng",
      kind: "inscription",
      media: [
        media(
          "inscription-yunfeng-1",
          "rubbing-fragment",
          "虚构云峰山题名缩略图",
          1200,
          900,
        ),
        media(
          "inscription-yunfeng-2",
          "cliff-gate",
          "虚构云峰山崖壁图",
          1600,
          1060,
        ),
        media(
          "inscription-yunfeng-3",
          "discovery-stone",
          "虚构云峰山近景图",
          1100,
          1100,
        ),
        media(
          "inscription-yunfeng-4",
          "stele-shadow",
          "虚构云峰山侧影图",
          900,
          1400,
        ),
      ],
      periodLabel: "北魏",
      sourceCitations: [
        { label: "云峰山调查草目", url: "https://example.invalid/yunfeng" },
      ],
      summary: "多图碑刻条目，用来核对图库切换与当前位置。",
      title: "云峰山题名",
    },
    "inscription-tianzhu": {
      aliases: [],
      description: "天柱山一处高窄摩崖，用来核对着录图像的极端竖向比例。",
      id: "inscription-tianzhu",
      kind: "inscription",
      media: [
        media(
          "inscription-tianzhu-1",
          "inscription-rubbing",
          "虚构天柱山摩崖缩略图",
          640,
          2200,
        ),
      ],
      periodLabel: "唐",
      representativeMedia: media(
        "inscription-tianzhu-1",
        "inscription-rubbing",
        "虚构天柱山摩崖缩略图",
        640,
        2200,
      ),
      sourceCitations: [],
      title: "天柱山摩崖",
    },
    "calligraphy-autumn": {
      aliases: ["秋山手札"],
      description:
        "秋山札为书帖共用详情壳层的核对本。版式、图库、来源和基本资料与碑刻同一套结构，不另开书帖详情系统。",
      id: "calligraphy-autumn",
      kind: "calligraphy",
      media: [
        media("calligraphy-autumn-1", "ink-album", "虚构秋山札图", 1200, 1600),
        media(
          "calligraphy-autumn-2",
          "calligraphy-sheet",
          "虚构秋山札续页图",
          1200,
          900,
        ),
      ],
      periodLabel: "宋",
      prototypeFacts: {
        currentCustodian: "虚构书院",
        currentLocation: "纸本册页",
        dateText: "南宋",
        dynasty: "宋",
        province: "浙江",
      },
      representativeMedia: media(
        "calligraphy-autumn-1",
        "ink-album",
        "虚构秋山札图",
        1200,
        1600,
      ),
      sourceCitations: [
        { citation: "册页第三开。", label: "虚构法书记" },
        { label: "馆藏草目", url: "https://example.invalid/autumn" },
      ],
      summary: "纸本墨迹，用来核对书帖与碑刻共用的详情结构。",
      title: "秋山札",
    },
    "inscription-longmen": {
      aliases: ["龙门造像记"],
      description:
        "龙门北壁造像记用来核对长说明与多来源并陈时的阅读宽度。正文连续排下，不使用展开全文，也不进入释文、校勘或批注系统。造像记文字虽短，说明层仍给出足够段落，观察详情在桌面分栏之下如何把长文约束在舒适行宽内，同时让图像保持独立的视觉尺度。附近还有若干未收录残字，仅作背景，不构成本条正文。第二段继续铺陈调查经过、旧拓流传和近照对照，使来源列表与说明之间有稳定的节奏，而不是数据库字段的机械堆叠。",
      id: "inscription-longmen",
      kind: "inscription",
      media: [
        media(
          "inscription-longmen-1",
          "cliff-gate",
          "虚构龙门北壁造像记缩略图",
          1600,
          1060,
        ),
      ],
      periodLabel: "北魏",
      representativeMedia: media(
        "inscription-longmen-1",
        "cliff-gate",
        "虚构龙门北壁造像记缩略图",
        1600,
        1060,
      ),
      sourceCitations: [
        { label: "龙门草目" },
        {
          citation: "北壁造像记条。",
          label: "石刻叙录",
        },
        { label: "旧拓题记", url: "https://example.invalid/longmen" },
        {
          citation: "近照对照一则。",
          label: "调查摘录",
          url: "https://example.invalid/longmen-note",
        },
      ],
      summary: "长说明与多来源条目，用来核对比详情更长的阅读密度。",
      title: "龙门北壁造像记",
    },
    "d08-loading": {
      id: "d08-loading",
      lifecycle: "loading",
    },
    "d09-not-found": {
      id: "d09-not-found",
      lifecycle: "not-found",
    },
    "d10-unavailable": {
      id: "d10-unavailable",
      lifecycle: "unavailable",
    },
    "d10-error": {
      id: "d10-error",
      lifecycle: "error",
    },
  };

  globalThis.YOYI_CATALOG_DETAIL_PLACEHOLDER = {
    records,
    version: "catalog-detail-v1",
  };
})();
