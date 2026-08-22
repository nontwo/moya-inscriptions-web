/**
 * Prototype-only, synthetic, non-production profile fixture.
 * Never use these values as account, social, or activity data.
 */

(() => {
  const asset = (name) => `../../design-system/assets/demo/${name}.svg`;
  const post = (id, title, kind, meta, image, alt) => ({
    alt,
    id,
    image: asset(image),
    kind,
    meta,
    title,
  });

  const posts = [
    post(
      "discover-cliff-gate",
      "山门北壁题记",
      "碑刻",
      "唐 · 开元年间",
      "cliff-gate",
      "虚构山门北壁题记图",
    ),
    post(
      "calligraphy-autumn",
      "秋山札",
      "墨迹",
      "宋 · 行书",
      "ink-album",
      "虚构秋山札图",
    ),
    post(
      "calligraphy-preface",
      "集字圣教序",
      "拓本",
      "唐 · 行书",
      "rubbing-fragment",
      "虚构集字圣教序拓本图",
    ),
    post(
      "inscription-yunfeng",
      "云峰山题名",
      "碑刻",
      "北魏 · 摩崖",
      "valley-wall",
      "虚构云峰山题名图",
    ),
    post(
      "calligraphy-pine",
      "松窗帖",
      "书帖",
      "明 · 楷书",
      "calligraphy-sheet",
      "虚构松窗帖图",
    ),
    post(
      "inscription-shimen",
      "石门东侧残刻",
      "碑刻",
      "山门北壁",
      "stone-detail",
      "虚构石门东侧残刻图",
    ),
  ];

  globalThis.YOYI_PROFILE_PLACEHOLDER = {
    classification: ["prototype-only", "synthetic", "non-production"],
    version: "profile-placeholder-v1",
    profile: {
      bio: "在山川与纸墨之间，记录石刻的时间痕迹。",
      displayName: "由艺同好",
      id: "yoyi_demo_001",
      monogram: "艺",
      badges: ["碑刻寻访者", "书帖整理中"],
    },
    stats: [
      { label: "获赞", value: "347.5万" },
      { label: "关注", value: "12" },
      { label: "粉丝", value: "58.3万" },
      { label: "作品", value: "286" },
    ],
    posts,
    collections: [posts[0], posts[1], posts[2], posts[3]],
    comments: [],
    history: [],
  };
})();
