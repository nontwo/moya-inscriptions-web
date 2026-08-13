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

const root = document.documentElement;
const app = document.querySelector("[data-mobile-app]");
const bottomNavigation = document.querySelector("[data-bottom-navigation]");
const detailImage = document.querySelector("[data-detail-image]");
const detailTitle = document.querySelector("[data-detail-title]");
const searchInput = document.querySelector("[data-inscription-search]");
const searchClear = document.querySelector("[data-search-clear]");
const calligraphyFilterInput = document.querySelector(
  "[data-calligraphy-filter]",
);
const calligraphyFilterClear = document.querySelector(
  "[data-calligraphy-filter-clear]",
);
const topicsGrid = document.querySelector("[data-topics-grid]");
const topicColumnBody = document.querySelector("[data-topic-column-body]");
const topicColumnHeading = document.querySelector(
  "[data-topic-column-heading]",
);

const themePreferenceKey = "yoyi.theme-preference";
const homeLayoutKey = "yoyi.home-feed-layout";
const themePreferences = ["system", "light", "dark"];
const homeLayouts = ["single", "double"];
const primaryViews = ["home", "inscriptions", "calligraphy"];
const homeFeeds = ["discover", "nearby", "topics"];
const calligraphyCategories = ["all", "ink", "rubbing"];
const platformRuntime = globalThis.YOYI_DEVICE_PLATFORM;
const pagerAxisLockDistance = 8;
const pagerEdgeResistance = 0.25;
const pagerSpringMass = 1;
const pagerSpringStiffness = 360;
const pagerSpringDamping = 38;
const pagerSpringStepSeconds = 0.008;
const pagerSpringMaxFrameSeconds = 0.032;
const pagerSpringPositionTolerance = 0.5;
const pagerSpringVelocityTolerance = 10;
const pagerSpringMaxDurationSeconds = 0.52;
const pagerVelocityWindowMs = 100;
const pagerFlickMinimumVelocity = 0.45;
const pagerFlickMinimumDistanceRatio = 0.12;
const pagerMaximumVelocity = 2.4;
const pagerViewportStableFrameTarget = 3;
const pagerViewportSyncMaxFrames = 60;
const pagerViewportWidthTolerance = 0.5;
const swipeClickSuppressionWindow = 400;
const pagerWheelIdleMs = 120;
const pagerControllers = new Map();

const scrollPositions = {
  "home:discover": 0,
  "home:nearby": 0,
  "home:topics": 0,
  inscriptions: 0,
  "calligraphy:all": 0,
  "calligraphy:ink": 0,
  "calligraphy:rubbing": 0,
};

function syncPlatformAttribute() {
  if (platformRuntime) {
    const { deviceClass, platform } = platformRuntime.sync();
    bottomNavigation.dataset.minimizeBehavior =
      deviceClass === "phone" ? "on-scroll-down" : "never";
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
  bottomNavigation.dataset.minimizeBehavior = "never";
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
let navigationMinimized = false;
let navigationLastScrollTop = 0;
let navigationDirection = "";
let navigationDirectionalTravel = 0;

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
  if (platform === "pc" && view !== "inscriptions") {
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

function fillDetailContent(trigger) {
  const image = trigger.dataset.image;
  const title = trigger.dataset.title;
  const alt = trigger.querySelector("img")?.alt ?? "";

  detailImage.src = image;
  detailImage.alt = alt;
  detailTitle.textContent = title;
}

function showView(view) {
  document.querySelectorAll("[data-view]").forEach((panel) => {
    panel.hidden = panel.dataset.view !== view;
  });
  bottomNavigation.hidden = !primaryViews.includes(view);
  if (!primaryViews.includes(view)) setNavigationMinimized(false);
}

function renderSupplementalHomeCards() {
  for (const feed of ["discover", "nearby"]) {
    const panel = document.querySelector(`[data-feed-grid="${feed}"]`);
    const cards = supplementalHomeCards[feed] ?? [];
    if (!panel || !Array.isArray(cards)) continue;
    cards.forEach((card) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "app-card";
      button.dataset.contentId = card.id;
      button.dataset.openDetail = "";
      button.dataset.image = card.image;
      button.dataset.title = card.title;

      const image = document.createElement("img");
      image.src = card.image;
      image.alt = card.alt;
      const title = document.createElement("span");
      title.className = "app-card__title";
      title.textContent = card.title;
      button.append(image, title);
      panel.append(button);
    });
  }
}

function renderTopicsFeed() {
  if (!topicsGrid) return;
  topicsGrid.replaceChildren();
  editorialTopics.forEach((topic) => {
    if (topic.kind !== "editorialTopic") return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "app-topic-card";
    button.dataset.openTopic = topic.id;
    button.dataset.kind = topic.kind;
    button.dataset.contentId = topic.id;
    button.innerHTML = `
      <img src="${topic.cover}" alt="${topic.coverAlt}" />
      <span class="app-topic-card__body">
        <span class="app-topic-card__badge">专题/策展</span>
        <span class="app-topic-card__title">${topic.title}</span>
        <span class="app-topic-card__blurb">${topic.blurb}</span>
      </span>
    `;
    button.addEventListener("click", () => openTopicColumn(topic.id));
    topicsGrid.append(button);
  });
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
  const topic = findEditorialTopic(topicId);
  if (!topic || topic.kind !== "editorialTopic") return;
  saveScrollPosition();
  if (topicColumnHeading) topicColumnHeading.textContent = topic.title;
  if (topicColumnBody) {
    topicColumnBody.replaceChildren();
    const title = document.createElement("h1");
    title.textContent = topic.title;
    topicColumnBody.append(title);
    const badge = document.createElement("p");
    badge.className = "app-topic-card__badge";
    badge.textContent = "专题/策展";
    topicColumnBody.append(badge);
    topic.blocks.forEach((block) => {
      topicColumnBody.append(renderTopicBlock(block));
    });
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
}

function phoneNavigationCanMinimize() {
  return (
    root.dataset.deviceClass === "phone" &&
    root.dataset.platform === "phone" &&
    primaryViews.includes(primaryView) &&
    !bottomNavigation.hidden
  );
}

function setNavigationMinimized(minimized) {
  navigationMinimized = phoneNavigationCanMinimize() && minimized;
  bottomNavigation.classList.toggle("is-minimized", navigationMinimized);
  if (navigationMinimized) bottomNavigation.dataset.minimized = "true";
  else bottomNavigation.removeAttribute("data-minimized");
}

function resetNavigationScrollTracking({ expand = true } = {}) {
  const scrollElement = currentScrollElement();
  navigationLastScrollTop = scrollElement?.scrollTop ?? 0;
  navigationDirection = "";
  navigationDirectionalTravel = 0;
  if (expand || !phoneNavigationCanMinimize()) setNavigationMinimized(false);
}

function onNavigationScroll(event) {
  if (!phoneNavigationCanMinimize()) {
    setNavigationMinimized(false);
    return;
  }
  const scrollElement = currentScrollElement();
  if (!scrollElement || event.target !== scrollElement) return;
  const scrollTop = scrollElement.scrollTop;
  const delta = scrollTop - navigationLastScrollTop;
  navigationLastScrollTop = scrollTop;

  if (scrollTop <= 8) {
    resetNavigationScrollTracking();
    return;
  }
  if (delta === 0) return;

  const direction = delta > 0 ? "down" : "up";
  if (direction !== navigationDirection) {
    navigationDirection = direction;
    navigationDirectionalTravel = 0;
  }
  navigationDirectionalTravel += Math.abs(delta);

  if (direction === "down" && navigationDirectionalTravel >= 12) {
    setNavigationMinimized(true);
    navigationDirectionalTravel = 0;
  } else if (direction === "up" && navigationDirectionalTravel >= 8) {
    setNavigationMinimized(false);
    navigationDirectionalTravel = 0;
  }
}

function selectPrimaryView(view, { updateHistory = true } = {}) {
  saveScrollPosition();
  primaryView = view;
  showView(view);
  updateBottomNavigation();
  restoreScrollPosition(view);
  resetNavigationScrollTracking();
  if (updateHistory) {
    history.replaceState({ kind: "primary", view }, "", location.pathname);
  }
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

function isPagerFollowing(controller) {
  return controller.surface.classList.contains("is-pager-following");
}

function beginPcPagerFollow(controller) {
  if (isPagerFollowing(controller)) return;
  const activeIndex = controller.values.indexOf(controller.current());
  controller.surface.classList.add("is-pager-following");
  setPagerPageState(controller, activeIndex, true);
  setPagerOffset(controller, -activeIndex * pagerWidth(controller));
}

function endPcPagerFollow(controller) {
  controller.surface.classList.remove("is-pager-following");
  controller.track.classList.remove("is-dragging");
  syncPager(controller);
}

function clearPagerWheelIdleTimer() {
  if (!pagerWheelIdleTimer) return;
  window.clearTimeout(pagerWheelIdleTimer);
  pagerWheelIdleTimer = 0;
}

function completePcWheelGesture() {
  const gesture = activeWheelGesture;
  if (!gesture) return;
  activeWheelGesture = null;
  clearPagerWheelIdleTimer();
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

function handlePagerWheel(event, controller) {
  if (!pcWheelPagerEnabled() || event.ctrlKey) return;
  if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;

  event.preventDefault();

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
      dragX: 0,
      startIndex,
      startOffset: controller.currentOffset ?? -startIndex * width,
      samples: [{ time: pagerEventTime(event), x: 0 }],
      width,
    };
    controller.track.classList.add("is-dragging");
  }

  const gesture = activeWheelGesture;
  gesture.accumulatedX += event.deltaX;
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
}

function setPagerPageState(controller, activeIndex, touchMode) {
  controller.pages.forEach((page, index) => {
    const selected = index === activeIndex;
    page.hidden = touchMode ? false : !selected;
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
  if (!touchPagerEnabled() && isPagerFollowing(controller)) {
    endPcPagerFollow(controller);
  }
}

function startPagerSpring(controller, targetOffset, initialVelocity = 0) {
  cancelPagerSpring(controller);
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
  cancelPagerSpring(controller);
  controller.track.classList.remove("is-dragging");
  setPagerPageState(controller, activeIndex, touchMode || following);
  if (!touchMode && !following) {
    controller.currentOffset = -activeIndex * pagerWidth(controller);
    controller.track.style.removeProperty("transform");
    return;
  }
  const targetOffset = -activeIndex * pagerWidth(controller);
  if (animate) {
    startPagerSpring(controller, targetOffset, velocity);
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
    track.querySelector(`[data-pager-page="${value}"]`),
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
  if (controller) syncPager(controller, { animate, velocity });
  else {
    document.querySelectorAll("[data-feed-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.feedPanel !== value;
    });
  }
  if (changed && primaryView === "home") restoreScrollPosition("home");
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
  if (controller) syncPager(controller, { animate, velocity });
  if (changed && primaryView === "calligraphy") {
    restoreScrollPosition("calligraphy");
  }
}

function cancelActivePagerGesture({ animate = true } = {}) {
  if (!activePagerGesture) return;
  const { controller, pointerId } = activePagerGesture;
  try {
    if (controller.surface.hasPointerCapture?.(pointerId)) {
      controller.surface.releasePointerCapture(pointerId);
    }
  } catch {
    // Pointer capture can disappear when the browser cancels the gesture.
  }
  activePagerGesture = null;
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

function beginPagerGesture(event, controller) {
  if (!touchPagerEnabled() || event.pointerType !== "touch") return;
  if (!event.isPrimary || activePagerGesture) {
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
}

function movePagerGesture(event) {
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
      return;
    }
    gesture.axis = "horizontal";
    gesture.controller.track.classList.add("is-dragging");
    try {
      gesture.controller.surface.setPointerCapture?.(gesture.pointerId);
    } catch {
      // Some embedded browsers expose pointer capture before fully supporting it.
    }
  }
  event.preventDefault();
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
  if (
    !gesture ||
    gesture.pointerId !== event.pointerId ||
    event.pointerType !== "touch"
  ) {
    return;
  }
  activePagerGesture = null;
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
}

function applyThemePreference(value, { persist = true } = {}) {
  themePreference = themePreferences.includes(value) ? value : "system";
  if (themePreference === "system") root.removeAttribute("data-theme");
  else root.dataset.theme = themePreference;
  document.querySelectorAll("[data-theme-option]").forEach((option) => {
    option.checked = option.value === themePreference;
  });
  if (persist) persistPreference(themePreferenceKey, themePreference);
}

function applyHomeFeedLayout(value, { persist = true } = {}) {
  homeFeedLayout = homeLayouts.includes(value) ? value : "double";
  root.dataset.homeLayout = homeFeedLayout;
  document.querySelectorAll("[data-layout-option]").forEach((option) => {
    option.checked = option.value === homeFeedLayout;
  });
  if (persist) persistPreference(homeLayoutKey, homeFeedLayout);
}

function openSettings({ updateHistory = true } = {}) {
  saveScrollPosition();
  showView("settings");
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

function openDetail(trigger, { updateHistory = true } = {}) {
  saveScrollPosition();
  fillDetailContent(trigger);
  showView("detail");
  document.querySelector('[data-scroll-view="detail"]').scrollTop = 0;

  if (updateHistory) {
    history.pushState(
      {
        kind: "detail",
        contentId: trigger.dataset.contentId,
        sourceView: primaryView,
      },
      "",
      `#detail-${trigger.dataset.contentId}`,
    );
  }
}

function closeDetail() {
  if (history.state?.kind === "detail") history.back();
  else selectPrimaryView(primaryView);
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

renderSupplementalHomeCards();
preparePagers();
observePagerSizes();

function bindClicks(selector, handler) {
  document.querySelectorAll(selector).forEach((element) => {
    element.addEventListener("click", () => handler(element));
  });
}

function bindCheckedOptions(selector, apply) {
  document.querySelectorAll(selector).forEach((option) => {
    option.addEventListener("change", (event) => {
      if (event.currentTarget.checked) apply(event.currentTarget.value);
    });
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
  selectPrimaryView(button.dataset.primaryView);
});
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
  controller.surface.addEventListener("pointermove", movePagerGesture, {
    passive: false,
  });
  controller.surface.addEventListener("pointerup", completePagerGesture);
  controller.surface.addEventListener("pointercancel", () =>
    cancelActivePagerGesture(),
  );
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

bindClicks("[data-open-settings]", () => openSettings());

document
  .querySelector("[data-settings-back]")
  .addEventListener("click", closeSettings);

bindCheckedOptions("[data-theme-option]", applyThemePreference);
bindCheckedOptions("[data-layout-option]", applyHomeFeedLayout);
bindClicks("[data-open-detail]", openDetail);

document
  .querySelector("[data-detail-back]")
  .addEventListener("click", closeDetail);

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

window.addEventListener("popstate", (event) => {
  const state = event.state;
  if (state?.kind === "settings") {
    if (primaryViews.includes(state.sourceView)) primaryView = state.sourceView;
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
    if (primaryViews.includes(state.sourceView)) primaryView = state.sourceView;
    updateBottomNavigation();
    const trigger = findContentTrigger(state.contentId);
    if (trigger) openDetail(trigger, { updateHistory: false });
    return;
  }
  if (state?.kind === "primary" && primaryViews.includes(state.view)) {
    primaryView = state.view;
  }
  if (primaryView === "home") selectHomeFeed(homeFeed);
  showView(primaryView);
  updateBottomNavigation();
  restoreScrollPosition(primaryView);
});

function onPlatformQueryChange() {
  syncPlatformAttribute();
  cancelActivePagerGesture({ animate: false });
  syncAllPagers();
  resetNavigationScrollTracking();
  restoreScrollPosition(primaryView);
}

window.addEventListener(
  "yoyi:beforeplatformchange",
  onBeforePlatformQueryChange,
);
window.addEventListener("yoyi:platformchange", onPlatformQueryChange);
function onPagerViewportChange() {
  saveScrollPosition();
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
  pagerResizeObserver = new window.ResizeObserver(() => {
    onPagerViewportChange();
  });
  pagerControllers.forEach((controller) => {
    pagerResizeObserver.observe(controller.surface);
  });
}
window.addEventListener("resize", onPagerViewportChange);
window.addEventListener("orientationchange", onPagerViewportChange);
window.visualViewport?.addEventListener("resize", onPagerViewportChange);
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
document
  .querySelector('[data-scroll-view="inscriptions"]')
  ?.addEventListener(
    "scroll",
    (event) =>
      rememberScrollPosition("inscriptions", event.currentTarget.scrollTop),
    { passive: true },
  );
window.addEventListener(
  "scroll",
  () => {
    if (root.dataset.platform === "pc" && primaryView !== "inscriptions") {
      rememberScrollPosition(
        scrollKeyForView(primaryView),
        (document.scrollingElement ?? document.documentElement).scrollTop,
      );
    }
  },
  { passive: true },
);
syncPlatformAttribute();

history.replaceState({ kind: "primary", view: "home" }, "", location.pathname);
renderTopicsFeed();
selectHomeFeed(homeFeed);
selectCalligraphyCategory(calligraphyCategory);
filterInscriptions("");
applyThemePreference(themePreference, { persist: false });
applyHomeFeedLayout(homeFeedLayout, { persist: false });
resetNavigationScrollTracking();

window.setTimeout(() => {
  document.querySelector("[data-loading-screen]").hidden = true;
  app.dataset.ready = "true";
}, 720);
