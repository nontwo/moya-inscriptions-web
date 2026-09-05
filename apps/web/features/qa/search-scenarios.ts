export const qaRecentSearches = [
  "龙门石窟",
  "魏碑",
  "颜真卿",
  "兰亭序",
] as const;

export const qaSuggestedSearches = [
  "碑刻",
  "拓本",
  "墨迹",
  "楷书",
  "行书",
  "摩崖",
] as const;

export const qaTypingSuggestions = [
  "龙门石窟",
  "龙门二十品",
  "龙门造像记",
] as const;

export const qaSearchScenarioNames = [
  "search-default",
  "search-open",
  "search-typing",
  "search-empty",
] as const;

export type QaSearchScenarioName = (typeof qaSearchScenarioNames)[number];

export const qaSearchScenarios = {
  "search-default": {
    initialKeyword: "",
    initialOpen: false,
    showEmptyState: false,
    showRecentSearches: false,
  },
  "search-open": {
    initialKeyword: "",
    initialOpen: true,
    showEmptyState: false,
    showRecentSearches: true,
  },
  "search-typing": {
    initialKeyword: "龙门",
    initialOpen: true,
    showEmptyState: false,
    showRecentSearches: false,
  },
  "search-empty": {
    initialKeyword: "未收录题刻",
    initialOpen: true,
    showEmptyState: true,
    showRecentSearches: false,
  },
} as const satisfies Record<
  QaSearchScenarioName,
  {
    readonly initialKeyword: string;
    readonly initialOpen: boolean;
    readonly showEmptyState: boolean;
    readonly showRecentSearches: boolean;
  }
>;
