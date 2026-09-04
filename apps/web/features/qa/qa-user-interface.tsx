"use client";

import { Icon } from "@moya/ui";
import { useEffect, useId, useRef, useState } from "react";

import styles from "./qa-user-interface.module.css";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export const qaUserTabs = ["published", "saved", "liked", "history"] as const;

export type QaUserTab = (typeof qaUserTabs)[number];

export interface QaUserPresentation {
  readonly avatarAlt?: string;
  readonly avatarSrc?: string | null;
  readonly bio?: string;
  readonly id: string;
  readonly name: string;
}

export interface QaUserContentItem {
  readonly id: string;
  readonly imageAlt?: string;
  readonly imageHeight?: number;
  readonly imageSrc?: string;
  readonly imageWidth?: number;
  readonly metadata?: string;
  readonly title: string;
}

export interface QaUserInterfaceProps {
  readonly history?: readonly QaUserContentItem[];
  readonly initialTab?: QaUserTab;
  readonly liked?: readonly QaUserContentItem[];
  readonly onAvatarChangeIntent?: () => void;
  readonly onCloseIntent?: () => void;
  readonly onContentOpenIntent?: (itemId: string) => void;
  readonly onCreateIntent?: () => void;
  readonly onEditProfileIntent?: () => void;
  readonly onOpenIntent?: () => void;
  readonly onSettingsIntent?: (opener: HTMLButtonElement) => void;
  readonly onTabChangeIntent?: (tab: QaUserTab) => void;
  readonly published?: readonly QaUserContentItem[];
  readonly saved?: readonly QaUserContentItem[];
  readonly user: QaUserPresentation;
}

const tabPresentation = {
  history: { empty: "暂无浏览记录", heading: "最近浏览", label: "历史" },
  liked: { empty: "暂无喜欢", heading: "我喜欢的内容", label: "喜欢" },
  published: {
    empty: "暂无发布内容",
    heading: "我发布过的内容",
    label: "发布",
  },
  saved: { empty: "暂无收藏", heading: "我的收藏", label: "收藏" },
} as const satisfies Record<
  QaUserTab,
  { readonly empty: string; readonly heading: string; readonly label: string }
>;

const fallbackInitial = (name: string) => name.trim().slice(0, 1) || "艺";

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const QaUserInterface = ({
  history = [],
  initialTab = "published",
  liked = [],
  onAvatarChangeIntent,
  onCloseIntent,
  onContentOpenIntent,
  onCreateIntent,
  onEditProfileIntent,
  onOpenIntent,
  onSettingsIntent,
  onTabChangeIntent,
  published = [],
  saved = [],
  user,
}: QaUserInterfaceProps) => {
  const [activeTab, setActiveTab] = useState<QaUserTab>(initialTab);
  const [intentStatus, setIntentStatus] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const tabIdPrefix = useId();
  const itemsByTab = { history, liked, published, saved } as const;
  const items = itemsByTab[activeTab];
  const activePresentation = tabPresentation[activeTab];

  const close = () => {
    setIsOpen(false);
    onCloseIntent?.();
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const selectTab = (tab: QaUserTab) => {
    setActiveTab(tab);
    setIntentStatus("");
    onTabChangeIntent?.(tab);
  };

  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    tab: QaUserTab,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const currentIndex = qaUserTabs.indexOf(tab);
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const nextIndex =
      (currentIndex + direction + qaUserTabs.length) % qaUserTabs.length;
    const nextTab = qaUserTabs[nextIndex];
    if (nextTab === undefined) return;
    selectTab(nextTab);
    overlayRef.current
      ?.querySelector<HTMLButtonElement>(`[data-user-tab="${nextTab}"]`)
      ?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    const controlledTargets = Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-primary-navigation-pager], [data-t02p-qa-search], [data-inscription-filter]",
      ),
    ).filter((element) => !overlayRef.current?.contains(element));
    const previousBodyOverflow = document.body.style.overflow;
    const previousStates = controlledTargets.map((element) => ({
      ariaHidden: element.getAttribute("aria-hidden"),
      element,
      inert: element.inert,
    }));
    document.body.style.overflow = "hidden";
    controlledTargets.forEach((element) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        overlayRef.current?.closest<HTMLElement>("[data-product-shell]")
          ?.dataset.settingsOpen === "true"
      ) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab" || overlayRef.current === null) return;
      const focusable = Array.from(
        overlayRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      previousStates.forEach(({ ariaHidden, element, inert }) => {
        element.inert = inert;
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      });
    };
  }, [isOpen]);

  return (
    <div className={styles.root} data-qa-user-interface="">
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label="打开用户页"
        className={`${styles.trigger} yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md yoyi-functional-glass`}
        data-user-trigger=""
        onClick={() => {
          setIsOpen(true);
          onOpenIntent?.();
        }}
        ref={triggerRef}
        type="button"
      >
        {user.avatarSrc == null ? (
          <span aria-hidden="true" className={styles.triggerFallback}>
            {fallbackInitial(user.name)}
          </span>
        ) : (
          <img alt="" height="44" src={user.avatarSrc} width="44" />
        )}
      </button>

      {isOpen ? (
        <section
          aria-label="用户页"
          aria-modal="true"
          className={styles.overlay}
          data-user-page=""
          id={panelId}
          ref={overlayRef}
          role="dialog"
        >
          <header className={styles.header}>
            <button
              aria-label="关闭用户页"
              className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md"
              data-user-close=""
              onClick={close}
              ref={closeButtonRef}
              type="button"
            >
              <Icon aria-hidden="true" name="back" />
            </button>
            <strong>我的</strong>
            <div className={styles.headerActions}>
              <button
                data-user-edit-profile=""
                onClick={() => {
                  setIntentStatus("已记录编辑资料意图");
                  onEditProfileIntent?.();
                }}
                type="button"
              >
                编辑资料
              </button>
              <button
                aria-label="打开设置"
                className={styles.settingsAction}
                data-user-settings=""
                onClick={(event) => {
                  setIntentStatus("已记录设置意图");
                  onSettingsIntent?.(event.currentTarget);
                }}
                type="button"
              >
                <Icon aria-hidden="true" name="settings" />
                <span>设置</span>
              </button>
            </div>
          </header>

          <div className={styles.scroller}>
            <div className={styles.content}>
              <section aria-label="用户资料" className={styles.profile}>
                <button
                  aria-label="更换头像"
                  className={styles.avatar}
                  data-user-avatar=""
                  onClick={() => {
                    setIntentStatus("已记录更换头像意图");
                    onAvatarChangeIntent?.();
                  }}
                  type="button"
                >
                  {user.avatarSrc == null ? (
                    <span aria-hidden="true">{fallbackInitial(user.name)}</span>
                  ) : (
                    <img
                      alt={user.avatarAlt ?? `${user.name}头像`}
                      height="96"
                      src={user.avatarSrc}
                      width="96"
                    />
                  )}
                </button>
                <div className={styles.identity}>
                  <h1>{user.name}</h1>
                  {user.bio === undefined ? null : <p>{user.bio}</p>}
                </div>
              </section>

              <section aria-label="用户内容" className={styles.userContent}>
                <div
                  aria-label="用户内容分类"
                  className={styles.tabs}
                  role="tablist"
                >
                  {qaUserTabs.map((tab) => {
                    const selected = tab === activeTab;
                    return (
                      <button
                        aria-controls={`${tabIdPrefix}-panel`}
                        aria-selected={selected}
                        data-user-tab={tab}
                        id={`${tabIdPrefix}-${tab}`}
                        key={tab}
                        onClick={() => selectTab(tab)}
                        onKeyDown={(event) => handleTabKeyDown(event, tab)}
                        role="tab"
                        tabIndex={selected ? 0 : -1}
                        type="button"
                      >
                        {tabPresentation[tab].label}
                      </button>
                    );
                  })}
                </div>

                <div
                  aria-labelledby={`${tabIdPrefix}-${activeTab}`}
                  className={styles.panel}
                  id={`${tabIdPrefix}-panel`}
                  role="tabpanel"
                >
                  <div className={styles.sectionHeading}>
                    <h2>{activePresentation.heading}</h2>
                    {activeTab === "published" ? (
                      <button
                        data-user-create=""
                        onClick={() => {
                          setIntentStatus("已记录发布内容意图");
                          onCreateIntent?.();
                        }}
                        type="button"
                      >
                        发布内容
                      </button>
                    ) : null}
                  </div>
                  {items.length === 0 ? (
                    <div
                      className={styles.empty}
                      data-user-empty={activeTab}
                      role="status"
                    >
                      <Icon aria-hidden="true" name="empty" />
                      <p>{activePresentation.empty}</p>
                    </div>
                  ) : (
                    <div
                      className={styles.grid}
                      data-user-content-list=""
                      role="list"
                    >
                      {items.map((item) => (
                        <div className={styles.contentItem} key={item.id}>
                          <article role="listitem">
                            {item.imageSrc === undefined ? (
                              <div
                                aria-label={`暂无图像：${item.title}`}
                                className={styles.mediaFallback}
                                role="img"
                              >
                                <Icon aria-hidden="true" name="image" />
                                <span>暂无图像</span>
                              </div>
                            ) : (
                              <div className={styles.media}>
                                <img
                                  alt={item.imageAlt ?? `${item.title} QA 图像`}
                                  height={item.imageHeight ?? 760}
                                  loading="lazy"
                                  src={item.imageSrc}
                                  width={item.imageWidth ?? 600}
                                />
                              </div>
                            )}
                            <div className={styles.cardBody}>
                              <h3>{item.title}</h3>
                              {item.metadata === undefined ? null : (
                                <p>{item.metadata}</p>
                              )}
                            </div>
                          </article>
                          <button
                            aria-label={`打开${item.title}`}
                            data-user-content-id={item.id}
                            onClick={() => {
                              setIntentStatus(
                                `已记录内容打开意图：${item.title}`,
                              );
                              onContentOpenIntent?.(item.id);
                            }}
                            type="button"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <p
                    aria-live="polite"
                    className={styles.intentStatus}
                    data-user-intent-status=""
                  >
                    {intentStatus}
                  </p>
                </div>
              </section>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
};
