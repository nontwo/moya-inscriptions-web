"use client";
import { Icon } from "@moya/ui";
import { useCallback, useRef, useState } from "react";
import { SearchPresentation } from "../search/search-presentation";
import {
  qaRecentSearches,
  qaSuggestedSearches,
  qaTypingSuggestions,
} from "./search-scenarios";
import styles from "../search/search.module.css";
import type { RefObject } from "react";
export { SearchTrigger as QaSearchTrigger } from "../search/search-presentation";

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
  const [localOpen, setLocalOpen] = useState(initialOpen);
  const [keyword, setKeyword] = useState(initialKeyword);
  const [lastIntent, setLastIntent] = useState<string | null>(null);
  const [isSeededEmpty, setIsSeededEmpty] = useState(showEmptyState);
  const localOpenerRef = useRef<HTMLButtonElement>(null);
  const localInputRef = useRef<HTMLInputElement>(null);
  const inputRef = searchInputRef ?? localInputRef;
  const openerRef = providedOpenerRef ?? localOpenerRef;
  const isOpen = controlledOpen ?? localOpen;
  const updateOpen = useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) setLocalOpen(nextOpen);
      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange],
  );
  const chooseSuggestion = (value: string) => {
    setKeyword(value);
    setLastIntent(`已记录建议意图：${value}`);
    setIsSeededEmpty(false);
    onSuggestionIntent?.(value);
    inputRef.current?.focus({ preventScroll: true });
  };
  return (
    <SearchPresentation
      keyword={keyword}
      open={isOpen}
      onOpenChange={updateOpen}
      openerRef={openerRef}
      searchInputRef={inputRef}
      qa
      onKeywordChange={(value) => {
        setKeyword(value);
        setLastIntent(null);
        setIsSeededEmpty(false);
      }}
      onClear={() => {
        setKeyword("");
        setLastIntent(null);
        setIsSeededEmpty(false);
        onClearIntent?.();
      }}
      onSubmit={(value) => {
        setLastIntent(`已记录搜索意图：${value}`);
        onSearchIntent?.(value);
      }}
    >
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
              keyword.length === 0 ? qaSuggestedSearches : qaTypingSuggestions
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
    </SearchPresentation>
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
