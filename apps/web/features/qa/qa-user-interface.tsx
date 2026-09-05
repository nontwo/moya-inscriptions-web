"use client";

import { Icon } from "@moya/ui";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";

import { layoutHomeMasonry } from "../home/catalog-masonry-layout";
import { HorizontalPager } from "../shell/horizontal-pager";
import { useQaModalIsolation } from "./qa-modal-isolation";
import styles from "./qa-user-interface.module.css";

import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  ReactNode,
} from "react";
import type { MasonryLayoutResult } from "../home/catalog-masonry-layout";
import type { HorizontalPagerHandle } from "../shell/horizontal-pager";
import type { PresentationPlatform } from "../shell/device-platform";

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
  readonly presentationKey?: string;
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
  readonly onOpenChange?: (open: boolean) => void;
  readonly onOpenIntent?: () => void;
  readonly onSettingsIntent?: (opener: HTMLButtonElement) => void;
  readonly onTabChangeIntent?: (tab: QaUserTab) => void;
  readonly platform?: PresentationPlatform;
  readonly published?: readonly QaUserContentItem[];
  readonly saved?: readonly QaUserContentItem[];
  readonly settingsOpen?: boolean;
  readonly open?: boolean;
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

const QaUserContentList = ({
  items,
  platform,
  onOpen,
}: {
  readonly items: readonly QaUserContentItem[];
  readonly platform: PresentationPlatform;
  readonly onOpen: (item: QaUserContentItem) => void;
}) => {
  const listRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [layout, setLayout] = useState<MasonryLayoutResult | null>(null);
  const columns = platform === "pc" ? 3 : 2;
  useLayoutEffect(() => {
    const list = listRef.current;
    if (list === null) return;
    const measure = () => {
      const width = list.clientWidth;
      if (width <= 0) return;
      const gap =
        Number.parseFloat(window.getComputedStyle(list).columnGap) || 12;
      const next = layoutHomeMasonry(
        items.map((_, index) => ({
          height: itemRefs.current[index]?.getBoundingClientRect().height ?? 0,
        })),
        width,
        columns,
        gap,
      );
      if (next.positions.some((position) => position.height <= 0)) return;
      setLayout((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    measure();
    if (typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    itemRefs.current.forEach((item) => {
      if (item !== null) observer.observe(item);
    });
    return () => observer.disconnect();
  }, [columns, items]);
  return (
    <div
      className={styles.grid}
      data-user-content-list=""
      data-user-columns={columns}
      data-user-layout-ready={layout !== null}
      ref={listRef}
      role="list"
      style={
        {
          "--user-columns": columns,
          ...(layout === null ? {} : { height: layout.height }),
        } as CSSProperties
      }
    >
      {items.map((item, index) => {
        const position = layout?.positions[index];
        return (
          <div
            className={styles.contentItem}
            key={item.presentationKey ?? item.id}
            ref={(node) => {
              itemRefs.current[index] = node;
            }}
            style={
              position === undefined
                ? undefined
                : { left: position.x, top: position.y, width: position.width }
            }
          >
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
                {item.metadata === undefined ? null : <p>{item.metadata}</p>}
              </div>
            </article>
            <button
              aria-label={`打开${item.title}`}
              data-user-content-id={item.id}
              onClick={() => onOpen(item)}
              type="button"
            />
          </div>
        );
      })}
    </div>
  );
};

export const QaUserInterface = ({
  history = [],
  initialTab = "published",
  liked = [],
  onAvatarChangeIntent,
  onCloseIntent,
  onContentOpenIntent,
  onCreateIntent,
  onEditProfileIntent,
  onOpenChange,
  onOpenIntent,
  onSettingsIntent,
  onTabChangeIntent,
  platform = "phone",
  published = [],
  saved = [],
  open: controlledOpen,
  settingsOpen = false,
  user,
}: QaUserInterfaceProps) => {
  const [activeTab, setActiveTab] = useState<QaUserTab>(initialTab);
  const [progress, setProgress] = useState(qaUserTabs.indexOf(initialTab));
  const [intentStatus, setIntentStatus] = useState("");
  const [localOpen, setLocalOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pagerRef = useRef<HorizontalPagerHandle<QaUserTab>>(null);
  const panelId = useId();
  const tabIdPrefix = useId();
  const itemsByTab = { history, liked, published, saved } as const;
  const isOpen = controlledOpen ?? localOpen;

  const requestOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setLocalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );
  const onRequestClose = useCallback(() => {
    requestOpenChange(false);
    onCloseIntent?.();
  }, [onCloseIntent, requestOpenChange]);
  const { close } = useQaModalIsolation({
    open: isOpen,
    overlayRef,
    initialFocusRef: closeButtonRef,
    openerRef: triggerRef,
    onRequestClose,
    suspended: settingsOpen,
  });

  const commitTab = (tab: QaUserTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setIntentStatus("");
    onTabChangeIntent?.(tab);
  };
  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    tab: QaUserTab,
  ) => {
    const currentIndex = qaUserTabs.indexOf(tab);
    let nextIndex: number;
    if (event.key === "ArrowLeft") nextIndex = Math.max(0, currentIndex - 1);
    else if (event.key === "ArrowRight")
      nextIndex = Math.min(qaUserTabs.length - 1, currentIndex + 1);
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = qaUserTabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = qaUserTabs[nextIndex];
    if (nextTab === undefined) return;
    pagerRef.current?.scrollToKey(nextTab);
    overlayRef.current
      ?.querySelector<HTMLButtonElement>(`[data-user-tab="${nextTab}"]`)
      ?.focus();
  };

  const panels = Object.fromEntries(
    qaUserTabs.map((tab) => {
      const presentation = tabPresentation[tab];
      const items = itemsByTab[tab];
      return [
        tab,
        <div className={styles.panelContent}>
          <div className={styles.sectionHeading}>
            <h2>{presentation.heading}</h2>
            {tab === "published" ? (
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
            <div className={styles.empty} data-user-empty={tab} role="status">
              <Icon aria-hidden="true" name="empty" />
              <p>{presentation.empty}</p>
            </div>
          ) : (
            <QaUserContentList
              items={items}
              platform={platform}
              onOpen={(item) => {
                setIntentStatus(`已记录内容打开意图：${item.title}`);
                onContentOpenIntent?.(item.id);
              }}
            />
          )}
          <p
            aria-live={tab === activeTab ? "polite" : "off"}
            className={styles.intentStatus}
            data-user-intent-status={tab === activeTab ? "" : undefined}
          >
            {tab === activeTab ? intentStatus : ""}
          </p>
        </div>,
      ];
    }),
  ) as Record<QaUserTab, ReactNode>;

  return (
    <div className={styles.root} data-qa-user-interface="">
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label={isOpen ? "关闭用户页" : "打开用户页"}
        className={`${styles.trigger} yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md yoyi-functional-glass`}
        data-user-trigger=""
        onClick={() => {
          requestOpenChange(true);
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
          data-user-platform={platform}
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
            <button
              aria-label="打开设置"
              className={`${styles.settingsAction} yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md`}
              data-user-settings=""
              onClick={(event) => {
                setIntentStatus("已记录设置意图");
                onSettingsIntent?.(event.currentTarget);
              }}
              type="button"
            >
              <Icon aria-hidden="true" name="settings" />
            </button>
          </header>
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
              <button
                className={styles.editProfile}
                data-user-edit-profile=""
                onClick={() => {
                  setIntentStatus("已记录编辑资料意图");
                  onEditProfileIntent?.();
                }}
                type="button"
              >
                编辑资料
              </button>
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
                    aria-controls={`${tabIdPrefix}-panel-${tab}`}
                    aria-selected={selected}
                    data-user-tab={tab}
                    id={`${tabIdPrefix}-${tab}`}
                    key={tab}
                    onClick={() => pagerRef.current?.scrollToKey(tab)}
                    onKeyDown={(event) => handleTabKeyDown(event, tab)}
                    role="tab"
                    tabIndex={selected ? 0 : -1}
                    type="button"
                  >
                    {tabPresentation[tab].label}
                  </button>
                );
              })}
              <span
                aria-hidden="true"
                className={styles.tabIndicator}
                data-user-tab-progress={progress}
                style={{ transform: `translateX(${progress * 100}%)` }}
              />
            </div>
            <HorizontalPager
              activeKey={activeTab}
              keys={qaUserTabs}
              onCommit={commitTab}
              onProgress={setProgress}
              panels={panels}
              platform={platform}
              scrollOwner="panel"
              visible={!settingsOpen}
              ref={pagerRef}
              diagnosticPrefix="user"
              frameClassName={styles.pager}
              panelClassName={styles.panel}
              frameAttributes={{ "data-user-pager": "" }}
              trackAttributes={{ "data-user-track": "" }}
              panelAttributes={(tab, selected) => ({
                "data-user-panel": tab,
                "data-user-scroller": selected ? "" : undefined,
              })}
              panelId={(tab) => `${tabIdPrefix}-panel-${tab}`}
              panelLabelledBy={(tab) => `${tabIdPrefix}-${tab}`}
            />
          </section>
        </section>
      ) : null}
    </div>
  );
};
