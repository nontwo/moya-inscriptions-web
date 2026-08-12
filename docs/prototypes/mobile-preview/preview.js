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
const compactApp = document.querySelector("[data-mobile-app]");
const desktopApp = document.querySelector("[data-desktop-app]");
const shellRoots = [...document.querySelectorAll("[data-shell-root]")];
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
const desktopShellQuery = window.matchMedia("(min-width: 64rem)");
const desktopPlatformQuery = window.matchMedia("(min-width: 56rem)");
const tabletQuery = window.matchMedia("(min-width: 48rem)");

const themePreferenceKey = "yoyi.theme-preference";
const homeLayoutKey = "yoyi.home-feed-layout";
const themePreferences = ["system", "light", "dark"];
const homeLayouts = ["single", "double"];
const primaryViews = ["home", "inscriptions", "calligraphy"];

const scrollPositions = {
  home: 0,
  inscriptions: 0,
  calligraphy: 0,
  detail: 0,
};

function syncPlatformAttribute() {
  if (desktopPlatformQuery.matches) {
    root.dataset.platform = "pc";
  } else if (tabletQuery.matches) {
    root.dataset.platform = "tablet";
  } else {
    root.dataset.platform = "phone";
  }
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
let currentView = "home";
let homeFeed = "discover";
let calligraphyCategory = "all";
let calligraphyFilterQuery = "";
let inscriptionQuery = "";
let activeShellName = desktopShellQuery.matches ? "desktop" : "compact";
let themePreference = readStoredPreference(
  themePreferenceKey,
  themePreferences,
  "system",
);
let homeFeedLayout = readStoredPreference(homeLayoutKey, homeLayouts, "double");

function getShell(name = activeShellName) {
  return document.querySelector(`[data-shell-root="${name}"]`);
}

function setShellAccessibility() {
  shellRoots.forEach((shell) => {
    const inactive = shell.dataset.shellRoot !== activeShellName;
    shell.setAttribute("aria-hidden", String(inactive));
    if (inactive) shell.setAttribute("inert", "");
    else shell.removeAttribute("inert");
  });
  root.dataset.activeShell = activeShellName;
}

function currentScrollElement(shellName = activeShellName) {
  return getShell(shellName)?.querySelector(
    `[data-scroll-view="${currentView}"]`,
  );
}

function saveScrollPosition(shellName = activeShellName) {
  const scrollElement = currentScrollElement(shellName);
  if (scrollElement && currentView in scrollPositions) {
    scrollPositions[currentView] = scrollElement.scrollTop;
  }
}

function restoreScrollPosition(view) {
  requestAnimationFrame(() => {
    shellRoots.forEach((shell) => {
      const scrollElement = shell.querySelector(`[data-scroll-view="${view}"]`);
      if (scrollElement) scrollElement.scrollTop = scrollPositions[view] ?? 0;
    });
  });
}

function showView(view) {
  const shellHasView = getShell()?.querySelector(`[data-view="${view}"]`);
  currentView = shellHasView ? view : primaryView;
  document.querySelectorAll("[data-view]").forEach((panel) => {
    panel.hidden = panel.dataset.view !== currentView;
  });
  document
    .querySelectorAll("[data-bottom-navigation]")
    .forEach((navigation) => {
      navigation.hidden = !primaryViews.includes(currentView);
    });
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
    updatePrimaryNavigation();
    restoreScrollPosition("home");
  }
}

function updatePrimaryNavigation() {
  document.querySelectorAll("[data-primary-view]").forEach((button) => {
    const selected = button.dataset.primaryView === primaryView;
    button.classList.toggle("is-active", selected);
    if (selected) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
}

function selectPrimaryView(view, { updateHistory = true } = {}) {
  if (!primaryViews.includes(view)) return;
  saveScrollPosition();
  primaryView = view;
  showView(view);
  updatePrimaryNavigation();
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
  shellRoots.forEach((shell) => {
    const shellQuery =
      shell.dataset.shellRoot === "compact" ? normalizedQuery : "";
    const cards = [...shell.querySelectorAll("[data-category]")];
    let visibleCount = 0;
    cards.forEach((card) => {
      const matches = matchesCalligraphyCard(
        card,
        calligraphyCategory,
        shellQuery,
      );
      card.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    shell
      .querySelectorAll("[data-calligraphy-filter-empty]")
      .forEach((empty) => {
        empty.hidden = cards.length === 0 || visibleCount > 0;
      });
  });
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

function setSearchValues(query) {
  inscriptionQuery = query;
  document.querySelectorAll("[data-inscription-search]").forEach((input) => {
    if (input.value !== query) input.value = query;
  });
  document.querySelectorAll("[data-search-clear]").forEach((button) => {
    button.hidden = query.trim().length === 0;
  });
}

function filterInscriptions(query) {
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  setSearchValues(query);

  shellRoots.forEach((shell) => {
    const items = [...shell.querySelectorAll("[data-search-text]")];
    let visibleCount = 0;
    items.forEach((item) => {
      const matches = item.dataset.searchText
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedQuery);
      item.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    shell.querySelectorAll("[data-search-empty]").forEach((empty) => {
      empty.hidden = items.length === 0 || visibleCount > 0;
    });
  });
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

function fillDetailContent(trigger) {
  const image = trigger.dataset.image;
  const title = trigger.dataset.title;
  const alt = trigger.querySelector("img")?.alt ?? "";
  const meta = [trigger.dataset.meta, trigger.dataset.location]
    .filter(Boolean)
    .join(" · ");

  document.querySelectorAll("[data-detail-image]").forEach((detailImage) => {
    detailImage.src = image;
    detailImage.alt = alt;
  });
  document.querySelectorAll("[data-detail-title]").forEach((detailTitle) => {
    detailTitle.textContent = title;
  });
  document.querySelectorAll("[data-detail-meta]").forEach((detailMeta) => {
    detailMeta.textContent = meta;
  });
}

function openDetail(trigger, { updateHistory = true } = {}) {
  saveScrollPosition();
  fillDetailContent(trigger);
  showView("detail");
  scrollPositions.detail = 0;
  restoreScrollPosition("detail");
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

function focusActiveSearch() {
  selectPrimaryView("inscriptions");
  requestAnimationFrame(() => {
    getShell()
      ?.querySelector('[data-view="inscriptions"] [data-inscription-search]')
      ?.focus();
  });
}

function showTemporaryStatus(label) {
  document.querySelectorAll("[data-temporary-status]").forEach((status) => {
    status.hidden = false;
    status.textContent = `${label}：原型暂未实现`;
  });
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

document.querySelectorAll("[data-primary-view]").forEach((button) => {
  button.addEventListener("click", () => {
    selectPrimaryView(button.dataset.primaryView);
  });
});

document.querySelectorAll("[data-go-primary-view]").forEach((button) => {
  button.addEventListener("click", () => {
    selectPrimaryView(button.dataset.goPrimaryView);
  });
});

document.querySelectorAll("[data-focus-search]").forEach((button) => {
  button.addEventListener("click", focusActiveSearch);
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

document.querySelectorAll("[data-settings-back]").forEach((button) => {
  button.addEventListener("click", closeSettings);
});

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

document.querySelectorAll("[data-detail-back]").forEach((button) => {
  button.addEventListener("click", closeDetail);
});

document.querySelectorAll("[data-search-clear]").forEach((button) => {
  button.addEventListener("click", () => {
    filterInscriptions("");
    button
      .closest(".yoyi-search-input")
      ?.querySelector("[data-inscription-search]")
      ?.focus();
  });
});

document.querySelectorAll("[data-inscription-search]").forEach((input) => {
  input.addEventListener("input", (event) => {
    filterInscriptions(event.currentTarget.value);
  });
});

document.querySelectorAll("[data-desktop-hero-search]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    focusActiveSearch();
  });
});

document.querySelectorAll("[data-quick-action]").forEach((button) => {
  button.addEventListener("click", () => {
    showTemporaryStatus(button.dataset.quickAction);
  });
});

document.querySelectorAll("[data-temporary-action]").forEach((button) => {
  button.addEventListener("click", () => {
    showTemporaryStatus(button.dataset.temporaryAction);
  });
});

document
  .querySelector("[data-topic-back]")
  ?.addEventListener("click", closeTopicColumn);

document.querySelectorAll("[data-shell-control]").forEach((control) => {
  control.addEventListener("click", (event) => event.preventDefault());
});

document.querySelectorAll("[data-preview-tab]").forEach((tab) => {
  tab.addEventListener("click", () => setPreviewTab(tab.dataset.previewTab));
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
    updatePrimaryNavigation();
    showView("settings");
    return;
  }
  if (state?.kind === "topic") {
    primaryView = "home";
    homeFeed = "topics";
    selectHomeFeed("topics");
    updatePrimaryNavigation();
    openTopicColumn(state.topicId, { updateHistory: false });
    return;
  }
  if (state?.kind === "detail") {
    if (primaryViews.includes(state.sourceView)) primaryView = state.sourceView;
    updatePrimaryNavigation();
    const trigger = document.querySelector(
      `[data-content-id="${state.contentId}"]`,
    );
    if (trigger) openDetail(trigger, { updateHistory: false });
    return;
  }
  if (state?.kind === "primary" && primaryViews.includes(state.view)) {
    primaryView = state.view;
  }
  if (primaryView === "home") selectHomeFeed(homeFeed);
  showView(primaryView);
  updatePrimaryNavigation();
  restoreScrollPosition(primaryView);
});

function onPlatformQueryChange() {
  syncPlatformAttribute();
}

desktopPlatformQuery.addEventListener("change", onPlatformQueryChange);
tabletQuery.addEventListener("change", onPlatformQueryChange);
desktopShellQuery.addEventListener("change", (event) => {
  saveScrollPosition(activeShellName);
  activeShellName = event.matches ? "desktop" : "compact";
  setShellAccessibility();
  showView(currentView);
  updatePrimaryNavigation();
  filterInscriptions(inscriptionQuery);
  selectHomeFeed(homeFeed);
  selectCalligraphyCategory(calligraphyCategory);
  restoreScrollPosition(currentView);
});

history.replaceState({ kind: "primary", view: "home" }, "", location.pathname);
syncPlatformAttribute();
setShellAccessibility();
showView("home");
updatePrimaryNavigation();
renderTopicsFeed();
selectHomeFeed(homeFeed);
selectCalligraphyCategory(calligraphyCategory);
filterInscriptions("");
applyThemePreference(themePreference, { persist: false });
applyHomeFeedLayout(homeFeedLayout, { persist: false });
setPreviewTab("intro");

window.setTimeout(() => {
  document.querySelectorAll("[data-loading-screen]").forEach((screen) => {
    screen.hidden = true;
  });
  if (compactApp) compactApp.dataset.ready = "true";
  if (desktopApp) desktopApp.dataset.ready = "true";
}, 720);
