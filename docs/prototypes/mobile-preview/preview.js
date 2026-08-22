/**
 * Prototype shell only (docs/prototypes/mobile-preview).
 * Not Catalog/Search production code. Not T06–T08 acceptance.
 * Topics come from YOYI_TOPICS_PLACEHOLDER (IIFE fixture); do not redeclare
 * topicCards/getTopicById in this classic script scope.
 */

const topicsFixture = globalThis.YOYI_TOPICS_PLACEHOLDER;
const editorialTopics = topicsFixture?.topicCards ?? [];
const findEditorialTopic =
  topicsFixture?.getTopicById ??
  ((id) => editorialTopics.find((topic) => topic.id === id) ?? null);
const homeFeedFixture = globalThis.YOYI_HOME_FEED_PLACEHOLDER;
const supplementalHomeCards = homeFeedFixture?.feedCards ?? {};
const syntheticCatalogDetailRecords =
  globalThis.YOYI_CATALOG_DETAIL_PLACEHOLDER?.records ?? {};
const p5PilotRecords = Array.isArray(globalThis.YOYI_P5_PILOT_SNAPSHOT?.records)
  ? globalThis.YOYI_P5_PILOT_SNAPSHOT.records
  : [];
const catalogAdapter = globalThis.YOYI_CATALOG_UI_ADAPTER ?? null;
const profilePlaceholder = globalThis.YOYI_PROFILE_PLACEHOLDER ?? null;

function selectPrototypeDataset(search) {
  return new URLSearchParams(search).get("dataset") === "p5"
    ? "p5"
    : "synthetic";
}

function displayText(value) {
  return catalogAdapter?.displayText(value) ?? String(value ?? "").trim();
}

function mediaIntrinsics(src, width, height) {
  const knownWidth = Number(width);
  const knownHeight = Number(height);
  if (knownWidth > 0 && knownHeight > 0) {
    return { width: Math.round(knownWidth), height: Math.round(knownHeight) };
  }
  return catalogAdapter?.demoImageIntrinsics(src) ?? null;
}

function applyMediaIntrinsics(image, media = {}) {
  const intrinsic = mediaIntrinsics(
    media.src || image.src,
    media.width,
    media.height,
  );
  if (!intrinsic) return;
  image.width = intrinsic.width;
  image.height = intrinsic.height;
  image.style.aspectRatio = `${intrinsic.width} / ${intrinsic.height}`;
}

function adaptCatalogRecord(raw, index) {
  if (!catalogAdapter) {
    return {
      ...raw,
      media: [],
    };
  }
  return catalogAdapter.adaptRecord(raw, {
    demoCards: supplementalHomeCards.discover,
    index,
  });
}

const prototypeDataset = selectPrototypeDataset(window.location.search);
const adaptedP5Records = p5PilotRecords.map((record, index) =>
  adaptCatalogRecord(record, index),
);
const p5CatalogDetailRecords = Object.fromEntries(
  adaptedP5Records.map((record) => [record.id, record]),
);
const p5TopicCollections =
  catalogAdapter && prototypeDataset === "p5"
    ? catalogAdapter.topicCollections(adaptedP5Records)
    : [];
const catalogDetailRecords =
  prototypeDataset === "p5"
    ? { ...syntheticCatalogDetailRecords, ...p5CatalogDetailRecords }
    : syntheticCatalogDetailRecords;

const root = document.documentElement;
root.dataset.dataset = prototypeDataset;
const app = document.querySelector("[data-mobile-app]");
const bottomNavigation = document.querySelector("[data-bottom-navigation]");
const detailView = document.querySelector("[data-view='detail']");
const detailImage = document.querySelector("[data-detail-image]");
const detailTitle = document.querySelector("[data-detail-title]");
const detailKindPeriod = document.querySelector("[data-detail-kind-period]");
const detailAliases = document.querySelector("[data-detail-aliases]");
const detailAliasesText = document.querySelector("[data-detail-aliases-text]");
const detailSummary = document.querySelector("[data-detail-summary]");
const detailSummaryText = document.querySelector("[data-detail-summary-text]");
const detailFacts = document.querySelector("[data-detail-facts]");
const detailFactsList = document.querySelector("[data-detail-facts-list]");
const detailDescription = document.querySelector("[data-detail-description]");
const detailDescriptionText = document.querySelector(
  "[data-detail-description-text]",
);
const detailSources = document.querySelector("[data-detail-sources]");
const detailSourcesList = document.querySelector("[data-detail-sources-list]");
const detailMedia = document.querySelector("[data-detail-media]");
const detailMediaOpen = document.querySelector("[data-detail-media-open]");
const detailMediaFallback = document.querySelector(
  "[data-detail-media-fallback]",
);
const detailMediaError = document.querySelector("[data-detail-media-error]");
const detailMediaIndex = document.querySelector("[data-detail-media-index]");
const detailMediaPrev = document.querySelector("[data-detail-media-prev]");
const detailMediaNext = document.querySelector("[data-detail-media-next]");
const detailMediaDots = document.querySelector("[data-detail-media-dots]");
const detailMediaStage = document.querySelector(".app-detail__media-stage");
const detailMediaTrack = document.querySelector("[data-detail-media-track]");
const detailPrevImage = document.querySelector(
  "[data-detail-media-prev-image]",
);
const detailNextImage = document.querySelector(
  "[data-detail-media-next-image]",
);
const detailFocus = document.querySelector("[data-detail-focus]");
const detailFocusStage = document.querySelector("[data-detail-focus-stage]");
const detailFocusTrack = document.querySelector("[data-detail-focus-track]");
const detailFocusImage = document.querySelector("[data-detail-focus-image]");
const focusPrevImage = document.querySelector("[data-detail-focus-prev-image]");
const focusNextImage = document.querySelector("[data-detail-focus-next-image]");
const detailFocusIndex = document.querySelector("[data-detail-focus-index]");
const detailFocusPrev = document.querySelector("[data-detail-focus-prev]");
const detailFocusNext = document.querySelector("[data-detail-focus-next]");
const detailFocusDots = document.querySelector("[data-detail-focus-dots]");
const searchInput = document.querySelector("[data-inscription-search]");
const searchClear = document.querySelector("[data-search-clear]");
const calligraphyFilterInput = document.querySelector(
  "[data-calligraphy-filter]",
);
const calligraphyFilterClear = document.querySelector(
  "[data-calligraphy-filter-clear]",
);
const createText = document.querySelector("[data-create-text]");
const createFeedback = document.querySelector("[data-create-feedback]");
const topicsGrid = document.querySelector("[data-topics-grid]");
const topicColumnBody = document.querySelector("[data-topic-column-body]");
const topicColumnHeading = document.querySelector(
  "[data-topic-column-heading]",
);

const themePreferenceKey = "yoyi.theme-preference";
const homeLayoutKey = "yoyi.home-feed-layout";
const qaLogKey = "yoyi.qa-log";
const qaLogLimit = 200;
const qaLogCopyLabel = "复制日志";
const qaLogCopyStatusMs = 1500;
const themeModeOrder = ["light", "dark", "system"];
const themePreferences = themeModeOrder;
const homeLayouts = ["single", "double"];
const themeModeLabels = {
  light: "浅色模式",
  dark: "深色模式",
  system: "跟随系统",
};
const layoutModeLabels = {
  single: "单列",
  double: "双列",
};
const primaryViews = ["home", "inscriptions", "calligraphy"];
const navigationViews = [...primaryViews, "create", "profile"];
const homeFeeds = ["discover", "nearby", "topics"];
const calligraphyCategories = ["all", "ink", "rubbing"];
const profileTabs = ["posts", "favorites", "likes", "comments", "history"];
const platformRuntime = globalThis.YOYI_DEVICE_PLATFORM;
const pagerAxisLockDistance = 8;
const pagerEdgeResistance = 0.25;
const pagerSpringMass = 1;
const pagerSpringStiffness = 420;
const pagerSpringDamping = 41;
const pagerSpringStepSeconds = 0.008;
const pagerSpringMaxFrameSeconds = 0.032;
const pagerSpringPositionTolerance = 0.5;
const pagerSpringVelocityTolerance = 10;
const pagerSpringMaxDurationSeconds = 0.42;
const pagerVelocityWindowMs = 100;
const pagerFlickMinimumVelocity = 0.45;
const pagerFlickMinimumDistanceRatio = 0.12;
const pagerMaximumVelocity = 2.4;
const pagerViewportStableFrameTarget = 3;
const pagerViewportSyncMaxFrames = 60;
const pagerViewportWidthTolerance = 0.5;
const pagerObservedWidths = new WeakMap();
const swipeClickSuppressionWindow = 400;
const pagerWheelIdleMs = 24;
const pagerWheelInertiaMinEvents = 2;
const pagerWheelInertiaPeakRatio = 0.45;
const pagerWheelInertiaMaxDelta = 12;
const pagerWheelIgnoreMs = 160;
const pagerWheelPixelGain = 1;
const pagerWheelLinePixels = 16;
const pagerControllers = new Map();

const scrollPositions = {
  "home:discover": 0,
  "home:nearby": 0,
  "home:topics": 0,
  inscriptions: 0,
  create: 0,
  "calligraphy:all": 0,
  "calligraphy:ink": 0,
  "calligraphy:rubbing": 0,
  profile: 0,
};

function syncPlatformAttribute() {
  if (platformRuntime) {
    const { platform } = platformRuntime.sync();
    bottomNavigation.dataset.minimizeBehavior =
      platform === "pc" ? "none" : "on-scroll";
    bottomNavigation.classList.toggle(
      "yoyi-functional-glass",
      platform !== "pc",
    );
    return platform;
  }
  const platform =
    window.innerWidth < 768
      ? "phone"
      : window.innerWidth < 896
        ? "tablet"
        : "pc";
  root.dataset.deviceClass = "desktop";
  root.dataset.platform = platform;
  bottomNavigation.dataset.minimizeBehavior =
    platform === "pc" ? "none" : "on-scroll";
  bottomNavigation.classList.toggle("yoyi-functional-glass", platform !== "pc");
  return platform;
}

function readStoredPreference(key, validValues, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return validValues.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function persistPreference(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Browser privacy settings can disable storage; the current session still works.
  }
}

function nextCycledValue(values, current) {
  const index = values.indexOf(current);
  return values[(index + 1) % values.length];
}

function syncThemeToggle() {
  const button = document.querySelector("[data-theme-toggle]");
  if (!button) return;
  const icon = button.querySelector("[data-icon]");
  if (icon) icon.dataset.icon = `theme-${themePreference}`;
  button.dataset.themeMode = themePreference;
  button.setAttribute(
    "aria-label",
    `切换主题：当前${themeModeLabels[themePreference]}`,
  );
  button.title = themeModeLabels[themePreference];
}

function syncLayoutToggle() {
  const button = document.querySelector("[data-layout-toggle]");
  if (!button) return;
  const icon = button.querySelector("[data-icon]");
  if (icon) icon.dataset.icon = `layout-${homeFeedLayout}`;
  button.dataset.layoutMode = homeFeedLayout;
  button.setAttribute(
    "aria-label",
    `切换布局：当前${layoutModeLabels[homeFeedLayout]}`,
  );
  button.title = layoutModeLabels[homeFeedLayout];
}

function formatQaTime(date = new Date()) {
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function loadQaLog() {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(qaLogKey) ?? "[]");
    return Array.isArray(parsed) ? parsed.slice(0, qaLogLimit) : [];
  } catch {
    return [];
  }
}

function persistQaLog() {
  try {
    window.sessionStorage.setItem(qaLogKey, JSON.stringify(qaLogEntries));
  } catch {
    // Browser privacy settings can disable storage; the current session still works.
  }
}

function primaryViewLabel(view) {
  if (view === "inscriptions") return "碑刻";
  if (view === "create") return "创作";
  if (view === "calligraphy") return "书帖";
  if (view === "profile") return "我的";
  return "首页";
}

function logQaEvent(type, message) {
  qaLogEntries.unshift({
    message: String(message ?? ""),
    time: formatQaTime(),
    type,
  });
  if (qaLogEntries.length > qaLogLimit) qaLogEntries.length = qaLogLimit;
  persistQaLog();
  const logView = document.querySelector('[data-view="qa-log"]');
  if (logView && !logView.hidden) renderQaLog();
}

function renderQaLog() {
  const list = document.querySelector("[data-qa-log-list]");
  const empty = document.querySelector("[data-qa-log-empty]");
  if (!list) return;
  list.replaceChildren();
  qaLogEntries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "app-qa-log__item";
    const time = document.createElement("span");
    time.className = "app-qa-log__time";
    time.textContent = entry.time;
    const kind = document.createElement("span");
    kind.className = "app-qa-log__type";
    kind.textContent = entry.type;
    const text = document.createElement("span");
    text.className = "app-qa-log__message";
    text.textContent = entry.message;
    item.append(time, kind, text);
    list.append(item);
  });
  if (empty) empty.hidden = qaLogEntries.length > 0;
}

function clearQaLog() {
  qaLogEntries = [];
  persistQaLog();
  renderQaLog();
}

function qaLogCopyButtons() {
  return [...document.querySelectorAll("[data-qa-log-copy]")];
}

function setQaLogCopyStatus(label) {
  qaLogCopyButtons().forEach((button) => {
    button.textContent = label;
  });
  if (qaLogCopyStatusTimer) window.clearTimeout(qaLogCopyStatusTimer);
  qaLogCopyStatusTimer = window.setTimeout(() => {
    qaLogCopyStatusTimer = 0;
    qaLogCopyButtons().forEach((button) => {
      button.textContent = qaLogCopyLabel;
    });
  }, qaLogCopyStatusMs);
}

function formatQaLogText() {
  return qaLogEntries
    .map((entry) => `${entry.time} [${entry.type}] ${entry.message}`)
    .join("\n");
}

function copyQaLogWithExecCommand(text) {
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.top = "0";
  field.style.left = "0";
  field.style.opacity = "0";
  document.body.append(field);
  field.focus();
  field.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    field.remove();
  }
  return copied;
}

async function copyQaLog() {
  if (qaLogEntries.length === 0) {
    setQaLogCopyStatus("暂无记录");
    return;
  }
  const text = formatQaLogText();
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      setQaLogCopyStatus("已复制");
      return;
    }
  } catch {
    // HTTP and blocked clipboard fall through to execCommand.
  }
  try {
    if (copyQaLogWithExecCommand(text)) {
      setQaLogCopyStatus("已复制");
      return;
    }
  } catch {
    // Clipboard can be blocked; the on-screen list remains available.
  }
  setQaLogCopyStatus("复制失败");
}

let qaLogEntries = loadQaLog();
let qaLogCopyStatusTimer = 0;

let primaryView = "home";
let homeFeed = "discover";
let calligraphyCategory = "all";
let calligraphyFilterQuery = "";
let themePreference = readStoredPreference(
  themePreferenceKey,
  themePreferences,
  "system",
);
let homeFeedLayout = readStoredPreference(homeLayoutKey, homeLayouts, "double");
let activePagerGesture = null;
let activeWheelGesture = null;
let pagerWheelIdleTimer = 0;
let pagerViewportSyncAnimationId = 0;
let pagerViewportSyncFramesElapsed = 0;
let pagerViewportStableFrames = 0;
let pagerViewportPreviousWidths = [];
let pagerResizeObserver = null;
let lastPagerWindowWidth = window.innerWidth;
let pagerPointerMoveMode = "";
const pagerPeekMoveOptions = { passive: true };
const pagerActiveMoveOptions = { passive: false };
let masonryLayoutFrame = 0;
let navigationMinimized = false;
let navigationLastScrollTop = 0;
let navigationScrollIntent = 0;
let navigationIdleTimer = 0;
let navigationBubbleExpandTimer = 0;
const navigationIdleMs = 400;
const navigationExpandMs = 560;
const navigationCollapseDelta = 12;
const navigationExpandDelta = 24;
const navBubble = bottomNavigation.querySelector(".yoyi-nav-bubble");
const bottomTabStrip = {
  bubble: navBubble,
  container: bottomNavigation,
  itemSelector: "[data-nav-entry]",
  kind: "bottom",
  progressItemSelector: "[data-primary-view]",
  selectedClass: "is-active",
};
const homeTabStrip = {
  bubble: document.querySelector(".app-primary-tabs > .app-tab-bubble"),
  container: document.querySelector(".app-primary-tabs"),
  itemSelector: "[data-home-feed]",
  kind: "home",
  selectedClass: "is-selected",
};
const calligraphyTabStrip = {
  bubble: document.querySelector(".app-categories > .app-tab-bubble"),
  container: document.querySelector(".app-categories"),
  itemSelector: "[data-calligraphy-category]",
  kind: "calligraphy",
  selectedClass: "is-selected",
};
const tabStrips = [bottomTabStrip, homeTabStrip, calligraphyTabStrip];
let navPointerId = null;
let navDragging = false;
let navPointerStartX = 0;
let navDidPan = false;
let navIgnoreClick = false;
let navPagerGesture = null;
let detailContentId = "";
let detailRecord = null;
let detailMediaItems = [];
let detailMediaIndexValue = 0;
let detailMediaFailed = false;
let detailFocusOpen = false;
let focusScale = 1;
let focusX = 0;
let focusY = 0;
let focusScrollTop = 0;
let focusPointers = new Map();
let focusPinch = null;
let focusPan = null;
let focusDidPan = false;
let focusDidPinch = false;
let focusWindowScroll = 0;
let focusBodyOverflow = "";
const focusMinScale = 1;
const focusTapSlop = 10;
const focusPadPc = 32;
const focusPadPhone = 12;
const focusChromeTop = 0;
const focusChromeBottomPc = 24;
const mediaSwipeDistance = 48;
const carouselSettleMs = 220;
const carouselRubber = 0.32;
const carouselFling = 0.55;
const carouselAxisLockDistance = 10;
const carouselDirectionRatio = 1.25;
const carouselWheelIdleMs = 24;
const carouselWheelIgnoreMs = 180;
const focusPagerHideMs = 2000;
let mediaSwipe = null;
let mediaSwipeSuppressClick = false;
let mediaFocusClosedAt = Number.NEGATIVE_INFINITY;
let mediaOpenSawPointer = false;
let focusPagerTimer = 0;
let carouselFrame = 0;
let pendingCarouselX = null;
let carouselWheel = null;
let carouselWheelIdleTimer = 0;
let carouselWheelIgnoreUntil = 0;

function scrollKeyForView(view) {
  if (view === "home") return `home:${homeFeed}`;
  if (view === "calligraphy") return `calligraphy:${calligraphyCategory}`;
  return view;
}

function scrollElementFor(
  view,
  platform = root.dataset.platform,
  scrollKey = scrollKeyForView(view),
) {
  if (platform === "pc") {
    return document.scrollingElement ?? document.documentElement;
  }
  if (view === "home" || view === "calligraphy") {
    return document.querySelector(`[data-scroll-key="${scrollKey}"]`);
  }
  return document.querySelector(`[data-scroll-view="${view}"]`);
}

function currentScrollElement() {
  return scrollElementFor(primaryView);
}

function saveScrollPosition() {
  const scrollKey = scrollKeyForView(primaryView);
  const scrollElement = currentScrollElement();
  if (scrollElement && scrollKey in scrollPositions) {
    scrollPositions[scrollKey] = scrollElement.scrollTop;
  }
}

function restoreScrollPosition(view) {
  const scrollKey = scrollKeyForView(view);
  const scrollElement = scrollElementFor(
    view,
    root.dataset.platform,
    scrollKey,
  );
  if (scrollElement) scrollElement.scrollTop = scrollPositions[scrollKey] ?? 0;
}

function rememberScrollPosition(scrollKey, scrollTop) {
  if (scrollKey in scrollPositions) scrollPositions[scrollKey] = scrollTop;
}

function onBeforePlatformQueryChange(event) {
  const scrollKey = scrollKeyForView(primaryView);
  if (!(scrollKey in scrollPositions)) return;
  const scrollElement = scrollElementFor(
    primaryView,
    event.detail?.previousPlatform,
    scrollKey,
  );
  if (
    scrollElement &&
    (scrollElement.scrollTop > 0 || scrollPositions[scrollKey] === 0)
  ) {
    rememberScrollPosition(scrollKey, scrollElement.scrollTop);
  }
}

function isLandscapeViewport() {
  return window.innerWidth > window.innerHeight;
}

function detailCompositionForPlatform(
  platform = root.dataset.platform,
  landscape = isLandscapeViewport(),
) {
  if (platform === "phone") return landscape ? "compact-stacked" : "stacked";
  if (platform === "tablet")
    return landscape ? "compact-split" : "wide-stacked";
  return "expanded-split";
}

function updateDetailComposition() {
  if (!detailView) return;
  detailView.dataset.detailComposition = detailCompositionForPlatform();
}

function catalogKindLabel(kind) {
  return (
    catalogAdapter?.catalogKindLabel(kind) ??
    (kind === "calligraphy" ? "书帖" : "碑刻")
  );
}

function regionLabel(facts) {
  return catalogAdapter?.regionLabel(facts) ?? "";
}

function splitDetailTokens(value) {
  return String(value ?? "")
    .split(/[·•、/|,;；]+|\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeDetailToken(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .trim();
}

function commonPrefixLength(left, right) {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function isYearLikeToken(value) {
  return /年/.test(value);
}

function tokensOverlap(left, right) {
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 2 && right.length >= 2) {
    if (left.includes(right) || right.includes(left)) return true;
  }
  if (isYearLikeToken(left) && isYearLikeToken(right)) {
    return commonPrefixLength(left, right) >= 2;
  }
  return false;
}

function renderedFactTokens() {
  if (!detailFactsList) return [];
  return [...detailFactsList.querySelectorAll("dd")].flatMap((node) =>
    splitDetailTokens(node.textContent).map(normalizeDetailToken),
  );
}

function keepSummaryTokens(tokens, factTokens) {
  return tokens.filter(
    (token) =>
      !factTokens.some((fact) =>
        tokensOverlap(normalizeDetailToken(token), fact),
      ),
  );
}

function renderDetailKindPeriod(record) {
  const tokens = [
    catalogKindLabel(record.kind),
    ...splitDetailTokens(record.periodLabel),
  ].filter(Boolean);
  const kept = keepSummaryTokens(tokens, renderedFactTokens());
  if (!detailKindPeriod) return;
  detailKindPeriod.textContent = kept.join(" · ");
  setHidden(detailKindPeriod, kept.length === 0);
}

function renderDetailAliases(record) {
  const aliases = Array.isArray(record.aliases)
    ? record.aliases.filter(Boolean)
    : [];
  const kept = keepSummaryTokens(aliases, renderedFactTokens());
  if (detailAliasesText) detailAliasesText.textContent = kept.join(" · ");
  setHidden(detailAliases, kept.length === 0);
}

function detailMediaList(record) {
  const media = (Array.isArray(record?.media) ? record.media : []).filter(
    (item) => item?.src,
  );
  if (media.length > 0) return media;
  if (record?.representativeMedia?.src) return [record.representativeMedia];
  return [];
}

function fallbackCatalogRecord(contentId, trigger) {
  const title = trigger?.dataset.title ?? "";
  const imageNode = trigger?.querySelector("img");
  const imageSrc =
    trigger?.dataset.image ?? imageNode?.getAttribute("src") ?? "";
  const alt = imageNode?.alt ?? title;
  const kind = trigger?.closest('[data-view="calligraphy"]')
    ? "calligraphy"
    : "inscription";
  const intrinsic = mediaIntrinsics(
    imageSrc,
    imageNode?.naturalWidth || imageNode?.width,
    imageNode?.naturalHeight || imageNode?.height,
  );
  const item = imageSrc
    ? {
        alt,
        height: intrinsic?.height,
        id: `${contentId}-media`,
        kind: "image",
        src: imageSrc,
        width: intrinsic?.width,
      }
    : null;
  return {
    aliases: [],
    id: contentId,
    kind,
    media: item ? [item] : [],
    representativeMedia: item ?? undefined,
    sourceCitations: [],
    title,
  };
}

function resolveCatalogRecord(contentId, trigger) {
  const record = catalogDetailRecords[contentId];
  if (record) return record;
  if (trigger) return fallbackCatalogRecord(contentId, trigger);
  return { id: contentId, lifecycle: "not-found" };
}

function showDetailPanel(name) {
  detailView?.querySelectorAll("[data-detail-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.detailPanel !== name;
  });
  if (detailView) detailView.dataset.detailState = name;
}

function setHidden(element, hidden) {
  if (element) element.hidden = hidden;
}

function appendFact(label, value) {
  const text = displayText(value);
  if (!text || !detailFactsList) return;
  const term = document.createElement("dt");
  term.textContent = label;
  const definition = document.createElement("dd");
  definition.textContent = text;
  detailFactsList.append(term, definition);
}

function renderDetailFacts(record) {
  if (!detailFacts || !detailFactsList) return;
  detailFactsList.replaceChildren();
  const facts = record.prototypeFacts;
  appendFact("朝代", facts?.dynasty);
  appendFact("年代", facts?.dateText);
  appendFact("地区", regionLabel(facts));
  appendFact("现址", facts?.currentLocation);
  appendFact("保管 / 现藏单位", facts?.currentCustodian);
  setHidden(detailFacts, detailFactsList.children.length === 0);
}

function renderDetailSources(record) {
  if (!detailSources || !detailSourcesList) return;
  detailSourcesList.replaceChildren();
  const citations = Array.isArray(record.sourceCitations)
    ? record.sourceCitations
    : [];
  citations.forEach((citation) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    label.className = "app-detail__source-label";
    label.textContent = citation.label;
    item.append(label);
    if (citation.citation) {
      const text = document.createElement("span");
      text.className = "app-detail__source-citation";
      text.textContent = citation.citation;
      item.append(text);
    }
    if (citation.url) {
      const link = document.createElement("a");
      link.className = "app-detail__source-link";
      link.href = citation.url;
      link.rel = "noreferrer";
      link.target = "_blank";
      link.textContent = "查看来源";
      item.append(link);
    }
    detailSourcesList.append(item);
  });
  setHidden(detailSources, citations.length === 0);
}

function currentDetailMedia() {
  return detailMediaItems[detailMediaIndexValue] ?? null;
}

function applyDetailMedia() {
  const item = currentDetailMedia();
  const total = detailMediaItems.length;
  detailMediaFailed = false;
  setHidden(detailMediaFallback, total > 0);
  setHidden(detailMediaError, true);
  if (detailImage) {
    detailImage.hidden = !item;
    if (item) {
      detailImage.alt = item.alt ?? "";
      detailImage.width = item.width ?? 0;
      detailImage.height = item.height ?? 0;
      detailImage.style.aspectRatio =
        item.width && item.height ? `${item.width} / ${item.height}` : "";
      detailImage.src = item.src;
    } else {
      detailImage.classList.remove("is-switching");
      detailImage.removeAttribute("src");
      detailImage.alt = "";
    }
  }
  if (detailMediaOpen) {
    detailMediaOpen.disabled = !item;
    detailMediaOpen.setAttribute("aria-label", item ? "查看图像" : "暂无图像");
  }
  syncMediaPager();
  if (detailFocusOpen) applyFocusMedia();
}

function renderLoadedDetail(record) {
  showDetailPanel("loaded");
  const title = displayText(record.title);
  const summary = displayText(record.summary);
  const description = displayText(record.description);
  if (detailTitle) detailTitle.textContent = title;
  if (detailSummaryText) detailSummaryText.textContent = summary;
  setHidden(detailSummary, !summary);
  renderDetailFacts(record);
  renderDetailKindPeriod(record);
  renderDetailAliases(record);
  if (detailDescriptionText) detailDescriptionText.textContent = description;
  setHidden(detailDescription, !description);
  renderDetailSources(record);
  applyDetailMedia();
}

function renderCatalogDetail(record) {
  const lifecycle = record?.lifecycle;
  if (lifecycle === "loading") {
    showDetailPanel("loading");
    return;
  }
  if (lifecycle === "not-found") {
    showDetailPanel("not-found");
    return;
  }
  if (lifecycle === "unavailable") {
    showDetailPanel("unavailable");
    return;
  }
  if (lifecycle === "error") {
    showDetailPanel("error");
    return;
  }
  renderLoadedDetail(record);
}

function rememberDetailHistory(contentId, { replace = false } = {}) {
  const state = {
    contentId,
    kind: "detail",
    mediaIndex: detailMediaIndexValue,
    sourceView: primaryView,
  };
  const url = `#detail-${contentId}`;
  if (replace) history.replaceState(state, "", url);
  else history.pushState(state, "", url);
}

function renderMediaDots(container, total, index) {
  if (!container) return;
  if (total <= 1) {
    container.replaceChildren();
    setHidden(container, true);
    return;
  }
  setHidden(container, false);
  const count = total;
  if (container.childElementCount !== count) {
    container.replaceChildren();
    for (let i = 0; i < count; i += 1) {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "app-detail__media-dot";
      dot.dataset.mediaIndex = String(i);
      container.append(dot);
    }
  }
  [...container.children].forEach((dot, i) => {
    const active = i === index;
    dot.classList.toggle("is-active", active);
    dot.setAttribute("aria-label", `第 ${i + 1} 张`);
    dot.setAttribute("aria-current", active ? "true" : "false");
  });
}

function syncMediaPager() {
  const total = detailMediaItems.length;
  const index = detailMediaIndexValue;
  const showPager = total > 1;
  if (detailMediaIndex) {
    detailMediaIndex.hidden = total <= 1;
    detailMediaIndex.textContent = total > 0 ? `${index + 1}/${total}` : "";
  }
  if (detailFocusIndex) {
    detailFocusIndex.hidden = total <= 1;
    detailFocusIndex.textContent = total > 0 ? `${index + 1} / ${total}` : "";
  }
  renderMediaDots(detailMediaDots, total, index);
  renderMediaDots(detailFocusDots, isPcFocusPlatform() ? total : 0, index);
  setHidden(detailMediaPrev, !showPager);
  setHidden(detailMediaNext, !showPager);
  setHidden(detailFocusPrev, !(showPager && isPcFocusPlatform()));
  setHidden(detailFocusNext, !(showPager && isPcFocusPlatform()));
  syncCarouselSlides();
}

function applySlideImage(img, item) {
  if (!img) return;
  if (!item) {
    img.hidden = true;
    img.removeAttribute("src");
    img.alt = "";
    img.style.aspectRatio = "";
    return;
  }
  img.hidden = false;
  img.alt = item.alt ?? "";
  img.width = item.width ?? 0;
  img.height = item.height ?? 0;
  img.style.aspectRatio =
    item.width && item.height ? `${item.width} / ${item.height}` : "";
  if (img.getAttribute("src") !== item.src) img.src = item.src;
}

function syncCarouselSlides() {
  const prev = detailMediaItems[detailMediaIndexValue - 1] ?? null;
  const next = detailMediaItems[detailMediaIndexValue + 1] ?? null;
  applySlideImage(detailPrevImage, prev);
  applySlideImage(detailNextImage, next);
  applySlideImage(focusPrevImage, prev);
  applySlideImage(focusNextImage, next);
}

function applyFocusMedia() {
  const item = currentDetailMedia();
  if (!detailFocusImage || !item) return;
  resetFocusTransform();
  detailFocusImage.alt = item.alt ?? "";
  detailFocusImage.src = item.src;
  syncMediaPager();
}

function isPcFocusPlatform() {
  return root.dataset.platform === "pc";
}

function pagerHost() {
  return detailFocusOpen ? detailFocus : detailMedia;
}

function clearFocusPagerTimer() {
  if (!focusPagerTimer) return;
  window.clearTimeout(focusPagerTimer);
  focusPagerTimer = 0;
}

function revealFocusPager() {
  const host = pagerHost();
  if (!host) return;
  host.classList.add("is-pager-visible");
  clearFocusPagerTimer();
}

function scheduleFocusPagerHide() {
  const host = pagerHost();
  if (!host) return;
  clearFocusPagerTimer();
  focusPagerTimer = window.setTimeout(() => {
    host.classList.remove("is-pager-visible");
    focusPagerTimer = 0;
  }, focusPagerHideMs);
}

function showFocusPager() {
  revealFocusPager();
  scheduleFocusPagerHide();
}

function hideFocusPager() {
  clearFocusPagerTimer();
  detailFocus?.classList.remove("is-pager-visible");
  detailMedia?.classList.remove("is-pager-visible");
}

function carouselWidth(viewport) {
  const rect = viewport?.getBoundingClientRect();
  return Math.max(
    1,
    viewport?.clientWidth || rect?.width || window.innerWidth || 320,
  );
}

function flushCarouselFrame() {
  if (carouselFrame) {
    window.cancelAnimationFrame(carouselFrame);
    carouselFrame = 0;
  }
  if (!pendingCarouselX) return;
  const { track, x } = pendingCarouselX;
  pendingCarouselX = null;
  track.classList.add("is-dragging");
  track.classList.remove("is-settling");
  track.style.setProperty("--carousel-x", `${x}px`);
}

function setCarouselX(track, x, settle) {
  if (!track) return;
  if (settle) {
    flushCarouselFrame();
    track.classList.remove("is-dragging");
    track.classList.add("is-settling");
    track.style.setProperty("--carousel-x", `${x}px`);
    return;
  }
  pendingCarouselX = { track, x };
  if (carouselFrame) return;
  carouselFrame = window.requestAnimationFrame(flushCarouselFrame);
}

function resetCarouselX(track) {
  pendingCarouselX = null;
  flushCarouselFrame();
  if (!track) return;
  track.classList.remove("is-dragging", "is-settling");
  track.style.setProperty("--carousel-x", "0px");
}

function rubberCarouselX(dx, atStart, atEnd) {
  if ((dx > 0 && atStart) || (dx < 0 && atEnd)) return dx * carouselRubber;
  return dx;
}

function lockCarouselAxis(dx, dy) {
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (Math.max(adx, ady) < carouselAxisLockDistance) return null;
  if (adx > ady * carouselDirectionRatio) return "horizontal";
  if (ady > adx * carouselDirectionRatio) return "vertical";
  return null;
}

function shouldCommitCarousel(dx, dy, dt, width, atStart, atEnd, velocity) {
  if (Math.abs(dx) <= Math.abs(dy)) return false;
  const goingNext = dx < 0;
  if (goingNext && atEnd) return false;
  if (!goingNext && atStart) return false;
  const distance = Math.max(mediaSwipeDistance, width * 0.18);
  const speed = Number.isFinite(velocity) ? velocity : dx / Math.max(16, dt);
  return Math.abs(dx) >= distance || Math.abs(speed) >= carouselFling;
}

function finishCarouselPage(dx, width, track) {
  const goingNext = dx < 0;
  const stepped = goToDetailMedia(
    detailMediaIndexValue + (goingNext ? 1 : -1),
    {
      dragX: dx,
      fromCarousel: true,
      track,
      width,
    },
  );
  if (stepped) return true;
  setCarouselX(track, 0, true);
  return false;
}

function focusPanBounds() {
  const fit = focusFitSize();
  return {
    maxX: Math.max(0, (fit.width * focusScale - fit.stageWidth) / 2),
  };
}

function focusStageRect() {
  const rect = detailFocusStage?.getBoundingClientRect();
  if (detailFocusStage && rect && rect.width > 0 && rect.height > 0) {
    const styles = window.getComputedStyle(detailFocusStage);
    const padLeft = parseFloat(styles.paddingLeft) || 0;
    const padRight = parseFloat(styles.paddingRight) || 0;
    const padTop = parseFloat(styles.paddingTop) || 0;
    const padBottom = parseFloat(styles.paddingBottom) || 0;
    return {
      left: rect.left + padLeft,
      top: rect.top + padTop,
      width: Math.max(1, rect.width - padLeft - padRight),
      height: Math.max(1, rect.height - padTop - padBottom),
    };
  }
  const pad = isPcFocusPlatform() ? focusPadPc : focusPadPhone;
  const bottomChrome = isPcFocusPlatform() ? focusChromeBottomPc : 0;
  return {
    left: pad,
    top: pad + focusChromeTop,
    width: Math.max(1, (window.innerWidth || 1) - pad * 2),
    height: Math.max(
      1,
      (window.innerHeight || 1) - pad * 2 - focusChromeTop - bottomChrome,
    ),
  };
}

function focusFitSize() {
  const stage = focusStageRect();
  const naturalWidth = detailFocusImage?.naturalWidth || 1;
  const naturalHeight = detailFocusImage?.naturalHeight || 1;
  const ratio = Math.min(
    stage.width / naturalWidth,
    stage.height / naturalHeight,
  );
  return {
    width: naturalWidth * ratio,
    height: naturalHeight * ratio,
    stageWidth: stage.width,
    stageHeight: stage.height,
    maxScale: Math.min(8, Math.max(4, naturalWidth / (naturalWidth * ratio))),
  };
}

function clearFocusImageLayout() {
  [detailFocusImage, focusPrevImage, focusNextImage].forEach((img) => {
    if (!img) return;
    img.style.removeProperty("width");
    img.style.removeProperty("height");
    img.style.removeProperty("max-width");
    img.style.removeProperty("max-height");
  });
}

function layoutFocusImage() {
  if (!detailFocusImage || !detailFocusOpen) return;
  const naturalWidth = detailFocusImage.naturalWidth;
  const naturalHeight = detailFocusImage.naturalHeight;
  if (!naturalWidth || !naturalHeight) return;
  const fit = focusFitSize();
  detailFocusImage.style.width = `${fit.width}px`;
  detailFocusImage.style.height = `${fit.height}px`;
  detailFocusImage.style.maxWidth = "none";
  detailFocusImage.style.maxHeight = "none";
  [focusPrevImage, focusNextImage].forEach((img) => {
    if (!img) return;
    img.style.width = "auto";
    img.style.height = "auto";
    img.style.maxWidth = `${fit.width}px`;
    img.style.maxHeight = `${fit.height}px`;
  });
}

function syncFocusPageLock(lock) {
  if (!isPcFocusPlatform()) return;
  if (lock) {
    focusBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return;
  }
  document.body.style.overflow = focusBodyOverflow;
  focusBodyOverflow = "";
}

function applyFocusTransform() {
  if (!detailFocusImage) return;
  detailFocusImage.style.setProperty("--focus-scale", String(focusScale));
  detailFocusImage.style.setProperty("--focus-x", `${focusX}px`);
  detailFocusImage.style.setProperty("--focus-y", `${focusY}px`);
  detailFocus?.classList.toggle("is-zoomed", focusScale > 1.05);
}

function clampFocusPan() {
  const fit = focusFitSize();
  const displayWidth = fit.width * focusScale;
  const displayHeight = fit.height * focusScale;
  const maxX = Math.max(0, (displayWidth - fit.stageWidth) / 2);
  const maxY = Math.max(0, (displayHeight - fit.stageHeight) / 2);
  focusX = Math.min(maxX, Math.max(-maxX, focusX));
  focusY = Math.min(maxY, Math.max(-maxY, focusY));
}

function resetFocusTransform() {
  focusScale = focusMinScale;
  focusX = 0;
  focusY = 0;
  focusPointers = new Map();
  focusPinch = null;
  focusPan = null;
  focusDidPan = false;
  focusDidPinch = false;
  detailFocus?.classList.remove("is-panning");
  applyFocusTransform();
  layoutFocusImage();
}

function zoomFocusAt(clientX, clientY, nextScale) {
  const stage = focusStageRect();
  const fit = focusFitSize();
  const scale = Math.min(fit.maxScale, Math.max(focusMinScale, nextScale));
  const originX = clientX - stage.left - stage.width / 2;
  const originY = clientY - stage.top - stage.height / 2;
  const imageX = (originX - focusX) / focusScale;
  const imageY = (originY - focusY) / focusScale;
  focusScale = scale;
  focusX = originX - imageX * focusScale;
  focusY = originY - imageY * focusScale;
  clampFocusPan();
  applyFocusTransform();
}

function closeMediaFocus() {
  const wasOpen = detailFocusOpen;
  detailFocusOpen = false;
  resetFocusTransform();
  clearFocusImageLayout();
  setHidden(detailFocus, true);
  hideFocusPager();
  cancelCarouselWheel();
  resetCarouselX(detailFocusTrack);
  if (wasOpen) {
    mediaFocusClosedAt = performance.now();
    mediaOpenSawPointer = false;
    syncFocusPageLock(false);
  }
  const detailScroll = document.querySelector('[data-scroll-view="detail"]');
  if (detailScroll && wasOpen) detailScroll.scrollTop = focusScrollTop;
  if (wasOpen && isPcFocusPlatform()) {
    window.scrollTo(0, focusWindowScroll);
  }
  if (wasOpen) logQaEvent("focus", "关闭图像查看");
}

function openMediaFocus() {
  if (!currentDetailMedia() || detailMediaFailed) return;
  const detailScroll = document.querySelector('[data-scroll-view="detail"]');
  focusScrollTop = detailScroll?.scrollTop ?? 0;
  focusWindowScroll =
    window.scrollY ||
    document.scrollingElement?.scrollTop ||
    document.documentElement.scrollTop ||
    0;
  detailFocusOpen = true;
  hideFocusPager();
  cancelCarouselWheel();
  resetCarouselX(detailFocusTrack);
  applyFocusMedia();
  setHidden(detailFocus, false);
  syncFocusPageLock(true);
  layoutFocusImage();
  requestAnimationFrame(() => {
    if (!detailFocusOpen) return;
    layoutFocusImage();
    clampFocusPan();
    applyFocusTransform();
  });
  detailFocus?.focus();
  logQaEvent("focus", "打开图像查看");
}

function focusPointerList() {
  return Array.from(focusPointers.values());
}

function onFocusPointerDown(event) {
  if (!detailFocusOpen) return;
  if (
    event.target.closest(".app-detail-focus__edge, .app-detail-focus__dots")
  ) {
    return;
  }
  event.preventDefault();
  resetCarouselX(detailFocusTrack);
  focusPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  detailFocusStage?.setPointerCapture?.(event.pointerId);
  const points = focusPointerList();
  if (points.length >= 2) {
    const [first, second] = points;
    focusDidPinch = true;
    focusPinch = {
      distance: Math.hypot(first.x - second.x, first.y - second.y) || 1,
      scale: focusScale,
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    };
    focusPan = null;
    return;
  }
  const atStart = detailMediaIndexValue <= 0;
  const atEnd = detailMediaIndexValue >= detailMediaItems.length - 1;
  focusPan = {
    x: event.clientX,
    y: event.clientY,
    originX: focusX,
    originY: focusY,
    atLeft: focusX >= focusPanBounds().maxX - 1,
    atRight: focusX <= -focusPanBounds().maxX + 1,
    atStart,
    atEnd,
    axis: null,
    time: event.timeStamp || Date.now(),
    lastX: event.clientX,
    lastTime: event.timeStamp || Date.now(),
    didCarousel: false,
    carouselX: 0,
  };
  focusDidPan = false;
}

function onFocusPointerMove(event) {
  if (!detailFocusOpen || !focusPointers.has(event.pointerId)) return;
  event.preventDefault();
  focusPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  const points = focusPointerList();
  if (focusPinch && points.length >= 2) {
    const [first, second] = points;
    const distance = Math.hypot(first.x - second.x, first.y - second.y) || 1;
    const midpointX = (first.x + second.x) / 2;
    const midpointY = (first.y + second.y) / 2;
    zoomFocusAt(
      midpointX,
      midpointY,
      focusScale * (distance / focusPinch.distance),
    );
    focusPinch.distance = distance;
    focusPinch.scale = focusScale;
    focusDidPan = true;
    return;
  }
  if (!focusPan || points.length !== 1) return;
  const dx = event.clientX - focusPan.x;
  const dy = event.clientY - focusPan.y;
  focusPan.lastX = event.clientX;
  focusPan.lastTime = event.timeStamp || Date.now();
  if (Math.hypot(dx, dy) > focusTapSlop) {
    focusDidPan = true;
    detailFocus?.classList.add("is-panning");
  }
  const zoomed = focusScale > 1.05;
  if (!focusPan.axis) {
    if (zoomed) {
      const axis = lockCarouselAxis(dx, dy);
      const canPageFromZoom =
        axis === "horizontal" &&
        ((dx < 0 && focusPan.atRight) || (dx > 0 && focusPan.atLeft));
      if (canPageFromZoom) focusPan.axis = "horizontal";
      else if (Math.hypot(dx, dy) > focusTapSlop) focusPan.axis = "pan";
    } else {
      focusPan.axis = lockCarouselAxis(dx, dy);
    }
    if (!focusPan.axis) return;
  }
  if (focusPan.axis === "vertical") return;
  if (focusPan.axis === "horizontal" || focusPan.didCarousel) {
    focusPan.didCarousel = true;
    focusPan.carouselX = rubberCarouselX(dx, focusPan.atStart, focusPan.atEnd);
    setCarouselX(detailFocusTrack, focusPan.carouselX, false);
    revealFocusPager();
    if (zoomed) {
      focusX = dx < 0 ? -focusPanBounds().maxX : focusPanBounds().maxX;
      applyFocusTransform();
    }
    return;
  }
  if (!zoomed) return;
  focusX = focusPan.originX + dx;
  focusY = focusPan.originY + dy;
  clampFocusPan();
  applyFocusTransform();
  const bounds = focusPanBounds();
  const atLeft = focusX >= bounds.maxX - 0.5;
  const atRight = focusX <= -bounds.maxX + 0.5;
  if (
    lockCarouselAxis(dx, dy) === "horizontal" &&
    ((dx < 0 && atRight) || (dx > 0 && atLeft))
  ) {
    focusPan.axis = "horizontal";
    const unclampedX = focusPan.originX + dx;
    const extra = unclampedX - focusX;
    focusPan.didCarousel = true;
    focusPan.carouselX = rubberCarouselX(
      extra,
      focusPan.atStart,
      focusPan.atEnd,
    );
    setCarouselX(detailFocusTrack, focusPan.carouselX, false);
    revealFocusPager();
  }
}

function tryFocusSwipePage(point, start) {
  if (!point || !start || detailMediaItems.length <= 1) return false;
  flushCarouselFrame();
  const dx = start.didCarousel ? start.carouselX : point.x - start.x;
  const dy = point.y - start.y;
  const dt = (point.timeStamp || Date.now()) - start.time;
  const recentDt =
    (point.timeStamp || Date.now()) - (start.lastTime || start.time);
  const recentVelocity =
    (point.x - (start.lastX ?? start.x)) / Math.max(16, recentDt);
  const width = carouselWidth(detailFocusStage);
  const atStart = start.atStart;
  const atEnd = start.atEnd;
  if (focusScale > 1.05 && !start.didCarousel) {
    const goingNext = dx < 0;
    if (goingNext && !start.atRight) return false;
    if (!goingNext && !start.atLeft) return false;
  }
  if (start.axis === "vertical" || start.axis === "pan") {
    if (!start.didCarousel) return false;
  }
  if (
    !shouldCommitCarousel(
      dx,
      dy,
      dt,
      width,
      atStart,
      atEnd,
      recentDt < 80 ? recentVelocity : undefined,
    )
  ) {
    if (start.didCarousel) setCarouselX(detailFocusTrack, 0, true);
    return false;
  }
  showFocusPager();
  return finishCarouselPage(dx, width, detailFocusTrack);
}

function onFocusPointerUp(event) {
  if (!detailFocusOpen || !focusPointers.has(event.pointerId)) return;
  const point = focusPointers.get(event.pointerId);
  if (point) point.timeStamp = event.timeStamp || Date.now();
  const swipeStart = focusPan;
  const didPinch = focusDidPinch;
  focusPointers.delete(event.pointerId);
  detailFocusStage?.releasePointerCapture?.(event.pointerId);
  if (focusPointers.size < 2) focusPinch = null;
  if (focusPointers.size !== 0) return;
  focusPan = null;
  detailFocus?.classList.remove("is-panning");
  focusDidPinch = false;
  if (didPinch) {
    resetCarouselX(detailFocusTrack);
    return;
  }
  if (tryFocusSwipePage(point, swipeStart)) return;
  const moved =
    point && swipeStart
      ? Math.hypot(point.x - swipeStart.x, point.y - swipeStart.y)
      : 0;
  if (focusDidPan || moved > focusTapSlop) {
    if (detailFocus?.classList.contains("is-pager-visible")) {
      scheduleFocusPagerHide();
    }
    return;
  }
  closeMediaFocus();
}

function isCarouselMouseZoom(event) {
  return (
    event.ctrlKey ||
    event.metaKey ||
    event.deltaMode !== 0 ||
    (Math.abs(event.deltaY) >= 40 && Math.abs(event.deltaX) < 1)
  );
}

function carouselWheelDeltaX(event, width) {
  let deltaX = event.deltaX;
  if (event.deltaMode === 1) deltaX *= pagerWheelLinePixels;
  if (event.deltaMode === 2) deltaX *= width || 1;
  return deltaX;
}

function clearCarouselWheelIdleTimer() {
  if (!carouselWheelIdleTimer) return;
  window.clearTimeout(carouselWheelIdleTimer);
  carouselWheelIdleTimer = 0;
}

function cancelCarouselWheel() {
  carouselWheel = null;
  clearCarouselWheelIdleTimer();
}

function completeCarouselWheel() {
  const gesture = carouselWheel;
  carouselWheel = null;
  clearCarouselWheelIdleTimer();
  if (!gesture) return;
  carouselWheelIgnoreUntil = performance.now() + carouselWheelIgnoreMs;
  flushCarouselFrame();
  const dx = gesture.carouselX;
  const dt = performance.now() - gesture.time;
  const width = gesture.width;
  if (
    shouldCommitCarousel(
      dx,
      0,
      dt,
      width,
      gesture.atStart,
      gesture.atEnd,
      dx / Math.max(16, dt),
    )
  ) {
    finishCarouselPage(dx, width, gesture.track);
  } else {
    setCarouselX(gesture.track, 0, true);
  }
  showFocusPager();
}

function scheduleCarouselWheelSettle() {
  clearCarouselWheelIdleTimer();
  carouselWheelIdleTimer = window.setTimeout(() => {
    carouselWheelIdleTimer = 0;
    completeCarouselWheel();
  }, carouselWheelIdleMs);
}

function handleImageCarouselWheel(event, track, viewport) {
  if (detailMediaItems.length <= 1 || !track) return false;
  const width = carouselWidth(viewport);
  const deltaX = carouselWheelDeltaX(event, width);
  const adx = Math.abs(deltaX);
  const ady = Math.abs(event.deltaY);
  const horizontal = adx > ady * carouselDirectionRatio;
  if (!horizontal) {
    if (carouselWheel) completeCarouselWheel();
    return false;
  }
  event.preventDefault();
  event.stopPropagation();
  if (performance.now() < carouselWheelIgnoreUntil) return true;
  if (!carouselWheel) {
    carouselWheel = {
      accumulatedX: 0,
      atEnd: detailMediaIndexValue >= detailMediaItems.length - 1,
      atStart: detailMediaIndexValue <= 0,
      carouselX: 0,
      deltas: [],
      time: performance.now(),
      track,
      width,
    };
  }
  const gesture = carouselWheel;
  if (isPcWheelInertia([...gesture.deltas, deltaX])) {
    completeCarouselWheel();
    return true;
  }
  gesture.deltas.push(deltaX);
  gesture.accumulatedX += deltaX;
  gesture.carouselX = rubberCarouselX(
    -gesture.accumulatedX,
    gesture.atStart,
    gesture.atEnd,
  );
  setCarouselX(gesture.track, gesture.carouselX, false);
  revealFocusPager();
  scheduleCarouselWheelSettle();
  return true;
}

function onFocusWheel(event) {
  if (!detailFocusOpen) return;
  const pinchZoom = event.ctrlKey || event.metaKey;
  const mouseWheel = isCarouselMouseZoom(event);
  if (pinchZoom || mouseWheel) {
    event.preventDefault();
    event.stopPropagation();
    if (carouselWheel) completeCarouselWheel();
    const factor = pinchZoom
      ? Math.exp(-event.deltaY * 0.01)
      : event.deltaY < 0
        ? 1.08
        : 1 / 1.08;
    zoomFocusAt(event.clientX, event.clientY, focusScale * factor);
    return;
  }
  if (focusScale > 1.05 && !carouselWheel) {
    const bounds = focusPanBounds();
    const atLeft = focusX >= bounds.maxX - 1;
    const atRight = focusX <= -bounds.maxX + 1;
    const towardNext = event.deltaX > 0;
    const atEdge = towardNext ? atRight : atLeft;
    const horizontal =
      Math.abs(event.deltaX) > Math.abs(event.deltaY) * carouselDirectionRatio;
    if (!horizontal || !atEdge) {
      event.preventDefault();
      event.stopPropagation();
      focusX -= event.deltaX;
      focusY -= event.deltaY;
      clampFocusPan();
      applyFocusTransform();
      return;
    }
  }
  if (handleImageCarouselWheel(event, detailFocusTrack, detailFocusStage)) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
}

function onDetailMediaWheel(event) {
  if (detailFocusOpen) return;
  handleImageCarouselWheel(
    event,
    detailMediaTrack,
    detailMediaOpen || detailMediaStage,
  );
}

function goToDetailMedia(index, options = {}) {
  const total = detailMediaItems.length;
  if (total <= 1) return false;
  const nextIndex = Math.min(total - 1, Math.max(0, index));
  if (nextIndex === detailMediaIndexValue) return false;
  detailMediaIndexValue = nextIndex;
  const track =
    options.track || (detailFocusOpen ? detailFocusTrack : detailMediaTrack);
  if (options.fromCarousel && options.width) {
    const goingNext = options.dragX < 0;
    setCarouselX(
      track,
      options.dragX + (goingNext ? options.width : -options.width),
      false,
    );
    flushCarouselFrame();
  } else {
    resetCarouselX(detailMediaTrack);
    resetCarouselX(detailFocusTrack);
  }
  applyDetailMedia();
  if (options.fromCarousel && options.width) {
    window.requestAnimationFrame(() => setCarouselX(track, 0, true));
  }
  showFocusPager();
  logQaEvent("media", `切图 ${detailMediaIndexValue + 1}/${total}`);
  if (history.state?.kind === "detail") {
    rememberDetailHistory(detailContentId, { replace: true });
  }
  return true;
}

function stepDetailMedia(step) {
  goToDetailMedia(detailMediaIndexValue + step);
}

function onMediaDotClick(event) {
  const button = event.target.closest("[data-media-index]");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const nextIndex = Number(button.dataset.mediaIndex);
  if (!Number.isInteger(nextIndex) || nextIndex === detailMediaIndexValue) {
    return;
  }
  goToDetailMedia(nextIndex);
}

function onDetailMediaPointerDown(event) {
  if (detailFocusOpen || detailMediaItems.length <= 1) return;
  if (
    event.target.closest("[data-detail-media-dots], .app-detail__media-edge")
  ) {
    return;
  }
  resetCarouselX(detailMediaTrack);
  mediaSwipe = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    time: event.timeStamp || Date.now(),
    lastX: event.clientX,
    lastTime: event.timeStamp || Date.now(),
    axis: null,
    paged: false,
    carouselX: 0,
    atStart: detailMediaIndexValue <= 0,
    atEnd: detailMediaIndexValue >= detailMediaItems.length - 1,
  };
}

function onDetailMediaPointerMove(event) {
  if (!mediaSwipe || event.pointerId !== mediaSwipe.id) return;
  const dx = event.clientX - mediaSwipe.x;
  const dy = event.clientY - mediaSwipe.y;
  mediaSwipe.lastX = event.clientX;
  mediaSwipe.lastTime = event.timeStamp || Date.now();
  if (!mediaSwipe.axis) {
    const axis = lockCarouselAxis(dx, dy);
    if (!axis) return;
    mediaSwipe.axis = axis;
    if (axis !== "horizontal") return;
    detailMediaStage?.setPointerCapture?.(event.pointerId);
    if (detailMediaStage) detailMediaStage.style.touchAction = "none";
  }
  if (mediaSwipe.axis !== "horizontal") return;
  event.preventDefault();
  mediaSwipe.carouselX = rubberCarouselX(
    dx,
    mediaSwipe.atStart,
    mediaSwipe.atEnd,
  );
  setCarouselX(detailMediaTrack, mediaSwipe.carouselX, false);
  revealFocusPager();
}

function onDetailMediaPointerUp(event) {
  if (!mediaSwipe || event.pointerId !== mediaSwipe.id) return;
  flushCarouselFrame();
  const dx = mediaSwipe.carouselX || event.clientX - mediaSwipe.x;
  const dy = event.clientY - mediaSwipe.y;
  const dt = (event.timeStamp || Date.now()) - mediaSwipe.time;
  const recentDt = (event.timeStamp || Date.now()) - mediaSwipe.lastTime;
  const recentVelocity =
    (event.clientX - mediaSwipe.lastX) / Math.max(16, recentDt);
  const width = carouselWidth(detailMediaOpen || detailMediaStage);
  const dragged = mediaSwipe.axis === "horizontal";
  if (detailMediaStage) detailMediaStage.style.touchAction = "";
  if (
    dragged &&
    shouldCommitCarousel(
      dx,
      dy,
      dt,
      width,
      mediaSwipe.atStart,
      mediaSwipe.atEnd,
      recentDt < 80 ? recentVelocity : undefined,
    )
  ) {
    mediaSwipe.paged = finishCarouselPage(dx, width, detailMediaTrack);
  } else if (dragged) {
    setCarouselX(detailMediaTrack, 0, true);
  }
  if (mediaSwipe.paged || dragged) mediaSwipeSuppressClick = true;
  if (dragged) showFocusPager();
  mediaSwipe = null;
}

function onDetailImageError() {
  if (!currentDetailMedia()) return;
  detailMediaFailed = true;
  if (detailImage) detailImage.hidden = true;
  setHidden(detailMediaError, false);
  setHidden(detailMediaFallback, true);
  logQaEvent("media", "图像暂时无法加载");
}

function openDetailById(
  contentId,
  { mediaIndex = 0, trigger = null, updateHistory = true } = {},
) {
  saveScrollPosition();
  closeMediaFocus();
  detailContentId = contentId;
  detailRecord = resolveCatalogRecord(contentId, trigger);
  detailMediaItems = detailMediaList(detailRecord);
  detailMediaIndexValue = Math.max(
    0,
    Math.min(mediaIndex, Math.max(detailMediaItems.length - 1, 0)),
  );
  updateDetailComposition();
  renderCatalogDetail(detailRecord);
  showView("detail");
  const detailScroll = document.querySelector('[data-scroll-view="detail"]');
  if (detailScroll) detailScroll.scrollTop = 0;
  if (updateHistory) rememberDetailHistory(contentId);
  logQaEvent(
    "detail",
    `打开 ${detailRecord?.title || contentId}（${contentId}）`,
  );
}

function openDetail(trigger, options = {}) {
  const contentId = trigger?.dataset.contentId;
  if (!contentId) return;
  openDetailById(contentId, { ...options, trigger });
}

function showView(view) {
  if (view !== "detail") closeMediaFocus();
  const isNavigationView = navigationViews.includes(view);
  const isPagerView = primaryViews.includes(view);
  const primaryShell = document.querySelector("[data-pager='primary']");
  if (!isNavigationView) parkPrimaryPagerForOverlay();
  if (primaryShell) {
    primaryShell.hidden = false;
    primaryShell.classList.toggle("is-overlay-parked", !isNavigationView);
    primaryShell.classList.toggle(
      "is-standalone-active",
      isNavigationView && !isPagerView,
    );
    primaryShell.toggleAttribute("inert", !isNavigationView);
    primaryShell.setAttribute("aria-hidden", String(!isNavigationView));
  }
  document.querySelectorAll("[data-view]").forEach((panel) => {
    const name = panel.dataset.view;
    if (primaryViews.includes(name)) return;
    panel.hidden = name !== view;
  });
  bottomNavigation.hidden = !isNavigationView;
  if (!isPagerView) setNavigationMinimized(false);
  if (isNavigationView) recalculateLayout();
}

function attachCardMedia(button, media) {
  if (!media) return;
  if (media.origin) button.dataset.mediaOrigin = media.origin;
  if (media.src) button.dataset.image = media.src;
  if (media.origin === "missing" || !media.src) {
    const fallback = document.createElement("span");
    fallback.className = "app-card__media-fallback";
    fallback.setAttribute("role", "img");
    fallback.setAttribute("aria-label", media.alt || "暂无图像");
    button.append(fallback);
    return;
  }
  const image = document.createElement("img");
  image.src = media.src;
  image.alt = media.alt || "";
  if (!button.classList.contains("app-inscription-card")) {
    applyMediaIntrinsics(image, media);
  }
  image.loading = "lazy";
  image.decoding = "async";
  image.addEventListener("error", () => {
    image.classList.add("is-media-error");
    button.classList.add("is-media-missing");
    image.alt = displayText(media.alt) || "图像无法加载";
  });
  button.append(image);
}

function appendCardCaption(button, record, role) {
  const caption = document.createElement("span");
  caption.className = "app-card__caption";
  const title = document.createElement("span");
  title.className = "app-card__title";
  title.textContent = displayText(record.title);
  caption.append(title);
  const metaText = catalogAdapter?.cardMeta(record, role) ?? "";
  if (metaText) {
    const meta = document.createElement("span");
    meta.className = "app-card__meta";
    meta.textContent = metaText;
    caption.append(meta);
  }
  button.append(caption);
}

function createContentCard({
  id,
  title,
  image,
  alt,
  meta,
  category,
  extraClass,
  filterText,
  media,
  width,
  height,
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = extraClass ? `app-card ${extraClass}` : "app-card";
  button.dataset.contentId = id;
  button.dataset.openDetail = "";
  button.dataset.title = displayText(title);
  if (image) button.dataset.image = image;
  if (category) button.dataset.category = category;
  if (filterText) button.dataset.calligraphyFilterText = filterText;
  attachCardMedia(
    button,
    media ||
      (image
        ? {
            alt: alt || displayText(title),
            height,
            src: image,
            width,
          }
        : { origin: "missing", alt: displayText(title) }),
  );
  const caption = document.createElement("span");
  caption.className = "app-card__caption";
  const titleNode = document.createElement("span");
  titleNode.className = "app-card__title";
  titleNode.textContent = displayText(title);
  caption.append(titleNode);
  if (meta) {
    const metaNode = document.createElement("span");
    metaNode.className = "app-card__meta";
    metaNode.textContent = meta;
    caption.append(metaNode);
  }
  button.append(caption);
  return button;
}

function renderProfilePlaceholder() {
  if (!profilePlaceholder) return;
  const profile = profilePlaceholder.profile ?? {};
  const setText = (selector, value) => {
    const element = document.querySelector(selector);
    if (element && value) element.textContent = displayText(value);
  };
  document.querySelectorAll("[data-profile-monogram]").forEach((element) => {
    if (profile.monogram) element.textContent = displayText(profile.monogram);
  });
  setText("[data-profile-name]", profile.displayName);
  setText("[data-profile-id]", profile.id);
  setText("[data-profile-bio]", profile.bio);

  const badges = document.querySelector("[data-profile-badges]");
  if (badges) {
    badges.replaceChildren(
      ...(profile.badges ?? []).map((label) => {
        const badge = document.createElement("span");
        badge.textContent = displayText(label);
        return badge;
      }),
    );
  }

  const stats = document.querySelector("[data-profile-stats]");
  if (stats) {
    stats.replaceChildren(
      ...(profilePlaceholder.stats ?? []).map(({ label, value }) => {
        const item = document.createElement("div");
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = displayText(label);
        description.textContent = displayText(value);
        item.append(term, description);
        return item;
      }),
    );
  }

  const posts = document.querySelector("[data-profile-posts]");
  if (!posts) return;
  const records = Array.isArray(profilePlaceholder.posts)
    ? profilePlaceholder.posts
    : [];
  posts.replaceChildren(
    ...records.map((record) =>
      createContentCard({
        alt: record.alt,
        id: record.id,
        image: record.image,
        meta: `${displayText(record.kind)} · ${displayText(record.meta)}`,
        title: record.title,
      }),
    ),
  );
  const empty = posts.parentElement?.querySelector("[data-profile-empty]");
  if (empty) empty.hidden = records.length > 0;
}

function createCatalogHomeCard(record, role = "discover") {
  return createContentCard({
    id: record.id,
    title: displayText(record.title),
    media: record.media?.[0],
    meta: catalogAdapter?.cardMeta(record, role) ?? "",
  });
}

function createCatalogInscriptionCard(record) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "app-inscription-card";
  button.dataset.searchText =
    catalogAdapter?.searchText(record) ?? record.title;
  button.dataset.contentId = record.id;
  button.dataset.openDetail = "";
  button.dataset.title = displayText(record.title);
  attachCardMedia(button, record.media?.[0]);

  const body = document.createElement("span");
  body.className = "app-inscription-card__body";
  const title = document.createElement("span");
  title.className = "app-inscription-card__title";
  title.textContent = displayText(record.title);
  const meta = document.createElement("span");
  meta.className = "app-inscription-card__meta";
  meta.textContent = catalogAdapter?.cardMeta(record, "inscription") ?? "";
  body.append(title, meta);

  const arrow = document.createElement("span");
  arrow.className = "yoyi-icon yoyi-icon--sm app-inscription-card__arrow";
  arrow.dataset.icon = "next";
  arrow.setAttribute("aria-hidden", "true");
  button.append(body, arrow);
  return button;
}

function createCatalogCalligraphyCard(record) {
  const button = createCatalogHomeCard(record, "calligraphy");
  button.dataset.category = record.calligraphyCategory || "ink";
  button.dataset.calligraphyFilterText =
    catalogAdapter?.searchText(record) ?? "";
  return button;
}

function setCatalogState(element, count) {
  if (!element) return;
  element.dataset.catalogState = count > 0 ? "ready" : "empty";
}

function ensureSiblingEmpty(anchor, key, message) {
  const parent = anchor?.parentElement;
  if (!parent) return null;
  let empty = parent.querySelector(`[data-feed-empty="${key}"]`);
  if (!empty) {
    empty = document.createElement("p");
    empty.className = "app-empty";
    empty.dataset.feedEmpty = key;
    empty.setAttribute("role", "status");
    parent.append(empty);
  }
  empty.textContent = message;
  return empty;
}

function renderP5CatalogCards() {
  const discover = document.querySelector('[data-feed-grid="discover"]');
  const nearby = document.querySelector('[data-feed-grid="nearby"]');
  const inscriptions = document.querySelector(
    '[data-view="inscriptions"] .app-list',
  );
  const inscriptionRecords =
    catalogAdapter?.inscriptionsFrom(adaptedP5Records) ?? adaptedP5Records;
  const nearbyRecords = catalogAdapter?.nearbyFrom(adaptedP5Records) ?? [];

  if (discover) {
    discover.replaceChildren(
      ...inscriptionRecords.map((record) =>
        createCatalogHomeCard(record, "discover"),
      ),
    );
    setCatalogState(discover, inscriptionRecords.length);
  }
  if (inscriptions) {
    const empty = inscriptions.querySelector("[data-search-empty]");
    inscriptions.replaceChildren(
      ...inscriptionRecords.map(createCatalogInscriptionCard),
    );
    if (empty) inscriptions.append(empty);
    setCatalogState(inscriptions, inscriptionRecords.length);
  }
  if (nearby) {
    nearbyRecords.forEach((record) => {
      if (nearby.querySelector(`[data-content-id="${record.id}"]`)) return;
      nearby.append(createCatalogHomeCard(record, "nearby"));
    });
    setCatalogState(
      nearby,
      nearby.querySelectorAll("[data-open-detail]").length,
    );
  }
  recalculateLayout();
}

function bindExistingCardMediaFallback() {
  document
    .querySelectorAll(
      ".app-card img, .app-topic-card img, .app-inscription-card img",
    )
    .forEach((image) => {
      if (!image.closest(".app-inscription-card")) {
        applyMediaIntrinsics(image, {
          src: image.getAttribute("src"),
          width: image.getAttribute("width"),
          height: image.getAttribute("height"),
        });
      }
      if (image.dataset.mediaBound === "true") return;
      image.dataset.mediaBound = "true";
      image.loading = image.loading || "lazy";
      image.addEventListener("error", () => {
        image.classList.add("is-media-error");
        image
          .closest(".app-card, .app-topic-card, .app-inscription-card")
          ?.classList.add("is-media-missing");
      });
    });
}

function renderSupplementalHomeCards() {
  for (const feed of ["discover", "nearby"]) {
    const panel = document.querySelector(`[data-feed-grid="${feed}"]`);
    const cards = supplementalHomeCards[feed] ?? [];
    if (!panel || !Array.isArray(cards)) continue;
    cards.forEach((card) => {
      if (panel.querySelector(`[data-content-id="${card.id}"]`)) return;
      panel.append(
        createContentCard({
          id: card.id,
          title: card.title,
          image: card.image,
          alt: card.alt,
          width: card.width,
          height: card.height,
        }),
      );
    });
  }
  recalculateLayout();
}

function renderSelectedDataset() {
  renderSupplementalHomeCards();
  renderProfilePlaceholder();
  if (prototypeDataset === "p5") renderP5CatalogCards();
  bindExistingCardMediaFallback();
}

function findTopic(topicId) {
  return (
    findEditorialTopic(topicId) ??
    p5TopicCollections.find((topic) => topic.id === topicId) ??
    null
  );
}

function appendTopicCardBody(button, topic, badgeLabel) {
  const body = document.createElement("span");
  body.className = "app-card__caption app-topic-card__body";
  const badge = document.createElement("span");
  badge.className = "app-topic-card__badge";
  badge.textContent = badgeLabel;
  const title = document.createElement("span");
  title.className = "app-card__title app-topic-card__title";
  title.textContent = displayText(topic.title);
  const blurb = document.createElement("span");
  blurb.className = "app-card__meta app-topic-card__blurb";
  blurb.textContent = displayText(topic.blurb);
  body.append(badge, title, blurb);
  button.append(body);
}

function renderAdaptedTopicCard(topic) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "app-card app-topic-card";
  button.dataset.openTopic = topic.id;
  button.dataset.kind = topic.kind;
  button.dataset.contentId = topic.id;
  attachCardMedia(button, {
    alt: topic.coverAlt || displayText(topic.title),
    src: topic.cover,
    origin: topic.cover ? "prototype-demo" : "missing",
  });
  appendTopicCardBody(button, topic, "专题");
  button.addEventListener("click", () => openTopicColumn(topic.id));
  return button;
}

function renderTopicsFeed() {
  if (!topicsGrid) return;
  topicsGrid.replaceChildren();
  if (prototypeDataset === "p5") {
    p5TopicCollections.forEach((topic) => {
      topicsGrid.append(renderAdaptedTopicCard(topic));
    });
    setCatalogState(topicsGrid, p5TopicCollections.length);
    const empty = ensureSiblingEmpty(
      topicsGrid,
      "topics",
      "当前快照没有可按朝代归组的专题",
    );
    if (empty) empty.hidden = p5TopicCollections.length > 0;
    recalculateLayout();
    return;
  }
  editorialTopics.forEach((topic) => {
    if (topic.kind !== "editorialTopic") return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "app-card app-topic-card";
    button.dataset.openTopic = topic.id;
    button.dataset.kind = topic.kind;
    button.dataset.contentId = topic.id;
    attachCardMedia(button, {
      alt: topic.coverAlt || displayText(topic.title),
      src: topic.cover,
    });
    appendTopicCardBody(button, topic, "专题/策展");
    button.addEventListener("click", () => openTopicColumn(topic.id));
    topicsGrid.append(button);
  });
  recalculateLayout();
}

function renderTopicBlock(block) {
  const wrap = document.createElement("section");
  wrap.className = `app-topic-block app-topic-block--${block.type}`;
  if (block.type === "lead" || block.type === "rich-text") {
    const p = document.createElement("p");
    p.textContent = block.text ?? "";
    wrap.append(p);
    return wrap;
  }
  if (block.type === "quote") {
    const q = document.createElement("blockquote");
    q.textContent = block.text ?? "";
    wrap.append(q);
    return wrap;
  }
  if (block.type === "image") {
    const img = document.createElement("img");
    img.src = block.src ?? "";
    img.alt = block.alt ?? "";
    wrap.append(img);
    if (block.caption) {
      const caption = document.createElement("p");
      caption.className = "app-topic-block__caption";
      caption.textContent = block.caption;
      wrap.append(caption);
    }
    return wrap;
  }
  if (block.type === "video") {
    const placeholder = document.createElement("div");
    placeholder.className = "app-topic-video";
    placeholder.setAttribute("role", "img");
    placeholder.setAttribute("aria-label", block.caption ?? "视频占位");
    placeholder.textContent = block.caption ?? "视频占位";
    const video = document.createElement("video");
    video.preload = "none";
    video.controls = false;
    video.setAttribute("playsinline", "");
    placeholder.append(video);
    wrap.append(placeholder);
    return wrap;
  }
  return wrap;
}

function openTopicColumn(topicId, { updateHistory = true } = {}) {
  const topic = findTopic(topicId);
  if (!topic) return;
  if (topic.kind !== "editorialTopic" && topic.kind !== "catalogCollection") {
    return;
  }
  saveScrollPosition();
  if (topicColumnHeading) topicColumnHeading.textContent = topic.title;
  if (topicColumnBody) {
    topicColumnBody.replaceChildren();
    const title = document.createElement("h1");
    title.textContent = displayText(topic.title);
    topicColumnBody.append(title);
    const badge = document.createElement("p");
    badge.className = "app-topic-card__badge";
    badge.textContent =
      topic.kind === "catalogCollection" ? "专题" : "专题/策展";
    topicColumnBody.append(badge);
    if (topic.kind === "catalogCollection") {
      const blurb = document.createElement("p");
      blurb.textContent = displayText(topic.blurb);
      topicColumnBody.append(blurb);
      const list = document.createElement("div");
      list.className = "app-topic-column__records";
      adaptedP5Records
        .filter((record) => topic.recordIds.includes(record.id))
        .forEach((record) => {
          const card = createCatalogHomeCard(record, "discover");
          card.addEventListener("click", () => openDetail(card));
          list.append(card);
        });
      topicColumnBody.append(list);
    } else {
      topic.blocks.forEach((block) => {
        topicColumnBody.append(renderTopicBlock(block));
      });
    }
    topicColumnBody.scrollTop = 0;
  }
  showView("topic-column");
  if (updateHistory) {
    history.pushState(
      { kind: "topic", topicId: topic.id, sourceView: "home" },
      "",
      `#topic-${topic.id}`,
    );
  }
}

function closeTopicColumn() {
  if (history.state?.kind === "topic") history.back();
  else {
    primaryView = "home";
    homeFeed = "topics";
    selectHomeFeed("topics");
    showView("home");
    updateBottomNavigation();
    restoreScrollPosition("home");
  }
}

function updateBottomNavigation() {
  document.querySelectorAll("[data-primary-view]").forEach((button) => {
    const selected = button.dataset.primaryView === primaryView;
    button.classList.toggle("is-active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (
    navDragging ||
    bottomNavigation.classList.contains("is-bubble-following")
  ) {
    return;
  }
  syncNavBubbleToActive();
}

function navigationCanMinimize() {
  return (
    root.dataset.platform !== "pc" &&
    Boolean(bottomNavigation.querySelector("[data-primary-view].is-active")) &&
    !bottomNavigation.hidden
  );
}

function prefersReducedNavMotion() {
  return Boolean(
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );
}

function navigationEntries() {
  return tabStripItems(bottomTabStrip);
}

function navigationPageEntries() {
  return tabStripProgressItems(bottomTabStrip);
}

function tabStripItems(strip) {
  if (!strip?.container) return [];
  return [...strip.container.querySelectorAll(strip.itemSelector)];
}

function tabStripProgressItems(strip) {
  if (!strip?.container) return [];
  return [
    ...strip.container.querySelectorAll(
      strip.progressItemSelector ?? strip.itemSelector,
    ),
  ];
}

function tabStripActive(strip) {
  if (!strip?.container) return null;
  return strip.container.querySelector(
    `${strip.itemSelector}.${strip.selectedClass}`,
  );
}

function tabStripForPager(id) {
  if (id === "home") return homeTabStrip;
  if (id === "calligraphy") return calligraphyTabStrip;
  if (id === "primary") return bottomTabStrip;
  return null;
}

function measureEntryBox(container, entry) {
  return {
    height: entry.offsetHeight,
    width: entry.offsetWidth,
    x: entry.offsetLeft,
    y: entry.offsetTop,
  };
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function lerpBox(start, end, amount) {
  return {
    height: lerp(start.height, end.height, amount),
    width: lerp(start.width, end.width, amount),
    x: lerp(start.x, end.x, amount),
    y: lerp(start.y, end.y, amount),
  };
}

function applyBubbleBox(strip, box, scale = 1) {
  if (strip?.kind === "bottom" && root.dataset.platform === "pc") {
    clearNavBubbleInlineStyle();
    return;
  }
  const bubble = strip?.bubble;
  if (!bubble || !strip.container) return;
  if (bubble.parentElement !== strip.container) {
    strip.container.prepend(bubble);
  }
  if (box.width <= 0 || box.height <= 0) return;
  bubble.style.width = `${box.width}px`;
  bubble.style.height = `${box.height}px`;
  bubble.style.transform = `translate3d(${box.x}px, ${box.y}px, 0) scale(${scale})`;
}

function clearNavBubbleInlineStyle() {
  if (!navBubble) return;
  navBubble.style.width = "";
  navBubble.style.height = "";
  navBubble.style.transform = "";
}

function positionTabStripEntry(strip, entry, scale = 1) {
  if (!strip || !entry) return;
  applyBubbleBox(strip, measureEntryBox(strip.container, entry), scale);
}

function positionTabStripProgress(strip, progress, scale = 1) {
  const items = tabStripProgressItems(strip);
  const last = items.length - 1;
  if (last < 0) return;
  if (progress <= 0) {
    const box = measureEntryBox(strip.container, items[0]);
    box.x += progress * Math.max(box.width, 1);
    applyBubbleBox(strip, box, scale);
    return;
  }
  if (progress >= last) {
    const box = measureEntryBox(strip.container, items[last]);
    box.x += (progress - last) * Math.max(box.width, 1);
    applyBubbleBox(strip, box, scale);
    return;
  }
  const fromIndex = Math.floor(progress);
  applyBubbleBox(
    strip,
    lerpBox(
      measureEntryBox(strip.container, items[fromIndex]),
      measureEntryBox(strip.container, items[fromIndex + 1]),
      progress - fromIndex,
    ),
    scale,
  );
}

function positionNavBubble(entry, scale = 1) {
  positionTabStripEntry(bottomTabStrip, entry, scale);
}

function syncTabStrip(strip) {
  const active = tabStripActive(strip);
  if (active) positionTabStripEntry(strip, active);
}

function markTabStripFollowing(controller, following) {
  tabStripForPager(controller.id)?.container?.classList.toggle(
    "is-bubble-following",
    following,
  );
}

function syncTabStripFromPager(controller) {
  const strip = tabStripForPager(controller.id);
  if (!strip?.bubble) return;
  const width = pagerWidth(controller);
  const progress = width > 0 ? -(controller.currentOffset ?? 0) / width : 0;
  positionTabStripProgress(strip, progress);
}

function syncTabStripForPager(controller) {
  const strip = tabStripForPager(controller.id);
  if (strip) syncTabStrip(strip);
}

function cancelPendingNavBubbleSync() {
  if (navigationBubbleExpandTimer) {
    window.clearTimeout(navigationBubbleExpandTimer);
    navigationBubbleExpandTimer = 0;
  }
  bottomNavigation.removeEventListener(
    "transitionend",
    onNavExpandTransitionEnd,
  );
  bottomNavigation.removeAttribute("data-bubble-pending");
}

function onNavExpandTransitionEnd(event) {
  if (event.target !== bottomNavigation) return;
  if (event.propertyName !== "width" && event.propertyName !== "padding") {
    return;
  }
  finishPendingNavBubbleSync();
}

function finishPendingNavBubbleSync() {
  cancelPendingNavBubbleSync();
  if (!navigationMinimized) syncNavBubbleToActive();
}

function scheduleNavBubbleSyncAfterExpand() {
  cancelPendingNavBubbleSync();
  if (prefersReducedNavMotion()) {
    syncNavBubbleToActive();
    return;
  }
  bottomNavigation.dataset.bubblePending = "true";
  bottomNavigation.addEventListener("transitionend", onNavExpandTransitionEnd);
  navigationBubbleExpandTimer = window.setTimeout(() => {
    navigationBubbleExpandTimer = 0;
    finishPendingNavBubbleSync();
  }, navigationExpandMs);
}

function syncNavBubbleToActive() {
  navigationEntries().forEach((entry) => entry.classList.remove("is-nav-hot"));
  if (root.dataset.platform === "pc") {
    clearNavBubbleInlineStyle();
    return;
  }
  const active = bottomNavigation.querySelector(
    "[data-primary-view].is-active",
  );
  if (!active) {
    clearNavBubbleInlineStyle();
    return;
  }
  if (
    active &&
    !navigationMinimized &&
    !bottomNavigation.hasAttribute("data-bubble-pending")
  ) {
    positionNavBubble(active);
  }
}

function nearestNavEntry(clientPosition) {
  const entries = navigationPageEntries();
  let nearest = entries[0];
  let best = Infinity;
  for (const entry of entries) {
    const rect = entry.getBoundingClientRect();
    const center =
      root.dataset.platform === "pc"
        ? rect.top + rect.height / 2
        : rect.left + rect.width / 2;
    const distance = Math.abs(clientPosition - center);
    if (distance < best) {
      best = distance;
      nearest = entry;
    }
  }
  return nearest;
}

function clearNavigationIdleTimer() {
  if (!navigationIdleTimer) return;
  window.clearTimeout(navigationIdleTimer);
  navigationIdleTimer = 0;
}

function scheduleNavigationExpand() {
  clearNavigationIdleTimer();
  navigationIdleTimer = window.setTimeout(() => {
    navigationIdleTimer = 0;
    setNavigationMinimized(false);
  }, navigationIdleMs);
}

function setNavigationMinimized(minimized) {
  const nextMinimized = navigationCanMinimize() && minimized;
  const wasMinimized = navigationMinimized;
  navigationMinimized = nextMinimized;
  bottomNavigation.classList.toggle("is-minimized", navigationMinimized);
  if (navigationMinimized) {
    bottomNavigation.dataset.minimized = "true";
    cancelPendingNavBubbleSync();
    clearNavBubbleInlineStyle();
    return;
  }
  bottomNavigation.removeAttribute("data-minimized");
  clearNavigationIdleTimer();
  if (wasMinimized) scheduleNavBubbleSyncAfterExpand();
  else syncNavBubbleToActive();
}

function resetNavigationScrollTracking({ expand = true } = {}) {
  const scrollElement = currentScrollElement();
  navigationLastScrollTop = scrollElement?.scrollTop ?? 0;
  navigationScrollIntent = 0;
  if (expand || !navigationCanMinimize()) setNavigationMinimized(false);
}

function isNavigationScrollTarget(event, scrollElement) {
  if (!scrollElement) return false;
  const target = event.target;
  if (target === scrollElement) return true;
  const documentScroll = document.scrollingElement ?? document.documentElement;
  if (
    scrollElement === documentScroll ||
    scrollElement === document.documentElement ||
    scrollElement === document.body
  ) {
    return (
      target === document ||
      target === document.documentElement ||
      target === document.body ||
      target === documentScroll
    );
  }
  return false;
}

function onNavigationScroll(event) {
  if (!navigationCanMinimize()) {
    setNavigationMinimized(false);
    return;
  }
  const scrollElement = currentScrollElement();
  if (!isNavigationScrollTarget(event, scrollElement)) return;
  const scrollTop = scrollElement.scrollTop;
  const delta = scrollTop - navigationLastScrollTop;
  navigationLastScrollTop = scrollTop;

  if (scrollTop <= 8) {
    resetNavigationScrollTracking();
    return;
  }
  if (delta === 0) return;

  navigationScrollIntent += delta;
  if (navigationScrollIntent >= navigationCollapseDelta) {
    setNavigationMinimized(true);
    navigationScrollIntent = 0;
  } else if (navigationScrollIntent <= -navigationExpandDelta) {
    setNavigationMinimized(false);
    navigationScrollIntent = 0;
    return;
  }
  if (navigationMinimized) scheduleNavigationExpand();
}

const navPointerMoveOptions = { passive: false };

function bindNavPointerTracking() {
  window.addEventListener(
    "pointermove",
    onNavPointerMove,
    navPointerMoveOptions,
  );
  window.addEventListener("pointerup", endNavPointer);
  window.addEventListener("pointercancel", endNavPointer);
}

function unbindNavPointerTracking() {
  window.removeEventListener(
    "pointermove",
    onNavPointerMove,
    navPointerMoveOptions,
  );
  window.removeEventListener("pointerup", endNavPointer);
  window.removeEventListener("pointercancel", endNavPointer);
}

function primaryPager() {
  return pagerControllers.get("primary");
}

function navTabWidth() {
  const entries = navigationPageEntries();
  const size =
    root.dataset.platform === "pc"
      ? entries[0]?.offsetHeight
      : entries[0]?.offsetWidth;
  return Math.max(1, size || 1);
}

function navPointerCoordinate(event) {
  return root.dataset.platform === "pc" ? event.clientY : event.clientX;
}

function lockPrimaryShellHeight(controller) {
  if (controller.id !== "primary") return;
  if (root.dataset.platform !== "pc") return;
  const height = Math.max(
    controller.surface.offsetHeight || 0,
    window.innerHeight || 0,
  );
  if (height > 0) controller.surface.style.height = `${height}px`;
}

function unlockPrimaryShellHeight(controller) {
  if (controller.id !== "primary") return;
  controller.surface.style.removeProperty("height");
}

function primaryTrackIsLive(controller) {
  return (
    isPagerFollowing(controller) ||
    controller.track.classList.contains("is-settling") ||
    controller.track.classList.contains("is-dragging")
  );
}

function parkPrimaryTrackIfIdle(controller) {
  if (!controller || controller.id !== "primary") return;
  if (primaryTrackIsLive(controller)) return;
  const activeIndex = controller.values.indexOf(controller.current());
  controller.currentOffset = -activeIndex * pagerWidth(controller);
  controller.track.style.removeProperty("transform");
}

function restorePrimaryTrackTransform(controller) {
  if (!controller || controller.id !== "primary") return;
  const fallback =
    -controller.values.indexOf(controller.current()) * pagerWidth(controller);
  const offset = Number.isFinite(controller.currentOffset)
    ? controller.currentOffset
    : fallback;
  setPagerOffset(controller, offset);
}

function parkPrimaryPagerForOverlay() {
  const controller = primaryPager();
  if (!controller) return;
  cancelPagerSpring(controller);
  controller.surface.classList.remove("is-pager-following");
  controller.track.classList.remove("is-dragging", "is-settling");
  unlockPrimaryShellHeight(controller);
  setPagerPageState(
    controller,
    controller.values.indexOf(controller.current()),
    false,
  );
  parkPrimaryTrackIfIdle(controller);
  markTabStripFollowing(controller, false);
}

function beginPrimaryPagerFollow(controller) {
  if (!controller) return;
  const activeIndex = controller.values.indexOf(controller.current());
  markTabStripFollowing(controller, true);
  controller.surface.classList.add("is-pager-following");
  lockPrimaryShellHeight(controller);
  restorePrimaryTrackTransform(controller);
  setPagerPageState(controller, activeIndex, true);
}

function armNavPagerGesture(event, controller) {
  cancelPagerSpring(controller);
  const width = pagerWidth(controller);
  const startIndex = controller.values.indexOf(controller.current());
  const startPosition = navPointerCoordinate(event);
  return {
    controller,
    dragX: 0,
    startIndex,
    startOffset: controller.currentOffset ?? -startIndex * width,
    startProgress: startIndex,
    startX: startPosition,
    samples: [{ time: pagerEventTime(event), x: startPosition }],
    width,
  };
}

function startNavPagerFollow(gesture) {
  if (!gesture || gesture.following) return;
  gesture.following = true;
  beginPrimaryPagerFollow(gesture.controller);
  gesture.controller.track.classList.add("is-dragging");
}

function onNavPointerDown(event) {
  if (root.dataset.platform === "pc") return;
  if (navigationMinimized || !event.isPrimary) return;
  if (prefersReducedNavMotion()) return;
  cancelPendingNavBubbleSync();
  if (navDragging) unbindNavPointerTracking();
  navPointerId = event.pointerId;
  navDragging = true;
  navDidPan = false;
  navPointerStartX = navPointerCoordinate(event);
  const controller = primaryPager();
  navPagerGesture = controller ? armNavPagerGesture(event, controller) : null;
  bindNavPointerTracking();
}

function applyNavPagerProgress(gesture, clientX) {
  const lastIndex = gesture.controller.values.length - 1;
  let progress =
    gesture.startProgress + (clientX - gesture.startX) / navTabWidth();
  if (progress < 0) progress *= pagerEdgeResistance;
  if (progress > lastIndex) {
    progress = lastIndex + (progress - lastIndex) * pagerEdgeResistance;
  }
  const offset = -progress * gesture.width;
  gesture.dragX = offset - gesture.startOffset;
  setPagerOffset(gesture.controller, offset);
  positionTabStripProgress(bottomTabStrip, progress, 1.12);
}

function onNavPointerMove(event) {
  if (!navDragging || event.pointerId !== navPointerId) return;
  const clientPosition = navPointerCoordinate(event);
  if (Math.abs(clientPosition - navPointerStartX) > 8) {
    if (!navDidPan) {
      navDidPan = true;
      if (navPagerGesture) startNavPagerFollow(navPagerGesture);
      bottomNavigation.classList.add("is-dragging-nav");
      try {
        bottomNavigation.setPointerCapture?.(event.pointerId);
      } catch {
        // Pointer capture may be unavailable in some embedded browsers.
      }
      positionTabStripProgress(
        bottomTabStrip,
        navPagerGesture?.startProgress ?? primaryViews.indexOf(primaryView),
        1.12,
      );
    }
    event.preventDefault();
  }
  if (!navDidPan) return;
  const gesture = navPagerGesture;
  if (!gesture) {
    const nearest = nearestNavEntry(clientPosition);
    positionNavBubble(nearest, 1.12);
    return;
  }
  addPagerSample(gesture, pagerEventTime(event), clientPosition);
  applyNavPagerProgress(gesture, clientPosition);
}

function endNavPointer(event) {
  if (!navDragging || event.pointerId !== navPointerId) return;
  const clientPosition = navPointerCoordinate(event);
  navDragging = false;
  navPointerId = null;
  unbindNavPointerTracking();
  bottomNavigation.classList.remove("is-dragging-nav");
  navigationEntries().forEach((entry) => entry.classList.remove("is-nav-hot"));
  const gesture = navPagerGesture;
  navPagerGesture = null;
  if (navDidPan) {
    navIgnoreClick = true;
    if (gesture) {
      addPagerSample(gesture, pagerEventTime(event), clientPosition);
      applyNavPagerProgress(gesture, clientPosition);
      gesture.controller.track.classList.remove("is-dragging");
      settlePagerFromGesture(gesture, pagerVelocityFromSamples(gesture));
    }
    return;
  }
  if (gesture) gesture.controller.track.classList.remove("is-dragging");
  const entry =
    event.target.closest?.("[data-primary-view]") ||
    nearestNavEntry(clientPosition);
  const view = entry?.dataset.primaryView;
  navIgnoreClick = true;
  if (view && view !== primaryView) selectPrimaryView(view, { animate: true });
  else syncNavBubbleToActive();
}

function onNavClickCapture(event) {
  if (navigationMinimized) {
    event.preventDefault();
    event.stopPropagation();
    setNavigationMinimized(false);
    return;
  }
  if (!navIgnoreClick) return;
  event.preventDefault();
  event.stopPropagation();
  navIgnoreClick = false;
}

function selectPrimaryView(
  view,
  { updateHistory = true, animate = false, velocity = 0 } = {},
) {
  if (!navigationViews.includes(view)) return;
  const previous = primaryView;
  const controller = pagerControllers.get("primary");
  const isPagerView = primaryViews.includes(view);
  if (previous !== view) saveScrollPosition();
  primaryView = view;
  if (animate && controller && isPagerView) {
    beginPrimaryPagerFollow(controller);
    setPagerPageState(controller, controller.values.indexOf(view), true);
  }
  showView(view);
  if (view === "home" || view === "calligraphy") {
    const inner = pagerControllers.get(view);
    if (inner) syncPager(inner);
  }
  updateBottomNavigation();
  restoreScrollPosition(view);
  resetNavigationScrollTracking();
  if (controller && isPagerView) syncPager(controller, { animate, velocity });
  if (updateHistory) {
    history.replaceState(
      { kind: "primary", view },
      "",
      `${location.pathname}${location.search}`,
    );
  }
  if (previous !== view) {
    logQaEvent("nav", `切换到${primaryViewLabel(view)}`);
  }
}

function selectProfileTab(value) {
  if (!profileTabs.includes(value)) return;
  document.querySelectorAll("[data-profile-tab]").forEach((button) => {
    const selected = button.dataset.profileTab === value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  document.querySelectorAll("[data-profile-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.profilePanel !== value;
  });
  logQaEvent("profile", `切换栏目 ${value}`);
}

function handleProfileAction(action) {
  if (action === "create") {
    selectPrimaryView("create", { animate: true });
    return;
  }
  const feedback = {
    drafts: "草稿箱仅为界面演示，不会读取或保存草稿",
    edit: "编辑资料功能待接入",
    messages: "消息功能待接入",
  }[action];
  if (!feedback) return;
  const status = document.querySelector("[data-profile-feedback]");
  if (status) status.textContent = feedback;
  logQaEvent("profile", `reserved ${action} action`);
}

function handleReservedCreateAction(action) {
  const feedback = {
    media: "图片功能待接入，不会打开文件选择器",
    submit: "提交功能待接入，内容未发布",
    tags: "标签功能待接入",
  }[action];
  if (!feedback) return;
  if (createFeedback) createFeedback.textContent = feedback;
  logQaEvent("create", `[create] reserved ${action} action`);
}

function matchesCalligraphyCard(card, normalizedQuery) {
  if (!normalizedQuery) return true;
  const haystack = (card.dataset.calligraphyFilterText ?? "").toLocaleLowerCase(
    "zh-CN",
  );
  return haystack.includes(normalizedQuery);
}

function filterCalligraphy() {
  const normalizedQuery = calligraphyFilterQuery
    .trim()
    .toLocaleLowerCase("zh-CN");
  document
    .querySelectorAll('[data-pager="calligraphy"] [data-pager-page]')
    .forEach((page) => {
      let visibleCount = 0;
      page.querySelectorAll("[data-category]").forEach((card) => {
        const matches = matchesCalligraphyCard(card, normalizedQuery);
        card.hidden = !matches;
        if (matches) visibleCount += 1;
      });
      const empty = page.querySelector("[data-calligraphy-filter-empty]");
      if (empty) empty.hidden = visibleCount > 0;
    });
  if (calligraphyFilterClear) {
    calligraphyFilterClear.hidden = normalizedQuery.length === 0;
  }
  recalculateLayout();
}

function masonryGapPx(container) {
  const raw = window
    .getComputedStyle(container)
    .getPropertyValue("--app-masonry-gap");
  const gap = Number.parseFloat(raw);
  return Number.isFinite(gap) ? gap : 8;
}

function masonryViewHidden(container) {
  return Boolean(
    container.closest("[data-view][hidden]") ||
    container.closest(".app-primary-shell.is-overlay-parked"),
  );
}

function masonryExpectedWidth(container) {
  const view = container.closest("[data-view]");
  if (view && view.clientWidth >= 32) return view.clientWidth;
  if (app?.clientWidth >= 32) return app.clientWidth;
  return window.innerWidth || 0;
}

function masonryMeasureWidth(container) {
  if (container.clientWidth >= 32) return container.clientWidth;
  const page = container.closest(".app-pager__page, [data-scroll-view]");
  if (page && page.clientWidth >= 32) return page.clientWidth;
  const pager = container.closest("[data-pager]");
  if (pager && pager.clientWidth >= 32) return pager.clientWidth;
  return container.clientWidth;
}

function masonryWidthIsReady(width, container) {
  if (width < 32) return false;
  const expected = masonryExpectedWidth(container);
  return expected < 64 || width >= expected * 0.6;
}

function intendedMasonryColumns(container) {
  const platform = root.dataset.platform;
  const layout = root.dataset.homeLayout || "double";
  if (platform === "pc") {
    const width = Math.max(0, masonryMeasureWidth(container));
    const gap = masonryGapPx(container);
    const minCard = 220;
    const maxCard = 320;
    if (width < 32) return 3;
    let columns = Math.max(
      3,
      Math.min(8, Math.floor((width + gap) / (minCard + gap))),
    );
    let colWidth = (width - gap * Math.max(0, columns - 1)) / columns;
    while (columns < 8 && colWidth > maxCard) {
      columns += 1;
      colWidth = (width - gap * Math.max(0, columns - 1)) / columns;
    }
    return columns;
  }
  return layout === "single" ? 1 : 2;
}

function inscriptionList() {
  return document.querySelector('[data-view="inscriptions"] .app-list');
}

function intendedInscriptionColumns(_container) {
  return 1;
}

function syncInscriptionGrid() {
  const container = inscriptionList();
  if (!container) return;
  const columns = intendedInscriptionColumns(container);
  container.dataset.inscriptionColumns = String(columns);
  container.style.setProperty("--app-inscription-columns", String(columns));
}

function syncMasonryColumnHints() {
  document.querySelectorAll(".app-masonry").forEach((container) => {
    container.dataset.masonryColumns = String(
      intendedMasonryColumns(container),
    );
  });
}

function masonryItems(container) {
  return [...container.children].filter(
    (item) => !item.hidden && !item.classList.contains("app-empty"),
  );
}

function clearMasonryItemStyles(container) {
  masonryItems(container).forEach((item) => {
    item.style.removeProperty("position");
    item.style.removeProperty("width");
    item.style.removeProperty("max-width");
    item.style.removeProperty("left");
    item.style.removeProperty("top");
    item.style.removeProperty("margin");
  });
  container.style.removeProperty("height");
}

function layoutMasonry(container) {
  if (!container || masonryViewHidden(container)) return;
  const columns = intendedMasonryColumns(container);
  container.dataset.masonryColumns = String(columns);
  const styles = window.getComputedStyle(container);
  const padLeft = Number.parseFloat(styles.paddingLeft) || 0;
  const padRight = Number.parseFloat(styles.paddingRight) || 0;
  const padTop = Number.parseFloat(styles.paddingTop) || 0;
  const padBottom = Number.parseFloat(styles.paddingBottom) || 0;
  const outerWidth = masonryMeasureWidth(container);
  const innerWidth = outerWidth - padLeft - padRight;
  if (!masonryWidthIsReady(innerWidth, container)) return;
  const items = masonryItems(container);
  if (items.length === 0) {
    clearMasonryItemStyles(container);
    container.dataset.layoutReady = "true";
    return;
  }
  const gap = masonryGapPx(container);
  const colWidth = (innerWidth - gap * Math.max(0, columns - 1)) / columns;
  if (!(colWidth > 0)) return;
  const heights = Array.from({ length: columns }, () => 0);
  items.forEach((item) => {
    item.style.position = "absolute";
    item.style.width = `${colWidth}px`;
    item.style.maxWidth = "100%";
    item.style.margin = "0";
    const col = heights.indexOf(Math.min(...heights));
    const x = padLeft + col * (colWidth + gap);
    const y = padTop + heights[col];
    item.style.left = `${x}px`;
    item.style.top = `${y}px`;
    heights[col] += item.offsetHeight + gap;
  });
  const tallest = Math.max(0, ...heights);
  const contentHeight =
    tallest > 0 ? tallest - gap + padTop + padBottom : padTop + padBottom;
  container.style.height = `${Math.max(0, contentHeight)}px`;
  container.dataset.layoutReady = "true";
}

function bindMasonryImages(container) {
  container.querySelectorAll("img").forEach((img) => {
    if (img.dataset.masonryBound === "true") return;
    img.dataset.masonryBound = "true";
    const relayout = () => layoutMasonry(container);
    img.addEventListener("load", relayout);
    img.addEventListener("error", relayout);
  });
}

function layoutAllMasonry() {
  document.querySelectorAll(".app-masonry").forEach((container) => {
    bindMasonryImages(container);
    layoutMasonry(container);
  });
}

function scheduleMasonryLayout() {
  if (masonryLayoutFrame) return;
  masonryLayoutFrame = window.requestAnimationFrame(() => {
    layoutAllMasonry();
    masonryLayoutFrame = window.requestAnimationFrame(() => {
      masonryLayoutFrame = 0;
      layoutAllMasonry();
    });
  });
}

function layoutOrientation() {
  return window.innerWidth > window.innerHeight ? "landscape" : "portrait";
}

function activeMasonryContainer() {
  if (primaryView === "home") {
    return homeFeed === "topics"
      ? topicsGrid
      : document.querySelector(`[data-feed-grid="${homeFeed}"]`);
  }
  if (primaryView === "calligraphy") {
    return document.querySelector(
      `[data-pager-page="${calligraphyCategory}"] .app-masonry`,
    );
  }
  return null;
}

function layoutContextLabel() {
  const page = primaryView;
  const section =
    page === "home"
      ? homeFeed
      : page === "calligraphy"
        ? calligraphyCategory
        : "all";
  const inscriptionGrid = page === "inscriptions" ? inscriptionList() : null;
  const container = inscriptionGrid ? null : activeMasonryContainer();
  const columns = inscriptionGrid
    ? intendedInscriptionColumns(inscriptionGrid)
    : container
      ? intendedMasonryColumns(container)
      : homeFeedLayout === "single"
        ? 1
        : 2;
  return `device=${root.dataset.platform} orientation=${layoutOrientation()} page=${page} section=${section} mode=${homeFeedLayout} columns=${columns}`;
}

function recalculateLayout() {
  syncMasonryColumnHints();
  syncInscriptionGrid();
  const active = activeMasonryContainer();
  if (active && !masonryViewHidden(active)) {
    bindMasonryImages(active);
    layoutMasonry(active);
  }
  scheduleMasonryLayout();
}

function touchPagerEnabled() {
  const touchDevice =
    root.dataset.deviceClass === "phone" ||
    root.dataset.deviceClass === "tablet";
  const touchPlatform =
    root.dataset.platform === "phone" || root.dataset.platform === "tablet";
  return touchDevice && touchPlatform;
}

function pcWheelPagerEnabled() {
  return root.dataset.platform === "pc";
}

function isPcHorizontalWheel(event) {
  if (!pcWheelPagerEnabled() || event.ctrlKey) return false;
  const deltaX = Math.abs(event.deltaX);
  const deltaY = Math.abs(event.deltaY);
  return (
    deltaX > deltaY * carouselDirectionRatio && deltaX >= pagerAxisLockDistance
  );
}

function preventPcHistorySwipe(event) {
  if (!isPcHorizontalWheel(event)) return;
  event.preventDefault();
}

function isPagerFollowing(controller) {
  return controller.surface.classList.contains("is-pager-following");
}

function anyPagerFollowing() {
  return [...pagerControllers.values()].some((controller) =>
    isPagerFollowing(controller),
  );
}

function beginPcPagerFollow(controller) {
  if (isPagerFollowing(controller)) return;
  const activeIndex = controller.values.indexOf(controller.current());
  controller.surface.classList.add("is-pager-following");
  markTabStripFollowing(controller, true);
  lockPrimaryShellHeight(controller);
  setPagerPageState(controller, activeIndex, true);
  const fallback = -activeIndex * pagerWidth(controller);
  const offset = Number.isFinite(controller.currentOffset)
    ? controller.currentOffset
    : fallback;
  setPagerOffset(controller, offset);
}

function endPcPagerFollow(controller) {
  controller.surface.classList.remove("is-pager-following");
  controller.track.classList.remove("is-dragging");
  unlockPrimaryShellHeight(controller);
  syncPager(controller);
}

function clearPagerWheelIdleTimer() {
  if (!pagerWheelIdleTimer) return;
  window.clearTimeout(pagerWheelIdleTimer);
  pagerWheelIdleTimer = 0;
}

function shouldIgnorePcWheel(controller) {
  return (
    performance.now() < (controller.wheelIgnoreUntil ?? 0) ||
    Boolean(controller.animationId) ||
    controller.track.classList.contains("is-settling")
  );
}

function pagerWheelDeltaX(event, pageWidth) {
  let deltaX = event.deltaX;
  if (event.deltaMode === 1) deltaX *= pagerWheelLinePixels;
  if (event.deltaMode === 2) deltaX *= pageWidth || 1;
  return deltaX * pagerWheelPixelGain;
}

function isPcWheelInertia(deltas) {
  if (deltas.length < pagerWheelInertiaMinEvents) return false;
  const recent = deltas.slice(-pagerWheelInertiaMinEvents);
  const sign = Math.sign(recent[0]);
  if (sign === 0 || recent.some((delta) => Math.sign(delta) !== sign)) {
    return false;
  }
  const magnitudes = recent.map((delta) => Math.abs(delta));
  for (let index = 1; index < magnitudes.length; index += 1) {
    if (magnitudes[index] >= magnitudes[index - 1]) return false;
  }
  const peak = Math.max(...deltas.map((delta) => Math.abs(delta)));
  const latest = magnitudes.at(-1);
  return (
    latest <= pagerWheelInertiaMaxDelta &&
    latest <= peak * pagerWheelInertiaPeakRatio
  );
}

function completePcWheelGesture() {
  const gesture = activeWheelGesture;
  if (!gesture) return;
  activeWheelGesture = null;
  clearPagerWheelIdleTimer();
  gesture.controller.wheelIgnoreUntil = performance.now() + pagerWheelIgnoreMs;
  gesture.controller.track.classList.remove("is-dragging");
  addPagerSample(gesture, performance.now(), -gesture.accumulatedX);
  settlePagerFromGesture(gesture, pagerVelocityFromSamples(gesture));
}

function schedulePcWheelSettle() {
  clearPagerWheelIdleTimer();
  pagerWheelIdleTimer = window.setTimeout(() => {
    pagerWheelIdleTimer = 0;
    completePcWheelGesture();
  }, pagerWheelIdleMs);
}

function pagerGestureIsLive() {
  if (activeWheelGesture || activePagerGesture || navPagerGesture) return true;
  if (anyPagerFollowing()) return true;
  return [...pagerControllers.values()].some(
    (controller) =>
      controller.track.classList.contains("is-settling") ||
      controller.track.classList.contains("is-dragging"),
  );
}

function handlePagerWheel(event, controller) {
  if (controller.id === "primary") {
    return;
  } else {
    event.stopPropagation();
  }
  const continuing =
    activeWheelGesture && activeWheelGesture.controller === controller;
  if (event.ctrlKey) return;
  if (!continuing && !isPcHorizontalWheel(event)) return;
  if (continuing && Math.abs(event.deltaX) < Math.abs(event.deltaY)) {
    event.preventDefault();
    return;
  }

  event.preventDefault();
  if (shouldIgnorePcWheel(controller)) return;

  if (activeWheelGesture && activeWheelGesture.controller !== controller) {
    completePcWheelGesture();
  }

  if (!activeWheelGesture) {
    cancelPagerSpring(controller);
    beginPcPagerFollow(controller);
    const width = pagerWidth(controller);
    const startIndex = controller.values.indexOf(controller.current());
    activeWheelGesture = {
      accumulatedX: 0,
      axis: "horizontal",
      controller,
      deltas: [],
      dragX: 0,
      startIndex,
      startOffset: controller.currentOffset ?? -startIndex * width,
      samples: [{ time: pagerEventTime(event), x: 0 }],
      width,
    };
    controller.track.classList.add("is-dragging");
  }

  const gesture = activeWheelGesture;
  const deltaX = pagerWheelDeltaX(event, gesture.width);
  if (isPcWheelInertia([...gesture.deltas, deltaX])) {
    completePcWheelGesture();
    return;
  }

  gesture.deltas.push(deltaX);
  gesture.accumulatedX += deltaX;
  addPagerSample(gesture, pagerEventTime(event), -gesture.accumulatedX);
  const minimumOffset = -(gesture.controller.values.length - 1) * gesture.width;
  let offset = gesture.startOffset - gesture.accumulatedX;
  if (offset > 0) offset *= pagerEdgeResistance;
  if (offset < minimumOffset) {
    offset = minimumOffset + (offset - minimumOffset) * pagerEdgeResistance;
  }
  gesture.dragX = offset - gesture.startOffset;
  setPagerOffset(gesture.controller, offset);
  schedulePcWheelSettle();
}

function pagerWidth(controller) {
  const measuredWidth =
    controller.surface.getBoundingClientRect().width ||
    controller.surface.clientWidth ||
    window.innerWidth;
  if (Number.isFinite(measuredWidth) && measuredWidth > 0) {
    controller.lastWidth = measuredWidth;
  }
  return controller.lastWidth || 1;
}

function setPagerOffset(controller, offset) {
  controller.currentOffset = offset;
  controller.track.style.transform = `translate3d(${offset}px, 0, 0)`;
  syncTabStripFromPager(controller);
}

function setPagerPageState(controller, activeIndex, windowed) {
  controller.pages.forEach((page, index) => {
    const selected = index === activeIndex;
    const inWindow = Math.abs(index - activeIndex) <= 1;
    const hideInactive = controller.id !== "primary" && !windowed && !selected;
    page.hidden = hideInactive;
    page.classList.toggle("is-pager-active", selected);
    page.classList.toggle(
      "is-pager-culled",
      controller.id !== "primary" && windowed && !inWindow,
    );
    page.setAttribute("aria-hidden", String(!selected));
    if (selected) page.removeAttribute("inert");
    else page.setAttribute("inert", "");
  });
}

function cancelPagerSpring(controller) {
  if (controller.animationId) {
    window.cancelAnimationFrame(controller.animationId);
  }
  controller.animationId = 0;
  controller.track.classList.remove("is-settling");
}

function prefersReducedPagerMotion() {
  return Boolean(
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
  );
}

function concludePagerSpring(controller) {
  controller.animationId = 0;
  controller.track.classList.remove("is-settling");
  if (controller.id === "primary" || pcWheelPagerEnabled()) {
    endPcPagerFollow(controller);
  } else {
    markTabStripFollowing(controller, false);
    controller.surface.classList.remove("is-pager-following");
    setPagerOffset(
      controller,
      -controller.values.indexOf(controller.current()) * pagerWidth(controller),
    );
    syncTabStripForPager(controller);
  }
  recalculateLayout();
}

function startPagerSpring(controller, targetOffset, initialVelocity = 0) {
  cancelPagerSpring(controller);
  if (controller.id === "primary") beginPrimaryPagerFollow(controller);
  else if (pcWheelPagerEnabled()) beginPcPagerFollow(controller);
  markTabStripFollowing(controller, true);
  if (prefersReducedPagerMotion()) {
    setPagerOffset(controller, targetOffset);
    concludePagerSpring(controller);
    return;
  }

  let position = controller.currentOffset ?? targetOffset;
  let velocity =
    Math.max(
      -pagerMaximumVelocity,
      Math.min(pagerMaximumVelocity, initialVelocity),
    ) * 1000;
  let elapsedSeconds = 0;
  let previousTimestamp = null;
  controller.track.classList.add("is-settling");

  const advanceSpring = (timestamp) => {
    const rawFrameSeconds =
      previousTimestamp === null
        ? 1 / 60
        : (timestamp - previousTimestamp) / 1000;
    previousTimestamp = timestamp;
    elapsedSeconds += Math.max(0, rawFrameSeconds);
    let frameSeconds = Math.min(
      pagerSpringMaxFrameSeconds,
      Math.max(0, rawFrameSeconds),
    );

    while (frameSeconds > 0) {
      const stepSeconds = Math.min(pagerSpringStepSeconds, frameSeconds);
      const displacement = position - targetOffset;
      const acceleration =
        (-pagerSpringStiffness * displacement - pagerSpringDamping * velocity) /
        pagerSpringMass;
      velocity += acceleration * stepSeconds;
      position += velocity * stepSeconds;
      frameSeconds -= stepSeconds;
    }
    setPagerOffset(controller, position);

    const settled =
      Math.abs(position - targetOffset) <= pagerSpringPositionTolerance &&
      Math.abs(velocity) <= pagerSpringVelocityTolerance;
    if (settled || elapsedSeconds >= pagerSpringMaxDurationSeconds) {
      setPagerOffset(controller, targetOffset);
      concludePagerSpring(controller);
      return;
    }
    controller.animationId = window.requestAnimationFrame(advanceSpring);
  };

  controller.animationId = window.requestAnimationFrame(advanceSpring);
}

function syncPager(controller, { animate = false, velocity = 0 } = {}) {
  const activeIndex = controller.values.indexOf(controller.current());
  const touchMode = touchPagerEnabled();
  const following = isPagerFollowing(controller);
  const keepTrack = touchMode || following || controller.id === "primary";
  const windowed =
    controller.id === "primary" ? following || animate : keepTrack;
  cancelPagerSpring(controller);
  controller.track.classList.remove("is-dragging");
  setPagerPageState(controller, activeIndex, windowed);
  const targetOffset = -activeIndex * pagerWidth(controller);
  if (!keepTrack) {
    controller.currentOffset = targetOffset;
    controller.track.style.removeProperty("transform");
    controller.surface.classList.remove("is-pager-following");
    markTabStripFollowing(controller, false);
    syncTabStripForPager(controller);
    return;
  }
  if (animate) {
    startPagerSpring(controller, targetOffset, velocity);
    return;
  }
  controller.surface.classList.remove("is-pager-following");
  markTabStripFollowing(controller, false);
  if (controller.id === "primary") {
    parkPrimaryTrackIfIdle(controller);
    syncTabStripForPager(controller);
    return;
  }
  setPagerOffset(controller, targetOffset);
}

function syncAllPagers(options) {
  pagerControllers.forEach((controller) => syncPager(controller, options));
}

function prepareCalligraphyPages() {
  const track = document.querySelector(
    '[data-pager="calligraphy"] [data-pager-track]',
  );
  const allPage = track?.querySelector('[data-pager-page="all"]');
  if (!track || !allPage || track.querySelector('[data-pager-page="ink"]')) {
    return;
  }
  for (const category of calligraphyCategories.slice(1)) {
    const page = allPage.cloneNode(true);
    page.dataset.pagerPage = category;
    page.dataset.scrollKey = `calligraphy:${category}`;
    page.querySelectorAll("[data-category]").forEach((card) => {
      if (card.dataset.category !== category) card.remove();
    });
    page.querySelector("[data-calligraphy-filter-empty]").hidden = true;
    track.append(page);
  }
}

function preparePager(id, values, current, select) {
  const surface = document.querySelector(`[data-pager="${id}"]`);
  const track = surface?.querySelector("[data-pager-track]");
  if (!surface || !track) return;
  const pages = values.map((value) =>
    [...track.children].find((node) => node.dataset.pagerPage === value),
  );
  if (pages.some((page) => !page)) return;
  const controller = {
    animationId: 0,
    currentOffset: 0,
    current,
    id,
    pages,
    select,
    surface,
    track,
    lastWidth: 0,
    values,
    wheelIgnoreUntil: 0,
  };
  pagerControllers.set(id, controller);
  syncPager(controller);
}

function preparePagers() {
  prepareCalligraphyPages();
  preparePager("home", homeFeeds, () => homeFeed, selectHomeFeed);
  preparePager(
    "calligraphy",
    calligraphyCategories,
    () => calligraphyCategory,
    selectCalligraphyCategory,
  );
  preparePager(
    "primary",
    primaryViews,
    () => (primaryViews.includes(primaryView) ? primaryView : "home"),
    selectPrimaryView,
  );
}

function selectHomeFeed(value, { animate = false, velocity = 0 } = {}) {
  if (!homeFeeds.includes(value)) return;
  const changed = homeFeed !== value;
  if (changed && primaryView === "home") saveScrollPosition();
  homeFeed = value;
  document.querySelectorAll("[data-home-feed]").forEach((button) => {
    const selected = button.dataset.homeFeed === value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  const controller = pagerControllers.get("home");
  if (animate && controller && pcWheelPagerEnabled()) {
    beginPcPagerFollow(controller);
  }
  if (controller) syncPager(controller, { animate, velocity });
  else {
    document.querySelectorAll("[data-feed-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.feedPanel !== value;
    });
  }
  if (changed && primaryView === "home") restoreScrollPosition("home");
  if (changed) {
    const labels = { discover: "发现", nearby: "附近", topics: "专题" };
    logQaEvent("home", `首页栏目 ${labels[value] ?? value}`);
  }
  recalculateLayout();
}

function selectCalligraphyCategory(
  value,
  { animate = false, velocity = 0 } = {},
) {
  if (!calligraphyCategories.includes(value)) return;
  const changed = calligraphyCategory !== value;
  if (changed && primaryView === "calligraphy") saveScrollPosition();
  calligraphyCategory = value;
  document.querySelectorAll("[data-calligraphy-category]").forEach((button) => {
    const selected = button.dataset.calligraphyCategory === value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  filterCalligraphy();
  const controller = pagerControllers.get("calligraphy");
  if (animate && controller && pcWheelPagerEnabled()) {
    beginPcPagerFollow(controller);
  }
  if (controller) syncPager(controller, { animate, velocity });
  if (changed && primaryView === "calligraphy") {
    restoreScrollPosition("calligraphy");
  }
  if (changed) {
    const labels = { all: "全部", ink: "墨迹", rubbing: "拓本" };
    logQaEvent("calligraphy", `书帖分类 ${labels[value] ?? value}`);
  }
  recalculateLayout();
}

function cancelActivePagerGesture({ animate = true } = {}) {
  if (!activePagerGesture) {
    unbindPagerPointerTracking();
    return;
  }
  const { controller, pointerId, axis } = activePagerGesture;
  try {
    if (controller.surface.hasPointerCapture?.(pointerId)) {
      controller.surface.releasePointerCapture(pointerId);
    }
  } catch {
    // Pointer capture can disappear when the browser cancels the gesture.
  }
  activePagerGesture = null;
  unbindPagerPointerTracking();
  if (axis !== "horizontal") {
    controller.track.classList.remove("is-dragging");
    return;
  }
  syncPager(controller, { animate });
}

function pagerEventTime(event) {
  return Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now();
}

function addPagerSample(gesture, time, x) {
  gesture.samples.push({ time, x });
  const minimumTime = time - pagerVelocityWindowMs;
  while (gesture.samples.length > 2 && gesture.samples[1].time < minimumTime) {
    gesture.samples.shift();
  }
}

function addPagerVelocitySample(gesture, event) {
  addPagerSample(gesture, pagerEventTime(event), event.clientX);
}

function pagerVelocityFromSamples(gesture) {
  const samples = gesture.samples;
  const latestTime = samples.at(-1)?.time ?? 0;
  const windowStart = latestTime - pagerVelocityWindowMs;
  let weightedVelocity = 0;
  let totalWeight = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const segmentDuration = current.time - previous.time;
    if (segmentDuration <= 0 || current.time <= windowStart) continue;
    const elapsed = current.time - Math.max(previous.time, windowStart);
    const recency = Math.max(
      0.15,
      1 - (latestTime - current.time) / pagerVelocityWindowMs,
    );
    const weight = elapsed * recency;
    weightedVelocity += ((current.x - previous.x) / segmentDuration) * weight;
    totalWeight += weight;
  }
  if (totalWeight === 0) return 0;
  return Math.max(
    -pagerMaximumVelocity,
    Math.min(pagerMaximumVelocity, weightedVelocity / totalWeight),
  );
}

function pagerReleaseVelocity(gesture, event) {
  addPagerVelocitySample(gesture, event);
  return pagerVelocityFromSamples(gesture);
}

function pagerContains(outer, inner) {
  return Boolean(outer?.surface?.contains(inner?.surface) && outer !== inner);
}

function pagerPointerAllowed(controller, event) {
  if (controller.id === "primary") return false;
  return touchPagerEnabled() && event.pointerType === "touch";
}

function unbindPagerPointerTracking() {
  window.removeEventListener(
    "pointermove",
    onPagerPointerMove,
    pagerPeekMoveOptions,
  );
  window.removeEventListener(
    "pointermove",
    onPagerPointerMove,
    pagerActiveMoveOptions,
  );
  window.removeEventListener("pointerup", completePagerGesture);
  window.removeEventListener("pointercancel", onPagerPointerCancel);
  pagerPointerMoveMode = "";
}

function bindPagerPointerTracking(mode) {
  if (pagerPointerMoveMode === mode) return;
  unbindPagerPointerTracking();
  pagerPointerMoveMode = mode;
  const moveOptions =
    mode === "active" ? pagerActiveMoveOptions : pagerPeekMoveOptions;
  window.addEventListener("pointermove", onPagerPointerMove, moveOptions);
  window.addEventListener("pointerup", completePagerGesture);
  window.addEventListener("pointercancel", onPagerPointerCancel);
}

function onPagerPointerCancel() {
  cancelActivePagerGesture();
}

function beginPagerGesture(event, controller) {
  if (!pagerPointerAllowed(controller, event)) return;
  if (!event.isPrimary) {
    cancelActivePagerGesture();
    return;
  }
  if (activePagerGesture) {
    if (pagerContains(controller, activePagerGesture.controller)) return;
    cancelActivePagerGesture();
    return;
  }
  cancelPagerSpring(controller);
  const width = pagerWidth(controller);
  activePagerGesture = {
    axis: null,
    controller,
    dragX: 0,
    pointerId: event.pointerId,
    startIndex: controller.values.indexOf(controller.current()),
    startOffset:
      controller.currentOffset ??
      -controller.values.indexOf(controller.current()) * width,
    startX: event.clientX,
    startY: event.clientY,
    samples: [{ time: pagerEventTime(event), x: event.clientX }],
    width,
  };
  bindPagerPointerTracking("peek");
}

function onPagerPointerMove(event) {
  const gesture = activePagerGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  if (!event.isPrimary) {
    cancelActivePagerGesture();
    return;
  }
  const deltaX = event.clientX - gesture.startX;
  const deltaY = event.clientY - gesture.startY;
  if (!gesture.axis) {
    if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) < pagerAxisLockDistance) {
      return;
    }
    if (Math.abs(deltaY) >= Math.abs(deltaX)) {
      activePagerGesture = null;
      unbindPagerPointerTracking();
      return;
    }
    gesture.axis = "horizontal";
    gesture.controller.track.classList.add("is-dragging");
    markTabStripFollowing(gesture.controller, true);
    if (gesture.controller.id === "primary") {
      beginPrimaryPagerFollow(gesture.controller);
    }
    bindPagerPointerTracking("active");
    try {
      gesture.controller.surface.setPointerCapture?.(gesture.pointerId);
    } catch {
      // Some embedded browsers expose pointer capture before fully supporting it.
    }
  }
  if (pagerPointerMoveMode === "active") event.preventDefault();
  addPagerVelocitySample(gesture, event);
  const minimumOffset = -(gesture.controller.values.length - 1) * gesture.width;
  let offset = gesture.startOffset + deltaX;
  if (offset > 0) offset *= pagerEdgeResistance;
  if (offset < minimumOffset) {
    offset = minimumOffset + (offset - minimumOffset) * pagerEdgeResistance;
  }
  gesture.dragX = offset - gesture.startOffset;
  setPagerOffset(gesture.controller, offset);
}

function settlePagerFromGesture(gesture, velocity) {
  const distanceRatio = Math.abs(gesture.dragX) / gesture.width;
  const flick =
    distanceRatio >= pagerFlickMinimumDistanceRatio &&
    Math.abs(velocity) >= pagerFlickMinimumVelocity &&
    Math.sign(velocity) === Math.sign(gesture.dragX);
  const lastIndex = gesture.controller.values.length - 1;
  const visualPosition = Math.max(
    0,
    Math.min(lastIndex, -gesture.controller.currentOffset / gesture.width),
  );
  const lowerIndex = Math.floor(visualPosition);
  const visibleFraction = visualPosition - lowerIndex;
  let destinationIndex;
  if (flick && velocity < 0) {
    destinationIndex = Math.min(lastIndex, Math.ceil(visualPosition - 1e-6));
  } else if (flick && velocity > 0) {
    destinationIndex = Math.max(0, Math.floor(visualPosition + 1e-6));
  } else if (Math.abs(visibleFraction - 0.5) <= 1e-6) {
    destinationIndex = gesture.startIndex;
  } else {
    destinationIndex =
      visibleFraction > 0.5 ? Math.min(lastIndex, lowerIndex + 1) : lowerIndex;
  }
  if (destinationIndex !== gesture.startIndex) {
    gesture.controller.select(gesture.controller.values[destinationIndex], {
      animate: true,
      velocity,
    });
    return;
  }
  syncPager(gesture.controller, { animate: true, velocity });
}

function completePagerGesture(event) {
  const gesture = activePagerGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) {
    return;
  }
  activePagerGesture = null;
  unbindPagerPointerTracking();
  if (gesture.axis !== "horizontal") return;
  try {
    if (gesture.controller.surface.hasPointerCapture?.(gesture.pointerId)) {
      gesture.controller.surface.releasePointerCapture(gesture.pointerId);
    }
  } catch {
    // The capture may already be released after leaving the browsing context.
  }
  gesture.controller.track.classList.remove("is-dragging");
  gesture.controller.surface.dataset.suppressSwipeClickUntil = String(
    performance.now() + swipeClickSuppressionWindow,
  );
  settlePagerFromGesture(gesture, pagerReleaseVelocity(gesture, event));
}

function suppressSwipeClick(event, surface) {
  const suppressUntil = Number(surface.dataset.suppressSwipeClickUntil ?? 0);
  if (performance.now() > suppressUntil) return;
  delete surface.dataset.suppressSwipeClickUntil;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function filterInscriptions(query) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  let visibleCount = 0;
  document.querySelectorAll("[data-search-text]").forEach((item) => {
    const matches = item.dataset.searchText
      .toLocaleLowerCase("zh-CN")
      .includes(normalizedQuery);
    item.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  document.querySelector("[data-search-empty]").hidden = visibleCount > 0;
  searchClear.hidden = normalizedQuery.length === 0;
  recalculateLayout();
}

function applyThemePreference(value, { persist = true } = {}) {
  themePreference = themePreferences.includes(value) ? value : "system";
  if (themePreference === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = themePreference;
  syncThemeToggle();
  if (persist) persistPreference(themePreferenceKey, themePreference);
  if (persist) {
    logQaEvent(
      "theme",
      `主题 ${themeModeLabels[themePreference] ?? themePreference}`,
    );
  }
}

function applyHomeFeedLayout(value, { persist = true } = {}) {
  homeFeedLayout = homeLayouts.includes(value) ? value : "double";
  root.dataset.homeLayout = homeFeedLayout;
  syncLayoutToggle();
  recalculateLayout();
  if (persist) persistPreference(homeLayoutKey, homeFeedLayout);
  if (persist) {
    logQaEvent("layout", layoutContextLabel());
  }
}

function cycleThemePreference() {
  applyThemePreference(nextCycledValue(themeModeOrder, themePreference));
}

function cycleHomeFeedLayout() {
  applyHomeFeedLayout(nextCycledValue(homeLayouts, homeFeedLayout));
}

function openSettings({ updateHistory = true } = {}) {
  saveScrollPosition();
  showView("settings");
  logQaEvent("settings", "打开设置");
  if (updateHistory) {
    history.pushState(
      { kind: "settings", sourceView: primaryView },
      "",
      "#settings",
    );
  }
}

function closeSettings() {
  if (history.state?.kind === "settings") history.back();
  else selectPrimaryView(primaryView);
}

function openQaLog({ updateHistory = true } = {}) {
  renderQaLog();
  showView("qa-log");
  logQaEvent("log", "打开调试日志");
  if (updateHistory) {
    const sourceView =
      history.state?.kind === "settings" || history.state?.kind === "qa-log"
        ? history.state.sourceView
        : primaryView;
    history.pushState({ kind: "qa-log", sourceView }, "", "#settings-log");
  }
}

function closeQaLog() {
  if (history.state?.kind === "qa-log") history.back();
  else openSettings({ updateHistory: false });
}

function closeDetail() {
  closeMediaFocus();
  logQaEvent(
    "detail",
    `关闭 ${detailRecord?.title || detailContentId || "详情"}`,
  );
  if (history.state?.kind === "detail") history.back();
  else selectPrimaryView(primaryView);
}

function retryDetail() {
  if (!detailContentId) return;
  openDetailById(detailContentId, {
    mediaIndex: detailMediaIndexValue,
    trigger: findContentTrigger(detailContentId),
    updateHistory: false,
  });
}

function findContentTrigger(contentId) {
  const activePagerPage = document.querySelector(
    `[data-view="${primaryView}"] [data-pager-page][aria-hidden="false"]`,
  );
  return (
    activePagerPage?.querySelector(`[data-content-id="${contentId}"]`) ??
    document.querySelector(`[data-content-id="${contentId}"]`)
  );
}

renderSelectedDataset();
preparePagers();
observePagerSizes();

function bindClicks(selector, handler) {
  document.querySelectorAll(selector).forEach((element) => {
    element.addEventListener("click", () => handler(element));
  });
}

bindClicks("[data-primary-view]", (button) => {
  if (
    navigationMinimized &&
    button.dataset.primaryView === primaryView &&
    button.classList.contains("is-active")
  ) {
    setNavigationMinimized(false);
    resetNavigationScrollTracking({ expand: false });
    return;
  }
  selectPrimaryView(button.dataset.primaryView, { animate: true });
});
bindClicks("[data-topbar-action]", (button) => {
  if (button.dataset.topbarAction === "profile") {
    selectPrimaryView("profile", { animate: false });
    return;
  }
  logQaEvent("profile", "顶部私信入口功能待接入");
});
bindClicks("[data-create-media]", () => handleReservedCreateAction("media"));
bindClicks("[data-create-tags]", () => handleReservedCreateAction("tags"));
bindClicks("[data-create-submit]", () => handleReservedCreateAction("submit"));
bindClicks("[data-profile-tab]", (button) => {
  selectProfileTab(button.dataset.profileTab);
});
bindClicks("[data-profile-action]", (button) => {
  handleProfileAction(button.dataset.profileAction);
});
createText?.addEventListener("focus", () => {
  logQaEvent("create", "composer focused");
});
bottomNavigation.addEventListener("click", onNavClickCapture, true);
bindClicks("[data-home-feed]", (button) =>
  selectHomeFeed(button.dataset.homeFeed, { animate: true }),
);
bindClicks("[data-calligraphy-category]", (button) =>
  selectCalligraphyCategory(button.dataset.calligraphyCategory, {
    animate: true,
  }),
);

pagerControllers.forEach((controller) => {
  controller.surface.addEventListener("pointerdown", (event) =>
    beginPagerGesture(event, controller),
  );
  controller.surface.addEventListener("pointerup", completePagerGesture);
  controller.surface.addEventListener("pointercancel", onPagerPointerCancel);
  controller.surface.addEventListener(
    "click",
    (event) => suppressSwipeClick(event, controller.surface),
    { capture: true },
  );
  controller.surface.addEventListener(
    "wheel",
    (event) => handlePagerWheel(event, controller),
    { passive: false },
  );
});

window.addEventListener("wheel", preventPcHistorySwipe, {
  capture: true,
  passive: false,
});

bindClicks("[data-open-settings]", () => openSettings());
bindClicks("[data-open-qa-log]", () => openQaLog());

document
  .querySelector("[data-settings-back]")
  .addEventListener("click", closeSettings);
document
  .querySelector("[data-qa-log-back]")
  ?.addEventListener("click", closeQaLog);
document
  .querySelector("[data-qa-log-clear]")
  ?.addEventListener("click", clearQaLog);
bindClicks("[data-qa-log-copy]", () => {
  copyQaLog();
});

bindClicks("[data-theme-toggle]", cycleThemePreference);
bindClicks("[data-layout-toggle]", cycleHomeFeedLayout);
bindClicks("[data-open-detail]", openDetail);

document
  .querySelector("[data-detail-back]")
  .addEventListener("click", closeDetail);

document.querySelectorAll("[data-detail-message-back]").forEach((button) => {
  button.addEventListener("click", closeDetail);
});
document.querySelectorAll("[data-detail-retry]").forEach((button) => {
  button.addEventListener("click", retryDetail);
});
detailImage?.addEventListener("error", onDetailImageError);
const hideBrokenSlide = (img) => {
  if (!img) return;
  img.hidden = true;
};
detailPrevImage?.addEventListener("error", () =>
  hideBrokenSlide(detailPrevImage),
);
detailNextImage?.addEventListener("error", () =>
  hideBrokenSlide(detailNextImage),
);
focusPrevImage?.addEventListener("error", () =>
  hideBrokenSlide(focusPrevImage),
);
focusNextImage?.addEventListener("error", () =>
  hideBrokenSlide(focusNextImage),
);
detailMediaOpen?.addEventListener("pointerdown", () => {
  mediaOpenSawPointer = true;
});
detailMediaOpen?.addEventListener("click", (event) => {
  const recentlyClosed =
    performance.now() - mediaFocusClosedAt < 400 && !mediaOpenSawPointer;
  if (mediaSwipeSuppressClick || recentlyClosed) {
    event.preventDefault();
    mediaSwipeSuppressClick = false;
    return;
  }
  mediaOpenSawPointer = false;
  openMediaFocus();
});
detailMediaPrev?.addEventListener("click", () => stepDetailMedia(-1));
detailMediaNext?.addEventListener("click", () => stepDetailMedia(1));
detailMediaDots?.addEventListener("click", onMediaDotClick);
detailMediaStage?.addEventListener("pointerdown", onDetailMediaPointerDown);
detailMediaStage?.addEventListener("pointermove", onDetailMediaPointerMove, {
  passive: false,
});
detailMediaStage?.addEventListener("pointerup", onDetailMediaPointerUp);
detailMediaStage?.addEventListener("pointercancel", onDetailMediaPointerUp);
detailMediaStage?.addEventListener("wheel", onDetailMediaWheel, {
  passive: false,
});
detailFocusPrev?.addEventListener("click", () => stepDetailMedia(-1));
detailFocusNext?.addEventListener("click", () => stepDetailMedia(1));
detailFocusDots?.addEventListener("click", onMediaDotClick);
detailFocusStage?.addEventListener("pointerdown", onFocusPointerDown);
detailFocusStage?.addEventListener("pointermove", onFocusPointerMove, {
  passive: false,
});
detailFocusStage?.addEventListener("pointerup", onFocusPointerUp);
detailFocusStage?.addEventListener("pointercancel", onFocusPointerUp);
detailFocus?.addEventListener("wheel", onFocusWheel, { passive: false });
detailFocus?.addEventListener(
  "gesturestart",
  (event) => {
    if (!detailFocusOpen) return;
    event.preventDefault();
  },
  { passive: false },
);
detailFocus?.addEventListener(
  "gesturechange",
  (event) => {
    if (!detailFocusOpen) return;
    event.preventDefault();
  },
  { passive: false },
);
detailFocusImage?.addEventListener("dragstart", (event) => {
  event.preventDefault();
});
detailFocusImage?.addEventListener("load", () => {
  if (!detailFocusOpen) return;
  layoutFocusImage();
  clampFocusPan();
  applyFocusTransform();
});
window.addEventListener("keydown", (event) => {
  if (detailView?.hidden) return;
  if (event.key === "Escape") {
    if (detailFocusOpen) {
      event.preventDefault();
      closeMediaFocus();
    }
    return;
  }
  if (event.target.closest?.("input, textarea")) return;
  if (detailMediaItems.length <= 1) return;
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    stepDetailMedia(-1);
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    stepDetailMedia(1);
  }
});

document
  .querySelector("[data-topic-back]")
  ?.addEventListener("click", closeTopicColumn);

searchInput.addEventListener("input", (event) => {
  filterInscriptions(event.currentTarget.value);
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  filterInscriptions("");
  searchInput.focus();
});

calligraphyFilterInput?.addEventListener("input", (event) => {
  calligraphyFilterQuery = event.currentTarget.value;
  filterCalligraphy();
});

calligraphyFilterClear?.addEventListener("click", () => {
  if (calligraphyFilterInput) calligraphyFilterInput.value = "";
  calligraphyFilterQuery = "";
  filterCalligraphy();
  calligraphyFilterInput?.focus();
});

window.addEventListener("hashchange", () => {
  if (!location.hash.startsWith("#detail-")) return;
  const contentId = decodeURIComponent(location.hash.slice("#detail-".length));
  if (!detailView?.hidden && detailContentId === contentId) return;
  openDetailById(contentId, {
    trigger: findContentTrigger(contentId),
    updateHistory: false,
  });
});

window.addEventListener("popstate", (event) => {
  if (detailFocusOpen) {
    closeMediaFocus();
    if (detailContentId) rememberDetailHistory(detailContentId);
    return;
  }
  const state = event.state;
  if (state?.kind === "qa-log") {
    if (navigationViews.includes(state.sourceView))
      primaryView = state.sourceView;
    updateBottomNavigation();
    renderQaLog();
    showView("qa-log");
    return;
  }
  if (state?.kind === "settings") {
    if (navigationViews.includes(state.sourceView))
      primaryView = state.sourceView;
    updateBottomNavigation();
    showView("settings");
    return;
  }
  if (state?.kind === "topic") {
    primaryView = "home";
    homeFeed = "topics";
    selectHomeFeed("topics");
    updateBottomNavigation();
    openTopicColumn(state.topicId, { updateHistory: false });
    return;
  }
  if (state?.kind === "detail") {
    if (navigationViews.includes(state.sourceView))
      primaryView = state.sourceView;
    updateBottomNavigation();
    const trigger = findContentTrigger(state.contentId);
    openDetailById(state.contentId, {
      mediaIndex: state.mediaIndex ?? 0,
      trigger,
      updateHistory: false,
    });
    return;
  }
  if (state?.kind === "primary" && navigationViews.includes(state.view)) {
    primaryView = state.view;
  }
  if (primaryView === "home") selectHomeFeed(homeFeed);
  showView(primaryView);
  const primary = primaryPager();
  if (primary && primaryViews.includes(primaryView)) syncPager(primary);
  updateBottomNavigation();
  restoreScrollPosition(primaryView);
});

function onPlatformQueryChange() {
  const previousPlatform = root.dataset.platform;
  const previousComposition = detailView?.dataset.detailComposition;
  syncPlatformAttribute();
  updateDetailComposition();
  syncBottomNavViewportInset();
  cancelActivePagerGesture({ animate: false });
  syncAllPagers();
  resetNavigationScrollTracking();
  const detailOpen = detailView && !detailView.hidden;
  if (!detailOpen) restoreScrollPosition(primaryView);
  if (detailFocusOpen) resetFocusTransform();
  recalculateLayout();
  if (
    root.dataset.platform !== previousPlatform ||
    detailView?.dataset.detailComposition !== previousComposition
  ) {
    logQaEvent(
      "platform",
      `${root.dataset.platform} ${detailView?.dataset.detailComposition ?? ""} ${window.innerWidth}×${window.innerHeight}`,
    );
  }
}

window.addEventListener(
  "yoyi:beforeplatformchange",
  onBeforePlatformQueryChange,
);
window.addEventListener("yoyi:platformchange", onPlatformQueryChange);
function onNavGeometryChange() {
  tabStrips.forEach((strip) => {
    if (strip.kind === "bottom" && (navDragging || navigationMinimized)) return;
    if (strip.container?.classList.contains("is-bubble-following")) return;
    if (strip.container?.classList.contains("is-dragging-nav")) return;
    syncTabStrip(strip);
  });
}

function pagerObservedWidthChanged(entries) {
  let changed = false;
  entries.forEach((entry) => {
    const width = entry.contentRect?.width;
    if (!Number.isFinite(width)) {
      changed = true;
      return;
    }
    const previous = pagerObservedWidths.get(entry.target);
    pagerObservedWidths.set(entry.target, width);
    if (
      previous != null &&
      Math.abs(width - previous) > pagerViewportWidthTolerance
    ) {
      changed = true;
    }
  });
  return changed;
}

function syncBottomNavViewportInset() {
  if (!bottomNavigation) return;
  if (root.dataset.platform === "pc") {
    bottomNavigation.style.removeProperty("--app-bottom-nav-viewport-inset");
    root.style.removeProperty("--app-bottom-nav-viewport-inset");
    return;
  }
  const viewport = window.visualViewport;
  if (!viewport) {
    bottomNavigation.style.removeProperty("--app-bottom-nav-viewport-inset");
    root.style.removeProperty("--app-bottom-nav-viewport-inset");
    return;
  }
  const inset = Math.max(
    0,
    window.innerHeight - viewport.height - viewport.offsetTop,
  );
  const value = `${inset}px`;
  bottomNavigation.style.setProperty("--app-bottom-nav-viewport-inset", value);
  root.style.setProperty("--app-bottom-nav-viewport-inset", value);
}

function onWindowSizeChange() {
  if (pagerGestureIsLive()) return;
  if (
    Math.abs(window.innerWidth - lastPagerWindowWidth) <=
    pagerViewportWidthTolerance
  ) {
    return;
  }
  onPagerViewportChange();
}

function onPagerViewportChange() {
  lastPagerWindowWidth = window.innerWidth;
  saveScrollPosition();
  updateDetailComposition();
  syncBottomNavViewportInset();
  onNavGeometryChange();
  cancelActivePagerGesture({ animate: false });
  pagerControllers.forEach((controller) => cancelPagerSpring(controller));
  pagerViewportSyncFramesElapsed = 0;
  pagerViewportStableFrames = 0;
  pagerViewportPreviousWidths = [];
  if (pagerViewportSyncAnimationId) return;

  const syncUntilViewportSettles = () => {
    const widths = [...pagerControllers.values()].map((controller) =>
      pagerWidth(controller),
    );
    syncAllPagers();
    const stable =
      widths.length === pagerViewportPreviousWidths.length &&
      widths.every(
        (width, index) =>
          Math.abs(width - pagerViewportPreviousWidths[index]) <=
          pagerViewportWidthTolerance,
      );
    pagerViewportStableFrames = stable ? pagerViewportStableFrames + 1 : 0;
    pagerViewportPreviousWidths = widths;
    pagerViewportSyncFramesElapsed += 1;
    const dimensionsSettled =
      pagerViewportStableFrames >= pagerViewportStableFrameTarget;
    const reachedLimit =
      pagerViewportSyncFramesElapsed >= pagerViewportSyncMaxFrames;
    if (dimensionsSettled || reachedLimit) {
      pagerViewportSyncAnimationId = 0;
      restoreScrollPosition(primaryView);
      onNavGeometryChange();
      recalculateLayout();
      if (detailFocusOpen) {
        resetFocusTransform();
        resetCarouselX(detailFocusTrack);
        layoutFocusImage();
        const detailScroll = document.querySelector(
          '[data-scroll-view="detail"]',
        );
        if (detailScroll) detailScroll.scrollTop = focusScrollTop;
        if (isPcFocusPlatform()) window.scrollTo(0, focusWindowScroll);
      }
      return;
    }
    pagerViewportSyncAnimationId = requestAnimationFrame(
      syncUntilViewportSettles,
    );
  };

  pagerViewportSyncAnimationId = requestAnimationFrame(
    syncUntilViewportSettles,
  );
}

function observePagerSizes() {
  if (typeof window.ResizeObserver !== "function") return;
  pagerResizeObserver = new window.ResizeObserver((entries) => {
    if (pagerGestureIsLive()) return;
    if (entries.length > 0 && !pagerObservedWidthChanged(entries)) return;
    onPagerViewportChange();
  });
  pagerControllers.forEach((controller) => {
    pagerResizeObserver.observe(controller.surface);
  });
}
window.addEventListener("resize", onWindowSizeChange);
window.addEventListener("orientationchange", onPagerViewportChange);
window.visualViewport?.addEventListener("resize", () => {
  syncBottomNavViewportInset();
  onWindowSizeChange();
});
window.visualViewport?.addEventListener("scroll", syncBottomNavViewportInset, {
  passive: true,
});
document.addEventListener("scroll", onNavigationScroll, true);
document.querySelectorAll("[data-scroll-key]").forEach((scrollElement) => {
  scrollElement.addEventListener(
    "scroll",
    () => {
      if (root.dataset.platform !== "pc") {
        rememberScrollPosition(
          scrollElement.dataset.scrollKey,
          scrollElement.scrollTop,
        );
      }
    },
    { passive: true },
  );
});
document.querySelector('[data-scroll-view="inscriptions"]')?.addEventListener(
  "scroll",
  (event) => {
    if (root.dataset.platform === "pc") return;
    rememberScrollPosition("inscriptions", event.currentTarget.scrollTop);
  },
  { passive: true },
);
window.addEventListener(
  "scroll",
  () => {
    if (
      root.dataset.platform === "pc" &&
      navigationViews.includes(primaryView)
    ) {
      rememberScrollPosition(
        scrollKeyForView(primaryView),
        (document.scrollingElement ?? document.documentElement).scrollTop,
      );
    }
  },
  { passive: true },
);
syncPlatformAttribute();
updateDetailComposition();
logQaEvent(
  "boot",
  `${root.dataset.platform} ${detailView?.dataset.detailComposition ?? ""} ${window.innerWidth}×${window.innerHeight}`,
);

const bootHash = location.hash;
history.replaceState(
  { kind: "primary", view: "home" },
  "",
  `${location.pathname}${location.search}`,
);
renderTopicsFeed();
selectHomeFeed(homeFeed);
selectCalligraphyCategory(calligraphyCategory);
filterInscriptions("");
filterCalligraphy();
applyThemePreference(themePreference, { persist: false });
applyHomeFeedLayout(homeFeedLayout, { persist: false });
window
  .matchMedia?.("(prefers-color-scheme: dark)")
  ?.addEventListener?.("change", (event) => {
    if (themePreference !== "system") return;
    logQaEvent("theme", `系统主题 ${event.matches ? "深色" : "浅色"}`);
  });
resetNavigationScrollTracking();
syncBottomNavViewportInset();

const bootDetailId = bootHash.startsWith("#detail-")
  ? decodeURIComponent(bootHash.slice("#detail-".length))
  : "";
if (bootHash === "#settings-log") {
  openSettings();
  openQaLog();
} else if (bootHash === "#settings") {
  openSettings();
} else if (bootDetailId) {
  openDetailById(bootDetailId, {
    trigger: findContentTrigger(bootDetailId),
  });
}

window.setTimeout(() => {
  document.querySelector("[data-loading-screen]").hidden = true;
  app.dataset.ready = "true";
}, 720);
