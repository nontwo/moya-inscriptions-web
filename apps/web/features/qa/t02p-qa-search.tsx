"use client";

import { Icon } from "@moya/ui";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  qaRecentSearches,
  qaSuggestedSearches,
  qaTypingSuggestions,
} from "./search-scenarios";
import { useProductShell } from "../product-shell/product-shell";
import styles from "./t02p-qa-search.module.css";

export interface QaSearchPresentationProps {
  readonly initialKeyword?: string;
  readonly initialOpen?: boolean;
  readonly open?: boolean;
  readonly onSearchIntent?: (keyword: string) => void;
  readonly onSuggestionIntent?: (keyword: string) => void;
  readonly onClearIntent?: () => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly showEmptyState?: boolean;
}

export const T02pQaSearch = ({
  initialKeyword = "",
  initialOpen = false,
  onClearIntent,
  onOpenChange,
  onSearchIntent,
  onSuggestionIntent,
  open: controlledOpen,
  showEmptyState = false,
}: QaSearchPresentationProps) => {
  const { platform } = useProductShell();
  const [localOpen, setLocalOpen] = useState(initialOpen);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const [isSeededEmpty, setIsSeededEmpty] = useState(showEmptyState);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();
  const inputId = useId();
  const isCompact = platform !== "pc";
  const isOpen = controlledOpen ?? localOpen;

  const updateOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setLocalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );

  const close = useCallback(
    (restoreTriggerFocus: boolean) => {
      updateOpen(false);
      if (restoreTriggerFocus) {
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    },
    [updateOpen],
  );

  const submit = () => {
    const value = keyword.trim();
    if (value.length === 0) return;
    setLastIntent(`已记录搜索意图：${value}`);
    onSearchIntent?.(value);
  };

  const chooseSuggestion = (value: string) => {
    setKeyword(value);
    setLastIntent(`已记录建议意图：${value}`);
    setIsSeededEmpty(false);
    onSuggestionIntent?.(value);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const clear = () => {
    setKeyword("");
    setLastIntent(null);
    setIsSeededEmpty(false);
    onClearIntent?.();
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  useEffect(() => {
    if (!isOpen) return;
    const activeElementWhenScheduled = document.activeElement;
    const focusFrame = window.requestAnimationFrame(() => {
      if (
        document.activeElement !== activeElementWhenScheduled &&
        document.activeElement !== triggerRef.current
      ) {
        return;
      }
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(focusFrame);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node) !== true)
        close(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, isOpen]);

  const suggestionItems =
    keyword.length === 0 ? qaSuggestedSearches : qaTypingSuggestions;

  return (
    <div
      className={styles.root}
      data-open={isOpen ? "" : undefined}
      data-platform={platform}
      data-t02p-qa-search=""
      ref={rootRef}
    >
      <button
        aria-controls={panelId}
        aria-expanded={isOpen}
        aria-label={isOpen ? "关闭搜索" : "打开搜索"}
        className={`${styles.trigger} yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md yoyi-functional-glass`}
        data-search-trigger=""
        onClick={() => {
          if (isOpen) close(true);
          else updateOpen(true);
        }}
        ref={triggerRef}
        type="button"
      >
        <Icon aria-hidden="true" name="search" />
      </button>

      {isOpen ? (
        <section
          aria-label="QA 搜索"
          className={`${styles.panel} yoyi-functional-glass`}
          data-search-panel=""
          id={panelId}
        >
          <form
            className={styles.form}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
            role="search"
          >
            {isCompact ? (
              <button
                aria-label="关闭搜索"
                className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md"
                data-search-close=""
                onClick={() => close(true)}
                type="button"
              >
                <Icon aria-hidden="true" name="back" />
              </button>
            ) : null}
            <div className={`${styles.input} yoyi-search-input`}>
              <Icon aria-hidden="true" name="search" />
              <label className={styles.visuallyHidden} htmlFor={inputId}>
                搜索关键词
              </label>
              <input
                autoComplete="off"
                id={inputId}
                onChange={(event) => {
                  setKeyword(event.currentTarget.value);
                  setLastIntent(null);
                  setIsSeededEmpty(false);
                }}
                placeholder="搜索碑刻、书帖……"
                ref={inputRef}
                type="search"
                value={keyword}
              />
              {keyword.length === 0 ? null : (
                <button
                  aria-label="清空搜索"
                  className={`${styles.inlineAction} yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--sm`}
                  data-search-clear=""
                  onClick={clear}
                  type="button"
                >
                  <Icon aria-hidden="true" name="close" />
                </button>
              )}
            </div>
            <button
              aria-label="提交搜索"
              className={`${styles.submit} yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md`}
              data-search-submit=""
              type="submit"
            >
              <Icon aria-hidden="true" name="search" />
            </button>
            {!isCompact ? (
              <button
                aria-label="关闭搜索"
                className="yoyi-icon-button yoyi-icon-button--quiet yoyi-icon-button--md"
                data-search-close=""
                onClick={() => close(true)}
                type="button"
              >
                <Icon aria-hidden="true" name="close" />
              </button>
            ) : null}
          </form>

          <div className={styles.content} data-search-content="">
            {isSeededEmpty ? (
              <div className={styles.empty} data-search-empty="" role="status">
                <Icon aria-hidden="true" name="empty" />
                <strong>没有找到相关内容</strong>
                <span>这是 QA 视觉状态，不代表真实搜索结果。</span>
              </div>
            ) : (
              <>
                {keyword.length === 0 ? (
                  <SearchGroup
                    label="最近搜索"
                    items={qaRecentSearches}
                    onChoose={chooseSuggestion}
                  />
                ) : null}
                <SearchGroup
                  label={keyword.length === 0 ? "搜索建议" : "QA 搜索建议"}
                  items={suggestionItems}
                  onChoose={chooseSuggestion}
                />
              </>
            )}
            <p
              aria-live="polite"
              className={styles.intentStatus}
              data-search-intent-status=""
            >
              {lastIntent}
            </p>
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
