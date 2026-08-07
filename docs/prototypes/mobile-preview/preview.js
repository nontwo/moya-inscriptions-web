const root = document.documentElement;
const app = document.querySelector("[data-mobile-app]");
const bottomNavigation = document.querySelector("[data-bottom-navigation]");
const detailImage = document.querySelector("[data-detail-image]");
const detailTitle = document.querySelector("[data-detail-title]");
const searchInput = document.querySelector("[data-inscription-search]");
const searchClear = document.querySelector("[data-search-clear]");

const themePreferenceKey = "yoyi.theme-preference";
const homeLayoutKey = "yoyi.home-feed-layout";
const themePreferences = ["system", "light", "dark"];
const homeLayouts = ["single", "double"];
const primaryViews = ["home", "inscriptions", "calligraphy"];

const scrollPositions = {
  home: 0,
  inscriptions: 0,
  calligraphy: 0,
};

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
let themePreference = readStoredPreference(
  themePreferenceKey,
  themePreferences,
  "system",
);
let homeFeedLayout = readStoredPreference(homeLayoutKey, homeLayouts, "double");

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

function showView(view) {
  document.querySelectorAll("[data-view]").forEach((panel) => {
    panel.hidden = panel.dataset.view !== view;
  });
  bottomNavigation.hidden = !primaryViews.includes(view);
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

function selectCalligraphyCategory(value) {
  calligraphyCategory = value;
  document.querySelectorAll("[data-calligraphy-category]").forEach((button) => {
    const selected = button.dataset.calligraphyCategory === value;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-selected", String(selected));
  });
  document.querySelectorAll("[data-category]").forEach((card) => {
    card.hidden = value !== "all" && card.dataset.category !== value;
  });
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
  detailImage.src = trigger.dataset.image;
  detailImage.alt = trigger.querySelector("img")?.alt ?? "";
  detailTitle.textContent = trigger.dataset.title;
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

searchInput.addEventListener("input", (event) => {
  filterInscriptions(event.currentTarget.value);
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  filterInscriptions("");
  searchInput.focus();
});

window.addEventListener("popstate", (event) => {
  const state = event.state;
  if (state?.kind === "settings") {
    if (primaryViews.includes(state.sourceView)) primaryView = state.sourceView;
    updateBottomNavigation();
    showView("settings");
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
  if (state?.kind === "primary" && primaryViews.includes(state.view)) {
    primaryView = state.view;
  }
  showView(primaryView);
  updateBottomNavigation();
  restoreScrollPosition(primaryView);
});

history.replaceState({ kind: "primary", view: "home" }, "", location.pathname);
selectHomeFeed(homeFeed);
selectCalligraphyCategory(calligraphyCategory);
filterInscriptions("");
applyThemePreference(themePreference, { persist: false });
applyHomeFeedLayout(homeFeedLayout, { persist: false });

window.setTimeout(() => {
  document.querySelector("[data-loading-screen]").hidden = true;
  app.dataset.ready = "true";
}, 720);
