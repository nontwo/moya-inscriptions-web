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
const calligraphyFilterEmpty = document.querySelector(
  "[data-calligraphy-filter-empty]",
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
const platformRuntime = globalThis.YOYI_DEVICE_PLATFORM;

const scrollPositions = {
  home: 0,
  inscriptions: 0,
  calligraphy: 0,
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

function usesInscriptionsSplit() {
  return root.dataset.platform === "pc" && primaryView === "inscriptions";
}

function currentScrollElement() {
  return document.querySelector(`[data-scroll-view="${primaryView}"]`);
}

function saveScrollPosition() {
  const scrollElement = currentScrollElement();
  if (scrollElement && primaryView in scrollPositions) {
    scrollPositions[primaryView] = scrollElement.scrollTop;
  }
}

function restoreScrollPosition(view) {
  requestAnimationFrame(() => {
    const scrollElement = document.querySelector(
      `[data-scroll-view="${view}"]`,
    );
    if (scrollElement) scrollElement.scrollTop = scrollPositions[view] ?? 0;
  });
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

function selectHomeFeed(value) {
  homeFeed = value;
  document.querySelectorAll("[data-home-feed]").forEach((button) => {
    const selected = button.dataset.homeFeed === value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll("[data-feed-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.feedPanel !== value;
  });
}

function matchesCalligraphyCard(card, category, normalizedQuery) {
  const categoryOk = category === "all" || card.dataset.category === category;
  if (!categoryOk) return false;
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
  let visibleCount = 0;
  document.querySelectorAll("[data-category]").forEach((card) => {
    const matches = matchesCalligraphyCard(
      card,
      calligraphyCategory,
      normalizedQuery,
    );
    card.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  if (calligraphyFilterEmpty) {
    calligraphyFilterEmpty.hidden = visibleCount > 0;
  }
  if (calligraphyFilterClear) {
    calligraphyFilterClear.hidden = normalizedQuery.length === 0;
  }
}

function selectCalligraphyCategory(value) {
  calligraphyCategory = value;
  document.querySelectorAll("[data-calligraphy-category]").forEach((button) => {
    const selected = button.dataset.calligraphyCategory === value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  filterCalligraphy();
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

document.querySelectorAll("[data-primary-view]").forEach((button) => {
  button.addEventListener("click", () => {
    selectPrimaryView(button.dataset.primaryView);
  });
});

document.querySelectorAll("[data-home-feed]").forEach((button) => {
  button.addEventListener("click", () =>
    selectHomeFeed(button.dataset.homeFeed),
  );
});

document.querySelectorAll("[data-calligraphy-category]").forEach((button) => {
  button.addEventListener("click", () =>
    selectCalligraphyCategory(button.dataset.calligraphyCategory),
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
    const trigger = document.querySelector(
      `[data-content-id="${state.contentId}"]`,
    );
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
  if (root.dataset.platform !== "pc" && inscriptionsSplitOpen) {
    const selected = document.querySelector(
      "[data-view='inscriptions'] [data-open-detail].is-selected",
    );
    closeInscriptionsSplit();
    if (selected && history.state?.kind === "detail") {
      showView("detail");
      fillDetailContent(selected);
    }
    return;
  }
  syncDesktopPreviewPane();
  if (
    root.dataset.platform === "pc" &&
    primaryView === "inscriptions" &&
    history.state?.kind === "detail"
  ) {
    const trigger = document.querySelector(
      `[data-content-id="${history.state.contentId}"]`,
    );
    if (trigger) openDetail(trigger, { updateHistory: false });
  }
}

window.addEventListener("yoyi:platformchange", onPlatformQueryChange);
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
