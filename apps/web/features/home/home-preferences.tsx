"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

import { Icon, IconButton } from "@moya/ui";

import {
  homeLayoutPreferenceKey,
  homeLayoutPreferences,
  themePreferenceKey,
  themePreferences,
  type HomeLayoutPreference,
  type ThemePreference,
} from "./presentation-preferences";
import styles from "./home-screen.module.css";

const themeLabels: Record<ThemePreference, string> = {
  system: "跟随系统",
  light: "浅色模式",
  dark: "深色模式",
};

const layoutLabels: Record<HomeLayoutPreference, string> = {
  single: "单列",
  double: "双列",
};

const nextValue = <T extends string>(values: readonly T[], value: T): T =>
  values[(values.indexOf(value) + 1) % values.length] ?? values[0]!;

const storedPreference = <T extends string>(
  key: string,
  values: readonly T[],
  fallback: T,
): T => {
  try {
    const value = window.localStorage.getItem(key);
    return value !== null && values.includes(value as T)
      ? (value as T)
      : fallback;
  } catch {
    return fallback;
  }
};

const persistPreference = (key: string, value: string) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Privacy settings may disable storage; the current session still works.
  }
};

export function HomePreferences() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("system");
  const [layout, setLayout] = useState<HomeLayoutPreference>("double");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTheme(storedPreference(themePreferenceKey, themePreferences, "system"));
    setLayout(
      storedPreference(
        homeLayoutPreferenceKey,
        homeLayoutPreferences,
        "double",
      ),
    );
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    backRef.current?.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const closeSettings = () => {
    setOpen(false);
    const restoreFocus = () => triggerRef.current?.focus();
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(restoreFocus);
    } else {
      restoreFocus();
    }
  };

  const applyTheme = (value: ThemePreference) => {
    setTheme(value);
    if (value === "system") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.dataset.theme = value;
    }
    persistPreference(themePreferenceKey, value);
  };

  const applyLayout = (value: HomeLayoutPreference) => {
    setLayout(value);
    document.documentElement.dataset.homeLayout = value;
    persistPreference(homeLayoutPreferenceKey, value);
  };

  const containFocus = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSettings();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = [
      ...event.currentTarget.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const nextTheme = nextValue(themePreferences, theme);
  const nextLayout = nextValue(homeLayoutPreferences, layout);

  return (
    <>
      <IconButton
        className={styles.settingsTrigger}
        icon={<Icon name="settings" />}
        label="打开设置"
        onClick={() => setOpen(true)}
        ref={triggerRef}
      />
      {open
        ? createPortal(
            <section
              aria-labelledby="home-settings-title"
              aria-modal="true"
              className={styles.settingsOverlay}
              onKeyDown={containFocus}
              role="dialog"
            >
              <div className={styles.settingsSurface}>
                <header className={styles.settingsTopBar}>
                  <IconButton
                    icon={<Icon name="back" />}
                    label="返回"
                    onClick={closeSettings}
                    ref={backRef}
                  />
                  <h2 id="home-settings-title">设置</h2>
                  <span aria-hidden="true" />
                </header>
                <main className={styles.settingsContent}>
                  <form className={styles.settingsForm}>
                    <fieldset>
                      <legend className="yoyi-visually-hidden">显示</legend>
                      <div className={styles.settingToggles}>
                        <IconButton
                          className={styles.settingToggle}
                          data-theme-mode={theme}
                          icon={<Icon name={`theme-${theme}`} />}
                          label={`切换主题：当前${themeLabels[theme]}，下一项${themeLabels[nextTheme]}`}
                          onClick={() => applyTheme(nextTheme)}
                          title={themeLabels[theme]}
                        />
                        <IconButton
                          className={`${styles.settingToggle} ${styles.layoutToggle}`}
                          data-layout-mode={layout}
                          icon={<Icon name={`layout-${layout}`} />}
                          label={`切换布局：当前${layoutLabels[layout]}，下一项${layoutLabels[nextLayout]}`}
                          onClick={() => applyLayout(nextLayout)}
                          title={layoutLabels[layout]}
                        />
                      </div>
                    </fieldset>
                  </form>
                </main>
              </div>
            </section>,
            document.body,
          )
        : null}
    </>
  );
}
