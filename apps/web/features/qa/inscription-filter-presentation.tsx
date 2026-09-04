"use client";

import { Icon } from "@moya/ui";
import { useEffect, useId, useRef, useState } from "react";

import { useProductShell } from "../product-shell/product-shell";
import { T02pQaSearch } from "./t02p-qa-search";
import styles from "./inscription-filter-presentation.module.css";

type FilterKey = "dynasty" | "script" | "inscriptionType" | "region";
type QaProductUtility = "filter" | "search";

export interface QaFilterPresentationState {
  readonly dynasty?: string;
  readonly script?: string;
  readonly inscriptionType?: string;
  readonly region?: string;
}

export interface QaInscriptionFilterProps {
  readonly onFilterIntent?: (state: QaFilterPresentationState) => void;
  readonly onApplyFilter?: (state: QaFilterPresentationState) => void;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onResetFilter?: () => void;
  readonly open?: boolean;
}

// QA-only presentation fixtures; these are not canonical Catalog taxonomy values.
const categories = [
  {
    key: "dynasty",
    label: "朝代",
    options: ["秦汉", "魏晋南北朝", "隋唐", "宋", "元", "明", "清"],
  },
  {
    key: "script",
    label: "书体",
    options: ["篆书", "隶书", "楷书", "行书", "草书"],
  },
  {
    key: "inscriptionType",
    label: "类型",
    options: ["摩崖", "碑刻", "墓志", "造像记", "题记"],
  },
  {
    key: "region",
    label: "地区",
    options: ["河南", "陕西", "山东", "四川"],
  },
] as const satisfies readonly {
  readonly key: FilterKey;
  readonly label: string;
  readonly options: readonly string[];
}[];

const withoutSelection = (state: QaFilterPresentationState, key: FilterKey) => {
  const next = { ...state };
  delete next[key];
  return next;
};

export const QaProductUtilities = ({
  initialKeyword,
  initialSearchOpen,
  showEmptyState,
}: {
  readonly initialKeyword: string;
  readonly initialSearchOpen: boolean;
  readonly showEmptyState: boolean;
}) => {
  const { activeDestination, settingsOpen } = useProductShell();
  const [activeUtility, setActiveUtility] = useState<QaProductUtility | null>(
    initialSearchOpen ? "search" : null,
  );

  useEffect(() => {
    if (activeDestination !== "inscriptions") {
      setActiveUtility((current) => (current === "filter" ? null : current));
    }
  }, [activeDestination]);

  useEffect(() => {
    if (settingsOpen) setActiveUtility(null);
  }, [settingsOpen]);

  const updateUtility = (utility: QaProductUtility, open: boolean) => {
    setActiveUtility((current) => {
      if (open) return utility;
      return current === utility ? null : current;
    });
  };

  return (
    <>
      <T02pQaSearch
        initialKeyword={initialKeyword}
        onOpenChange={(open) => updateUtility("search", open)}
        open={activeUtility === "search"}
        showEmptyState={showEmptyState}
      />
      {activeDestination === "inscriptions" ? (
        <QaInscriptionFilter
          onOpenChange={(open) => updateUtility("filter", open)}
          open={activeUtility === "filter"}
        />
      ) : null}
    </>
  );
};

export const QaInscriptionFilter = ({
  onApplyFilter,
  onFilterIntent,
  onOpenChange,
  onResetFilter,
  open,
}: QaInscriptionFilterProps) => {
  const { platform } = useProductShell();
  const [localOpen, setLocalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<FilterKey | null>(null);
  const [selection, setSelection] = useState<QaFilterPresentationState>({});
  const [draftValue, setDraftValue] = useState<string | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isOpen = open ?? localOpen;
  const isCompact = platform !== "pc";
  const category = categories.find(({ key }) => key === activeCategory);
  const hasSelection = Object.values(selection).some(Boolean);

  const requestOpenChange = (nextOpen: boolean) => {
    if (open === undefined) setLocalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  const closeCategory = (restoreFocus: boolean) => {
    setActiveCategory(null);
    setDraftValue(undefined);
    if (restoreFocus) {
      window.requestAnimationFrame(() => optionTriggerRef.current?.focus());
    }
  };

  const closeAll = (restoreFocus: boolean) => {
    requestOpenChange(false);
    setActiveCategory(null);
    setDraftValue(undefined);
    if (restoreFocus) {
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const applyState = (next: QaFilterPresentationState) => {
    setSelection(next);
    onFilterIntent?.(next);
    onApplyFilter?.(next);
  };

  const clearCategory = (key: FilterKey) => {
    applyState(withoutSelection(selection, key));
  };

  const reset = (restoreFocus: boolean) => {
    applyState({});
    setActiveCategory(null);
    setDraftValue(undefined);
    onResetFilter?.();
    if (restoreFocus) {
      window.requestAnimationFrame(() => resetTriggerRef.current?.focus());
    }
  };

  const openCategory = (key: FilterKey, trigger: HTMLButtonElement) => {
    optionTriggerRef.current = trigger;
    setActiveCategory(key);
    setDraftValue(selection[key]);
  };

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        rootRef.current?.contains(event.target as Node) !== true &&
        sheetRef.current?.contains(event.target as Node) !== true
      ) {
        closeAll(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (activeCategory === null) closeAll(true);
        else closeCategory(true);
        return;
      }

      if (
        event.key !== "Tab" ||
        !isCompact ||
        activeCategory === null ||
        sheetRef.current === null
      ) {
        return;
      }

      const focusable = Array.from(
        sheetRef.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]), input:not([disabled])",
        ),
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
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeCategory, isCompact, isOpen]);

  useEffect(() => {
    if (!isCompact || activeCategory === null) return;
    window.requestAnimationFrame(() => {
      sheetRef.current
        ?.querySelector<HTMLElement>("input:checked, input")
        ?.focus();
    });
  }, [activeCategory, isCompact]);

  return (
    <div
      className={styles.root}
      data-inscription-filter=""
      data-platform={platform}
      ref={rootRef}
    >
      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? "关闭筛选" : "打开筛选"}
        className={`${styles.trigger} yoyi-functional-glass`}
        data-filter-trigger=""
        onClick={(event) => {
          if (isOpen) closeAll(true);
          else {
            event.currentTarget.focus({ preventScroll: true });
            setActiveCategory(null);
            setDraftValue(undefined);
            requestOpenChange(true);
          }
        }}
        ref={triggerRef}
        type="button"
      >
        <Icon aria-hidden="true" name="filter" />
        <span>筛选</span>
      </button>

      {isOpen ? (
        <section
          aria-label="QA 筛选条件"
          className={`${styles.panel} yoyi-functional-glass`}
          data-filter-panel=""
        >
          <div className={styles.chips} role="group" aria-label="筛选条件">
            <button
              aria-pressed={!hasSelection}
              className={styles.chip}
              data-filter-reset=""
              onClick={() => reset(false)}
              ref={resetTriggerRef}
              type="button"
            >
              全部
            </button>
            {categories.map(({ key, label }) => {
              const value = selection[key];
              return (
                <button
                  aria-expanded={activeCategory === key}
                  aria-label={
                    value === undefined
                      ? `${label}筛选`
                      : `移除${label}筛选：${value}`
                  }
                  className={styles.chip}
                  data-filter-category={key}
                  data-selected={value === undefined ? undefined : ""}
                  key={key}
                  onClick={(event) => {
                    if (value !== undefined) clearCategory(key);
                    else if (activeCategory === key) closeCategory(false);
                    else openCategory(key, event.currentTarget);
                  }}
                  type="button"
                >
                  {value === undefined ? `${label}⌄` : `${value} ×`}
                </button>
              );
            })}
          </div>

          {!isCompact && category !== undefined ? (
            <div
              aria-label={`${category.label}选项`}
              className={styles.popover}
              data-filter-popover={category.key}
              role="group"
            >
              <button
                aria-pressed={selection[category.key] === undefined}
                onClick={() => {
                  clearCategory(category.key);
                  closeCategory(true);
                }}
                type="button"
              >
                全部
              </button>
              {category.options.map((option) => (
                <button
                  aria-pressed={selection[category.key] === option}
                  key={option}
                  onClick={() => {
                    const next = { ...selection, [category.key]: option };
                    applyState(next);
                    closeCategory(true);
                  }}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {isOpen && isCompact && category !== undefined ? (
        <div
          className={styles.backdrop}
          data-filter-sheet-backdrop=""
          onPointerDown={(event) => {
            if (event.target !== event.currentTarget) return;
            event.stopPropagation();
            closeAll(false);
          }}
        >
          <div
            aria-labelledby={titleId}
            aria-modal="true"
            className={styles.sheet}
            data-filter-sheet={category.key}
            ref={sheetRef}
            role="dialog"
          >
            <header className={styles.sheetHeader}>
              <h2 id={titleId}>{category.label}</h2>
              <button onClick={() => closeCategory(true)} type="button">
                取消
              </button>
            </header>
            <fieldset className={styles.options}>
              <legend className={styles.visuallyHidden}>
                {category.label}选项
              </legend>
              {["全部", ...category.options].map((option) => {
                const value = option === "全部" ? undefined : option;
                return (
                  <label key={option}>
                    <span>{option}</span>
                    <input
                      checked={draftValue === value}
                      name={`qa-filter-${category.key}`}
                      onChange={() => setDraftValue(value)}
                      type="radio"
                    />
                  </label>
                );
              })}
            </fieldset>
            <div className={styles.sheetActions}>
              <button onClick={() => reset(true)} type="button">
                重置
              </button>
              <button
                data-filter-confirm=""
                onClick={() => {
                  const next =
                    draftValue === undefined
                      ? withoutSelection(selection, category.key)
                      : { ...selection, [category.key]: draftValue };
                  applyState(next);
                  closeCategory(true);
                }}
                type="button"
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
