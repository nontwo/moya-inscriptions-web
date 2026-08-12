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
const inscriptionPreview = document.querySelector("[data-inscription-preview]");
const inscriptionPreviewImage = document.querySelector(
  "[data-inscription-preview-image]",
);
const inscriptionPreviewTitle = document.querySelector(
  "[data-inscription-preview-title]",
);
const inscriptionPreviewEmpty = document.querySelector(
  "[data-inscription-preview-empty]",
);
const inscriptionPreviewContent = document.querySelector(
  "[data-inscription-preview-content]",
);
const inscriptionPreviewMeta = document.querySelector(
  "[data-inscription-preview-meta]",
);
const inscriptionPreviewFeatured = document.querySelector(
  "[data-inscription-preview-featured]",
);
const inscriptionPreviewSummary = document.querySelector(
  "[data-inscription-preview-summary]",
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
const pagerViewportSyncFrameLimit = 6;
const swipeClickSuppressionWindow = 400;
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
  if (platformRuntime) return platformRuntime.sync().platform;
  const platform =
    window.innerWidth < 768
      ? "phone"
      : window.innerWidth < 896
        ? "tablet"
        : "pc";
  root.dataset.deviceClass = "desktop";
  root.dataset.platform = platform;
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
let inscriptionsSplitOpen = false;
let activePagerGesture = null;
let pagerViewportSyncAnimationId = 0;
let pagerViewportSyncFramesRemaining = 0;

function usesInscriptionsSplit() {
  return root.dataset.platform === "pc" && primaryView === "inscriptions";
}

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
  requestAnimationFrame(() => {
    const scrollElement = scrollElementFor(
      view,
      root.dataset.platform,
      scrollKey,
    );
    if (scrollElement)
      scrollElement.scrollTop = scrollPositions[scrollKey] ?? 0;
  });
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

function clearInscriptionSelection() {
  document
    .querySelectorAll("[data-view='inscriptions'] [data-open-detail]")
    .forEach((item) => {
      item.classList.remove("is-selected");
      item.removeAttribute("aria-current");
    });
}

function setInscriptionSelection(trigger) {
  clearInscriptionSelection();
  if (!trigger) return;
  trigger.classList.add("is-selected");
  trigger.setAttribute("aria-current", "true");
}

function setPreviewTab(tabId) {
  document.querySelectorAll("[data-preview-tab]").forEach((tab) => {
    const selected = tab.dataset.previewTab === tabId;
    tab.classList.toggle("is-selected", selected);
    tab.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll("[data-preview-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.previewPanel !== tabId;
  });
}

function showPreviewEmpty() {
  if (inscriptionPreviewEmpty) inscriptionPreviewEmpty.hidden = false;
  if (inscriptionPreviewContent) inscriptionPreviewContent.hidden = true;
}

function showPreviewContent() {
  if (inscriptionPreviewEmpty) inscriptionPreviewEmpty.hidden = true;
  if (inscriptionPreviewContent) inscriptionPreviewContent.hidden = false;
}

function syncDesktopPreviewPane() {
  if (!inscriptionPreview) return;
  if (root.dataset.platform === "pc" && primaryView === "inscriptions") {
    inscriptionPreview.hidden = false;
    if (!inscriptionsSplitOpen) showPreviewEmpty();
  } else if (!inscriptionsSplitOpen) {
    inscriptionPreview.hidden = true;
    showPreviewEmpty();
  }
}

function fillDetailContent(trigger) {
  const image = trigger.dataset.image;
  const title = trigger.dataset.title;
  const alt = trigger.querySelector("img")?.alt ?? "";
  const meta = [trigger.dataset.meta, trigger.dataset.location]
    .filter(Boolean)
    .join(" · ");
  const summary = trigger.dataset.summary ?? "";
  const featured = trigger.dataset.featured === "true";

  detailImage.src = image;
  detailImage.alt = alt;
  detailTitle.textContent = title;
  inscriptionPreviewImage.src = image;
  inscriptionPreviewImage.alt = alt;
  inscriptionPreviewTitle.textContent = title;
  if (inscriptionPreviewMeta) inscriptionPreviewMeta.textContent = meta;
  if (inscriptionPreviewSummary) {
    inscriptionPreviewSummary.textContent = summary;
  }
  if (inscriptionPreviewFeatured) {
    inscriptionPreviewFeatured.hidden = !featured;
  }
  setPreviewTab("intro");
  showPreviewContent();
}

function closeInscriptionsSplit() {
  inscriptionsSplitOpen = false;
  app.removeAttribute("data-inscriptions-split");
  clearInscriptionSelection();
  showPreviewEmpty();
  syncDesktopPreviewPane();
}

function showView(view) {
  if (view !== "detail" && view !== "inscriptions" && view !== "topic-column") {
    closeInscriptionsSplit();
  }
  if (view === "inscriptions" && !inscriptionsSplitOpen) {
    closeInscriptionsSplit();
  }
  document.querySelectorAll("[data-view]").forEach((panel) => {
    panel.hidden = panel.dataset.view !== view;
  });
  bottomNavigation.hidden = !primaryViews.includes(view);
  if (view === "inscriptions") syncDesktopPreviewPane();
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

function selectPrimaryView(view, { updateHistory = true } = {}) {
  saveScrollPosition();
  closeInscriptionsSplit();
  primaryView = view;
  showView(view);
  updateBottomNavigation();
  restoreScrollPosition(view);
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

function pagerWidth(controller) {
  return (
    controller.surface.getBoundingClientRect().width ||
    controller.surface.clientWidth ||
    window.innerWidth ||
    1
  );
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

function startPagerSpring(controller, targetOffset, initialVelocity = 0) {
  cancelPagerSpring(controller);
  if (prefersReducedPagerMotion()) {
    setPagerOffset(controller, targetOffset);
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
      controller.animationId = 0;
      controller.track.classList.remove("is-settling");
      return;
    }
    controller.animationId = window.requestAnimationFrame(advanceSpring);
  };

  controller.animationId = window.requestAnimationFrame(advanceSpring);
}

function syncPager(controller, { animate = false, velocity = 0 } = {}) {
  const activeIndex = controller.values.indexOf(controller.current());
  const touchMode = touchPagerEnabled();
  cancelPagerSpring(controller);
  controller.track.classList.remove("is-dragging");
  setPagerPageState(controller, activeIndex, touchMode);
  if (!touchMode) {
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

function addPagerVelocitySample(gesture, event) {
  const time = pagerEventTime(event);
  gesture.samples.push({ time, x: event.clientX });
  const minimumTime = time - pagerVelocityWindowMs;
  while (gesture.samples.length > 2 && gesture.samples[1].time < minimumTime) {
    gesture.samples.shift();
  }
}

function pagerReleaseVelocity(gesture, event) {
  addPagerVelocitySample(gesture, event);
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
  const velocity = pagerReleaseVelocity(gesture, event);
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
  closeInscriptionsSplit();
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

  if (usesInscriptionsSplit()) {
    inscriptionsSplitOpen = true;
    app.dataset.inscriptionsSplit = "true";
    setInscriptionSelection(trigger);
    if (inscriptionPreview) inscriptionPreview.hidden = false;
    document.querySelectorAll("[data-view]").forEach((panel) => {
      panel.hidden = panel.dataset.view !== "inscriptions";
    });
    bottomNavigation.hidden = false;
  } else {
    closeInscriptionsSplit();
    showView("detail");
    document.querySelector('[data-scroll-view="detail"]').scrollTop = 0;
  }

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
  else {
    closeInscriptionsSplit();
    selectPrimaryView(primaryView);
  }
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

preparePagers();

document.querySelectorAll("[data-primary-view]").forEach((button) => {
  button.addEventListener("click", () => {
    selectPrimaryView(button.dataset.primaryView);
  });
});

document.querySelectorAll("[data-home-feed]").forEach((button) => {
  button.addEventListener("click", () =>
    selectHomeFeed(button.dataset.homeFeed, { animate: true }),
  );
});

document.querySelectorAll("[data-calligraphy-category]").forEach((button) => {
  button.addEventListener("click", () =>
    selectCalligraphyCategory(button.dataset.calligraphyCategory, {
      animate: true,
    }),
  );
});

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
});

document.querySelectorAll("[data-open-settings]").forEach((button) => {
  button.addEventListener("click", () => openSettings());
});

document
  .querySelector("[data-settings-back]")
  .addEventListener("click", closeSettings);

document.querySelectorAll("[data-theme-option]").forEach((option) => {
  option.addEventListener("change", (event) => {
    if (event.currentTarget.checked) {
      applyThemePreference(event.currentTarget.value);
    }
  });
});

document.querySelectorAll("[data-layout-option]").forEach((option) => {
  option.addEventListener("change", (event) => {
    if (event.currentTarget.checked) {
      applyHomeFeedLayout(event.currentTarget.value);
    }
  });
});

document.querySelectorAll("[data-open-detail]").forEach((trigger) => {
  trigger.addEventListener("click", () => openDetail(trigger));
});

document
  .querySelector("[data-detail-back]")
  .addEventListener("click", closeDetail);

document
  .querySelector("[data-inscription-preview-back]")
  ?.addEventListener("click", closeDetail);

document
  .querySelector("[data-topic-back]")
  ?.addEventListener("click", closeTopicColumn);

document.querySelectorAll("[data-shell-control]").forEach((control) => {
  control.addEventListener("click", (event) => {
    event.preventDefault();
  });
});

document.querySelectorAll("[data-preview-tab]").forEach((tab) => {
  tab.addEventListener("click", () => setPreviewTab(tab.dataset.previewTab));
});

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
    closeInscriptionsSplit();
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
  closeInscriptionsSplit();
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
  if (root.dataset.platform !== "pc" && inscriptionsSplitOpen) {
    const selected = document.querySelector(
      "[data-view='inscriptions'] [data-open-detail].is-selected",
    );
    closeInscriptionsSplit();
    if (selected && history.state?.kind === "detail") {
      showView("detail");
      fillDetailContent(selected);
    }
    restoreScrollPosition(primaryView);
    return;
  }
  syncDesktopPreviewPane();
  if (
    root.dataset.platform === "pc" &&
    primaryView === "inscriptions" &&
    history.state?.kind === "detail"
  ) {
    const trigger = findContentTrigger(history.state.contentId);
    if (trigger) openDetail(trigger, { updateHistory: false });
  }
  restoreScrollPosition(primaryView);
}

window.addEventListener(
  "yoyi:beforeplatformchange",
  onBeforePlatformQueryChange,
);
window.addEventListener("yoyi:platformchange", onPlatformQueryChange);
function onPagerViewportChange() {
  cancelActivePagerGesture({ animate: false });
  pagerControllers.forEach((controller) => cancelPagerSpring(controller));
  pagerViewportSyncFramesRemaining = pagerViewportSyncFrameLimit;
  if (pagerViewportSyncAnimationId) return;

  const syncUntilViewportSettles = () => {
    syncAllPagers();
    pagerViewportSyncFramesRemaining -= 1;
    if (pagerViewportSyncFramesRemaining <= 0) {
      pagerViewportSyncAnimationId = 0;
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
window.addEventListener("resize", onPagerViewportChange);
window.addEventListener("orientationchange", onPagerViewportChange);
window.visualViewport?.addEventListener("resize", onPagerViewportChange);
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
showPreviewEmpty();

window.setTimeout(() => {
  document.querySelector("[data-loading-screen]").hidden = true;
  app.dataset.ready = "true";
}, 720);
