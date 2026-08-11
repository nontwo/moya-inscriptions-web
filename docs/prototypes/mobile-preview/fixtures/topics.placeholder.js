/**
 * TOPICS_PLACEHOLDER_START
 * Deletable prototype fixture for editorial topics (topics-v1).
 * Not production data. Replace with EditorialCollection in T06.
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
          text: "正式产品中，此类内容应对齐 EditorialCollection，由系统或策展方发布，而非用户帖或低代码万能稿件。",
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
