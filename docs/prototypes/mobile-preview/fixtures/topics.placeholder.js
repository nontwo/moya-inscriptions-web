/**
 * TOPICS_PLACEHOLDER_START
 * Deletable prototype fixture for editorial topics (topics-v1).
 * Not production data. Future content models and APIs remain undecided.
 * Wrapped in IIFE so classic <script> tags do not collide with preview.js.
 * TOPICS_PLACEHOLDER_END
 */

(() => {
  const topicsPlaceholderVersion = "topics-v1";

  const topicCards = [
    {
      id: "topic-cliff-paths",
      kind: "editorialTopic",
      title: "摩崖之路",
      blurb: "沿着山壁阅读石刻与题名的策展短篇。",
      cover: "../../design-system/assets/demo/cliff-gate.svg",
      coverAlt: "虚构摩崖山门图",
      blocks: [
        {
          type: "lead",
          text: "本专栏演示策展混排：以虚构条目呈现 Europeana 式主题浏览气质，不代表真实著录。",
        },
        {
          type: "image",
          src: "../../design-system/assets/demo/valley-wall.svg",
          alt: "虚构山谷摩崖图",
          caption: "山壁上的题记往往随光线与视角变化。",
        },
        {
          type: "rich-text",
          text: "正式产品中的内容模型、发布主体与数据边界另行决定；本占位不代表用户帖或低代码万能稿件。",
        },
        {
          type: "video",
          caption: "视频占位（无真实文件，不自动播放）。",
        },
        {
          type: "quote",
          text: "志于道，据于德，依于仁，游于艺。",
        },
      ],
    },
    {
      id: "topic-rubbing-light",
      kind: "editorialTopic",
      title: "拓影光痕",
      blurb: "从拓片肌理到墨色层次的阅读提示。",
      cover: "../../design-system/assets/demo/rubbing-fragment.svg",
      coverAlt: "虚构拓片残片图",
      blocks: [
        {
          type: "lead",
          text: "拓片不是简单的黑白对比，而是纸、墨与石面之间的痕迹。",
        },
        {
          type: "image",
          src: "../../design-system/assets/demo/inscription-rubbing.svg",
          alt: "虚构碑刻拓本图",
          caption: "演示图：拓本局部。",
        },
        {
          type: "rich-text",
          text: "第二阶段媒体主线仍是原图与衍生图；本处视频仅为轻量占位，不引入外链 CDN。",
        },
        {
          type: "video",
          caption: "拓片观察示意（占位）。",
        },
      ],
    },
    {
      id: "topic-stele-shadow",
      kind: "editorialTopic",
      title: "碑影侧记",
      blurb: "竖碑、残刻与馆藏语境的短篇导览。",
      cover: "../../design-system/assets/demo/stele-shadow.svg",
      coverAlt: "虚构碑影图",
      blocks: [
        {
          type: "lead",
          text: "石碑立于庭院或山门，影子与铭文一同被观看。",
        },
        {
          type: "image",
          src: "../../design-system/assets/demo/stone-detail.svg",
          alt: "虚构石刻局部图",
        },
        {
          type: "rich-text",
          text: "卡片来源标识为「专题/策展」，预留 kind=editorialTopic；未知 kind 可忽略。",
        },
        {
          type: "quote",
          text: "游于艺，是在规矩之中找到观看的余韵。",
        },
      ],
    },
    {
      id: "topic-stone-gates",
      kind: "editorialTopic",
      title: "石门访古",
      blurb: "从山门、关隘与洞窟入口辨认题刻所在的空间。",
      cover: "../../design-system/assets/demo/cliff-gate.svg",
      coverAlt: "虚构石门访古图",
      blocks: [
        {
          type: "lead",
          text: "石门既是通道，也是题名聚集的界面；不同年代的字迹在此彼此叠映。",
        },
        {
          type: "image",
          src: "../../design-system/assets/demo/cliff-gate.svg",
          alt: "虚构石门题刻图",
          caption: "演示图：山门与题刻位置关系。",
        },
        {
          type: "rich-text",
          text: "测试专栏以多段内容模拟真实策展阅读，用于检验首次进入、连续滚动和返回位置。",
        },
        {
          type: "quote",
          text: "门内门外，石壁记录着往来者的名字。",
        },
      ],
    },
    {
      id: "topic-temple-steles",
      kind: "editorialTopic",
      title: "山寺碑刻",
      blurb: "观察寺院、碑廊与山林之间保存文字的方式。",
      cover: "../../design-system/assets/demo/stele-shadow.svg",
      coverAlt: "虚构山寺碑刻图",
      blocks: [
        {
          type: "lead",
          text: "山寺碑刻常与道路、殿宇和庭院共同构成阅读次序。",
        },
        {
          type: "image",
          src: "../../design-system/assets/demo/stele-shadow.svg",
          alt: "虚构碑廊图",
          caption: "演示图：庭院中的碑影。",
        },
        {
          type: "rich-text",
          text: "专题页面保留较长正文，便于验证手机和平板上的纵向滚动、旋转和历史返回。",
        },
        {
          type: "quote",
          text: "碑在山中，字随日影明灭。",
        },
      ],
    },
    {
      id: "topic-paper-stone",
      kind: "editorialTopic",
      title: "纸墨与石",
      blurb: "比较原石、拓片与书帖之间不同的观看尺度。",
      cover: "../../design-system/assets/demo/ink-album.svg",
      coverAlt: "虚构纸墨与石专题图",
      blocks: [
        {
          type: "lead",
          text: "同一文字从石面进入纸本，会获得新的墨色、边缘与阅读节奏。",
        },
        {
          type: "image",
          src: "../../design-system/assets/demo/inscription-rubbing.svg",
          alt: "虚构碑刻拓本图",
          caption: "演示图：纸本中的石刻字口。",
        },
        {
          type: "rich-text",
          text: "这里同时复用原型媒体资源，不新增外部地址或生产数据依赖。",
        },
        {
          type: "video",
          caption: "纸墨层次观察（占位）。",
        },
      ],
    },
    {
      id: "topic-character-reading",
      kind: "editorialTopic",
      title: "字口辨读",
      blurb: "从残损边缘、光线方向和拓印层次辨认字形。",
      cover: "../../design-system/assets/demo/stone-detail.svg",
      coverAlt: "虚构字口辨读图",
      blocks: [
        {
          type: "lead",
          text: "残字的辨读依赖轮廓、深浅与相邻笔画，单张照片往往不能提供全部信息。",
        },
        {
          type: "image",
          src: "../../design-system/assets/demo/stone-detail.svg",
          alt: "虚构石刻字口局部图",
          caption: "演示图：不同深浅的刻痕。",
        },
        {
          type: "rich-text",
          text: "正式档案将结合多分辨率图像和著录信息；本页仅用于交互与布局验证。",
        },
        {
          type: "quote",
          text: "辨一画之起止，也是在重建观看的条件。",
        },
      ],
    },
    {
      id: "topic-travel-inscriptions",
      kind: "editorialTopic",
      title: "行旅题名",
      blurb: "沿山路、溪谷与关口追踪古代行旅留下的题名。",
      cover: "../../design-system/assets/demo/valley-wall.svg",
      coverAlt: "虚构行旅题名图",
      blocks: [
        {
          type: "lead",
          text: "题名标记一次到访，也把个人行迹留在更长久的地景中。",
        },
        {
          type: "image",
          src: "../../design-system/assets/demo/valley-wall.svg",
          alt: "虚构溪谷摩崖图",
          caption: "演示图：道路旁的题名石壁。",
        },
        {
          type: "rich-text",
          text: "该专题补足列表长度，并用于测试横竖屏转换后的分页对齐与滚动位置保持。",
        },
        {
          type: "quote",
          text: "山川不语，题名记录了经过。",
        },
      ],
    },
  ];

  function getTopicById(id) {
    return topicCards.find((topic) => topic.id === id) ?? null;
  }

  globalThis.YOYI_TOPICS_PLACEHOLDER = {
    version: topicsPlaceholderVersion,
    topicCards,
    getTopicById,
  };
})();
