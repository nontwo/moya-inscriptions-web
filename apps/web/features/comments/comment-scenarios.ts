import type {
  CommentItem,
  CommentReply,
  CommentUserPresentation,
} from "./comment-types";

export const qaCommentScenarioNames = [
  "comment-default",
  "comment-empty",
  "comment-long",
  "comment-media",
  "comment-many-replies",
  "comment-loading",
] as const;

export type QaCommentScenarioName = (typeof qaCommentScenarioNames)[number];

export const qaCommentScenarioLabels = {
  "comment-default": "Comment default",
  "comment-empty": "Comment empty",
  "comment-loading": "Comment loading",
  "comment-long": "Comment long",
  "comment-media": "Comment media",
  "comment-many-replies": "Comment many replies",
} as const satisfies Record<QaCommentScenarioName, string>;

const users = {
  ink: { id: "qa-comment-user-02", name: "墨池散人" },
  mountain: { id: "qa-comment-user-03", name: "山门外的访古者" },
  paper: { id: "qa-comment-user-04", name: "纸上烟云" },
} as const satisfies Record<string, CommentUserPresentation>;

const reply = (
  catalogId: string,
  index: number,
  user: CommentUserPresentation,
  text: string,
  replyToUser?: CommentUserPresentation,
): CommentReply => ({
  createdAtLabel: `${index + 1} 小时前`,
  id: `${catalogId}-fixture-reply-${index + 1}`,
  likeCount: index % 3,
  liked: false,
  ...(replyToUser === undefined ? {} : { replyToUser }),
  text,
  user,
});

const defaultItems = (catalogId: string): readonly CommentItem[] => [
  {
    createdAtLabel: "2 小时前",
    id: `${catalogId}-fixture-comment-1`,
    isQaGenerated: false,
    likeCount: 12,
    liked: false,
    replies: [
      reply(catalogId, 0, users.paper, "我也注意到了，收笔尤其有力量。"),
      reply(catalogId, 1, users.ink, "转折处也很耐看。", users.paper),
      reply(catalogId, 2, users.mountain, "现场看拓片可能更明显。"),
    ],
    text: "这里的“山”字和北魏时期的写法很接近。",
    user: users.ink,
  },
  {
    createdAtLabel: "昨天",
    id: `${catalogId}-fixture-comment-2`,
    isQaGenerated: false,
    likeCount: 4,
    liked: false,
    replies: [],
    text: "很喜欢这件作品，资料来源也整理得很清楚。",
    user: users.mountain,
  },
  {
    createdAtLabel: "3 天前",
    id: `${catalogId}-fixture-comment-3`,
    isQaGenerated: false,
    likeCount: 0,
    liked: false,
    replies: [],
    text: "期待以后还能看到更多局部图。",
    user: users.paper,
  },
];

const manyReplies = (catalogId: string): readonly CommentItem[] => {
  const base = defaultItems(catalogId);
  const first = base[0];
  if (first === undefined) return base;
  const texts = [
    "第一条回复用于确认默认只露出两条。",
    "第二条回复仍然保持在同一个一级评论下面。",
    "第三条回复用于测试展开。",
    "第四条回复用于测试折行。",
    "第五条回复确认没有三级树。",
    "第六条回复继续验证长列表。",
    "第七条回复用于测试收起。",
    "第八条回复完成场景数据。",
  ];
  return [
    {
      ...first,
      replies: texts.map((text, index) =>
        reply(
          catalogId,
          index,
          index % 2 === 0 ? users.paper : users.mountain,
          text,
          index === 1 ? users.paper : undefined,
        ),
      ),
    },
    ...base.slice(1),
  ];
};

const longItems = (catalogId: string): readonly CommentItem[] => [
  {
    createdAtLabel: "刚刚",
    id: `${catalogId}-fixture-comment-long`,
    isQaGenerated: false,
    likeCount: 28,
    liked: false,
    replies: [
      reply(
        catalogId,
        0,
        users.paper,
        "长回复同样需要在手机窄屏、平板横竖屏和桌面布局中自然换行，不能撑出详情页，也不能形成第二个滚动容器。",
      ),
    ],
    text: "第一次看到这件作品时，最吸引我的是整体章法。\n再看局部，能发现笔画之间并不拥挤。\n石面留下的时间痕迹也参与了阅读。\n这些信息和正文资料放在一起很有帮助。\n这是一条用于验证自然换行与长内容高度的 QA 评论。",
    user: {
      id: "qa-comment-user-long",
      name: "一位名字很长但仍然认真阅读碑刻资料的访客",
    },
  },
];

const mediaItems = (catalogId: string): readonly CommentItem[] => [
  {
    createdAtLabel: "刚刚",
    id: `${catalogId}-fixture-comment-media`,
    isQaGenerated: false,
    likeCount: 6,
    liked: false,
    media: [
      {
        alt: "评论中的碑刻局部缩略图",
        id: `${catalogId}-fixture-comment-image`,
        kind: "image",
        src: "/docs/design-system/assets/demo/discovery-stone.svg",
      },
    ],
    replies: [
      {
        ...reply(catalogId, 0, users.paper, "这个局部很适合一起对照。"),
        media: [
          {
            alt: "评论回复中的表情包展示占位",
            id: `${catalogId}-fixture-reply-sticker`,
            kind: "sticker",
            src: "/docs/design-system/assets/demo/qa-visual-square.svg",
          },
        ],
      },
    ],
    text: "补一张局部图，和正文放在一起更容易理解转折位置。",
    user: users.mountain,
  },
];

export const createQaCommentFixture = (
  scenario: QaCommentScenarioName,
  catalogId: string,
): readonly CommentItem[] => {
  if (scenario === "comment-empty") return [];
  if (scenario === "comment-long") return longItems(catalogId);
  if (scenario === "comment-media") return mediaItems(catalogId);
  if (scenario === "comment-many-replies") return manyReplies(catalogId);
  return defaultItems(catalogId);
};
