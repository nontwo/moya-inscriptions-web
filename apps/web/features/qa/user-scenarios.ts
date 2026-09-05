import type {
  QaUserContentItem,
  QaUserPresentation,
  QaUserTab,
} from "./qa-user-interface";
import type { CatalogSummary } from "@moya/contracts";

export const qaUserScenarioNames = [
  "user-default-published",
  "user-saved",
  "user-liked",
  "user-history",
  "user-empty-published",
  "user-avatar-fallback",
] as const;

export type QaUserScenarioName = (typeof qaUserScenarioNames)[number];

export const defaultQaUserScenarioName: QaUserScenarioName =
  "user-default-published";

export const qaUserScenarioLabels = {
  "user-avatar-fallback": "User avatar fallback",
  "user-default-published": "User default published",
  "user-empty-published": "User empty published",
  "user-history": "User history",
  "user-liked": "User liked",
  "user-saved": "User saved",
} as const satisfies Record<QaUserScenarioName, string>;

export interface QaUserScenario {
  readonly history: readonly QaUserContentItem[];
  readonly initialTab: QaUserTab;
  readonly liked: readonly QaUserContentItem[];
  readonly published: readonly QaUserContentItem[];
  readonly saved: readonly QaUserContentItem[];
  readonly user: QaUserPresentation;
}

const contentKindLabel = {
  calligraphy: "书帖",
  inscription: "碑刻",
} as const satisfies Record<CatalogSummary["kind"], string>;

const toContentItems = (
  source: readonly CatalogSummary[],
  group: string,
  count: number,
  offset = 0,
): readonly QaUserContentItem[] =>
  source.slice(offset, offset + count).map((item, index) => {
    const media = item.representativeMedia;
    return {
      id: item.id,
      ...(media === undefined
        ? {}
        : {
            imageAlt: media.alt,
            imageHeight: media.height,
            imageSrc: media.src,
            imageWidth: media.width,
          }),
      metadata: [contentKindLabel[item.kind], item.periodLabel]
        .filter((value) => value !== undefined)
        .join(" · "),
      presentationKey: `qa-${group}-${String(index + 1).padStart(2, "0")}`,
      title: item.title,
    };
  });

const scenario = (
  user: QaUserPresentation,
  content: {
    readonly history: readonly QaUserContentItem[];
    readonly liked: readonly QaUserContentItem[];
    readonly published: readonly QaUserContentItem[];
    readonly saved: readonly QaUserContentItem[];
  },
  initialTab: QaUserTab = "published",
): QaUserScenario => ({ ...content, initialTab, user });

export const createQaUserScenarios = (
  source: readonly CatalogSummary[],
): Readonly<Record<QaUserScenarioName, QaUserScenario>> => {
  const published = toContentItems(source, "published", 8);
  const saved = toContentItems(source, "saved", 5, 2);
  const liked = toContentItems(source, "liked", 4, 4);
  const history = toContentItems(source, "history", 6, 1);
  const user: QaUserPresentation = {
    avatarSrc: null,
    bio: "记录碑刻、书法与古迹。",
    id: "qa-user-01",
    name: "访碑者",
  };
  const content = { history, liked, published, saved };

  return {
    "user-avatar-fallback": scenario(user, content),
    "user-default-published": scenario(user, content),
    "user-empty-published": scenario(user, { ...content, published: [] }),
    "user-history": scenario(user, content, "history"),
    "user-liked": scenario(user, content, "liked"),
    "user-saved": scenario(user, content, "saved"),
  };
};
