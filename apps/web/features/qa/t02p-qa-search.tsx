"use client";

import { Icon } from "@moya/ui";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import { useQaModalIsolation } from "./qa-modal-isolation";
import {
  qaRecentSearches,
  qaSuggestedSearches,
  qaTypingSuggestions,
} from "./search-scenarios";
import { useProductShell } from "../product-shell/product-shell";
import { resolvePrimaryNavigationViewportInset } from "../shell/primary-navigation-motion";
import styles from "./t02p-qa-search.module.css";

import type { RefObject } from "react";

export interface QaSearchPresentationProps {
  readonly initialKeyword?: string;
  readonly initialOpen?: boolean;
  readonly open?: boolean;
  readonly onSearchIntent?: (keyword: string) => void;
  readonly onSuggestionIntent?: (keyword: string) => void;
  readonly onClearIntent?: () => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly openerRef?: RefObject<HTMLButtonElement | null>;
  readonly searchInputRef?: RefObject<HTMLInputElement | null>;
  readonly showEmptyState?: boolean;
  readonly showRecentSearches?: boolean;
}

export const QaSearchTrigger = ({
  open,
  onOpenChange,
  openerRef,
  searchInputRef,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly openerRef: RefObject<HTMLButtonElement | null>;
  readonly searchInputRef: RefObject<HTMLInputElement | null>;
}) => (
  <button
    aria-expanded={open}
    aria-haspopup="dialog"
    aria-label="打开搜索"
    className={`${styles.trigger} yoyi-functional-glass`}
    data-search-trigger=""
    onClick={() => {
      // Preserve Safari's user activation through the input's first focus.
      flushSync(() => onOpenChange(true));
      searchInputRef.current?.focus({ preventScroll: true });
    }}
    ref={openerRef}
    type="button"
  >
    <Icon aria-hidden="true" name="search" />
  </button>
);

export const T02pQaSearch = ({
  initialKeyword = "",
  initialOpen = false,
  onClearIntent,
  onOpenChange,
  onSearchIntent,
  onSuggestionIntent,
  open: controlledOpen,
  openerRef: providedOpenerRef,
  searchInputRef,
  showEmptyState = false,
  showRecentSearches = false,
}: QaSearchPresentationProps) => {
  const { platform } = useProductShell();
  const [localOpen, setLocalOpen] = useState(initialOpen);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const [isSeededEmpty, setIsSeededEmpty] = useState(showEmptyState);
  const overlayRef = useRef<HTMLElement>(null);
  const localOpenerRef = useRef<HTMLButtonElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const composingRef = useRef(false);
  const inputRef = searchInputRef ?? localInputRef;
  const openerRef = providedOpenerRef ?? localOpenerRef;
  const inputId = useId();
  const isOpen = controlledOpen ?? localOpen;

  const updateOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setLocalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );
  const { close } = useQaModalIsolation({
    open: isOpen,
    overlayRef,
    initialFocusRef: inputRef,
    openerRef,
    onRequestClose: () => updateOpen(false),
  });

  useLayoutEffect(() => {
    // Removing an active input need not emit compositionend (including a
    // controlled switch to another utility). A later session starts fresh.
    if (!isOpen) composingRef.current = false;
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || overlayRef.current === null) return;
    const overlay = overlayRef.current;
    const viewport = window.visualViewport;
    let frame: number | null = null;
    const synchronize = () => {
      frame = null;
      if (viewport == null) {
        overlay.style.setProperty(
          "--qa-search-viewport-height",
          `${window.innerHeight}px`,
        );
        return;
      }
      overlay.style.setProperty(
        "--qa-search-viewport-height",
        `${viewport.height}px`,
      );
      overlay.style.setProperty(
        "--qa-search-viewport-top",
        `${viewport.offsetTop}px`,
      );
      overlay.style.setProperty(
        "--qa-search-viewport-left",
        `${viewport.offsetLeft}px`,
      );
      overlay.style.setProperty(
        "--qa-search-viewport-width",
        `${viewport.width}px`,
      );
      const inset = resolvePrimaryNavigationViewportInset(
        window.innerHeight,
        viewport.height,
        viewport.offsetTop,
      );
      // Already bounded by the visual viewport: do not add keyboard inset again.
      overlay.style.setProperty(
        "--qa-search-bottom-safe-area",
        inset > 1 ? "0px" : "env(safe-area-inset-bottom)",
      );
    };
    const schedule = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(synchronize);
    };
    synchronize();
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("orientationchange", schedule);
    return () => {
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  const submit = () => {
    const value = keyword.trim();
    if (composingRef.current || value.length === 0) return;
    setLastIntent(`已记录搜索意图：${value}`);
    onSearchIntent?.(value);
  };
  const chooseSuggestion = (value: string) => {
    setKeyword(value);
    setLastIntent(`已记录建议意图：${value}`);
    setIsSeededEmpty(false);
    onSuggestionIntent?.(value);
    inputRef.current?.focus({ preventScroll: true });
  };
  const clear = () => {
    setKeyword("");
    setLastIntent(null);
    setIsSeededEmpty(false);
    onClearIntent?.();
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      className={styles.root}
      data-open={isOpen ? "" : undefined}
      data-platform={platform}
      data-t02p-qa-search=""
    >
      {isOpen ? (
        <section
          aria-label="QA 搜索"
          aria-modal="true"
          className={styles.panel}
          data-search-panel=""
          ref={overlayRef}
          role="dialog"
          tabIndex={-1}
        >
          <div className={styles.content} data-search-content="">
            {isSeededEmpty ? (
              <div className={styles.empty} data-search-empty="" role="status">
                <Icon aria-hidden="true" name="empty" />
                <strong>没有找到相关内容</strong>
                <span>这是 QA 视觉状态，不代表真实搜索结果。</span>
              </div>
            ) : keyword.length === 0 && !showRecentSearches ? (
              <div className={styles.empty} data-search-no-recent="">
                <Icon aria-hidden="true" name="search" />
                <strong>暂无搜索记录</strong>
                <span>最近搜索会显示在这里</span>
              </div>
            ) : (
              <div className={styles.groups}>
                {keyword.length === 0 ? (
                  <SearchGroup
                    label="QA 最近搜索"
                    items={qaRecentSearches}
                    onChoose={chooseSuggestion}
                  />
                ) : null}
                <SearchGroup
                  label="QA 搜索建议"
                  items={
                    keyword.length === 0
                      ? qaSuggestedSearches
                      : qaTypingSuggestions
                  }
                  onChoose={chooseSuggestion}
                />
              </div>
            )}
            <p
              aria-live="polite"
              className={styles.intentStatus}
              data-search-intent-status=""
            >
              {lastIntent}
            </p>
          </div>
          <div className={styles.composer} data-search-composer="">
            <form
              className={`${styles.form} yoyi-functional-glass`}
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
              role="search"
            >
              <button
                aria-label="提交搜索"
                className={styles.submit}
                data-search-submit=""
                type="submit"
              >
                <Icon aria-hidden="true" name="search" />
              </button>
              <label className={styles.visuallyHidden} htmlFor={inputId}>
                搜索关键词
              </label>
              <input
                autoComplete="off"
                enterKeyHint="search"
                id={inputId}
                onChange={(event) => {
                  setKeyword(event.currentTarget.value);
                  setLastIntent(null);
                  setIsSeededEmpty(false);
                }}
                onCompositionStart={() => {
                  composingRef.current = true;
                }}
                onCompositionEnd={() => {
                  composingRef.current = false;
                }}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (composingRef.current ||
                      event.nativeEvent.isComposing ||
                      event.nativeEvent.keyCode === 229)
                  )
                    event.preventDefault();
                }}
                placeholder="搜索碑刻、书帖……"
                ref={inputRef}
                type="search"
                value={keyword}
              />
              {keyword.length === 0 ? null : (
                <button
                  aria-label="清空搜索"
                  className={styles.inlineAction}
                  data-search-clear=""
                  onClick={clear}
                  type="button"
                >
                  <Icon aria-hidden="true" name="close" />
                </button>
              )}
            </form>
            <button
              aria-label="关闭搜索"
              className={`${styles.close} yoyi-functional-glass`}
              data-search-close=""
              onClick={close}
              type="button"
            >
              <Icon aria-hidden="true" name="close" />
            </button>
          </div>
        </section>
      ) : null}
    </div>
  );
};

const SearchGroup = ({
  items,
  label,
  onChoose,
}: {
  readonly items: readonly string[];
  readonly label: string;
  readonly onChoose: (value: string) => void;
}) => (
  <section aria-label={label} className={styles.group}>
    <h2>{label}</h2>
    <div className={styles.suggestions}>
      {items.map((item) => (
        <button
          data-search-suggestion={item}
          key={item}
          onClick={() => onChoose(item)}
          type="button"
        >
          <Icon aria-hidden="true" name="search" />
          <span>{item}</span>
        </button>
      ))}
    </div>
  </section>
);
