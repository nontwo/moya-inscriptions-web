"use client";

import { Icon } from "@moya/ui";
import { useEffect, useId, useRef, useState } from "react";

import { useProductShell } from "../product-shell/product-shell";
import styles from "./inscription-filter-presentation.module.css";

type FilterKey = "dynasty" | "script" | "type" | "region";

export interface QaFilterPresentationState {
  readonly dynasty?: string;
  readonly script?: string;
  readonly type?: string;
  readonly region?: string;
}

export interface QaInscriptionFilterProps {
  readonly onFilterIntent?: (state: QaFilterPresentationState) => void;
  readonly onApplyFilter?: (state: QaFilterPresentationState) => void;
  readonly onResetFilter?: () => void;
}

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
    key: "type",
    label: "类型",
    options: ["摩崖", "碑刻", "墓志", "造像记", "题记"],
  },
  { key: "region", label: "地区", options: ["地区"] },
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

export const QaInscriptionFilter = ({
  onApplyFilter,
  onFilterIntent,
  onResetFilter,
}: QaInscriptionFilterProps) => {
  const { platform } = useProductShell();
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<FilterKey | null>(null);
  const [selection, setSelection] = useState<QaFilterPresentationState>({});
  const [draftValue, setDraftValue] = useState<string | undefined>();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionTriggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const isCompact = platform !== "pc";
  const category = categories.find(({ key }) => key === activeCategory);
  const hasSelection = Object.values(selection).some(Boolean);

  const closeCategory = (restoreFocus = true) => {
    setActiveCategory(null);
    setDraftValue(undefined);
    if (restoreFocus) {
      window.requestAnimationFrame(() => optionTriggerRef.current?.focus());
    }
  };

  const closeAll = () => {
    setIsOpen(false);
    setActiveCategory(null);
    setDraftValue(undefined);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const applyState = (
    next: QaFilterPresentationState,
    shouldNotifyApply: boolean,
  ) => {
    setSelection(next);
    onFilterIntent?.(next);
    if (shouldNotifyApply) onApplyFilter?.(next);
  };

  const clearCategory = (key: FilterKey) => {
    applyState(withoutSelection(selection, key), true);
  };

  const reset = () => {
    setSelection({});
    setActiveCategory(null);
    setDraftValue(undefined);
    onFilterIntent?.({});
    onResetFilter?.();
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
        closeAll();
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
        if (activeCategory === null) closeAll();
        else closeCategory();
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
        onClick={() => {
          if (isOpen) closeAll();
          else setIsOpen(true);
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
              onClick={reset}
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
              role="listbox"
            >
              <button
                aria-selected={selection[category.key] === undefined}
                onClick={() => {
                  clearCategory(category.key);
                  closeCategory();
                }}
                role="option"
                type="button"
              >
                全部
              </button>
              {category.options.map((option) => (
                <button
                  aria-selected={selection[category.key] === option}
                  key={option}
                  onClick={() => {
                    const next = { ...selection, [category.key]: option };
                    applyState(next, true);
                    closeCategory();
                  }}
                  role="option"
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
        <div className={styles.backdrop} data-filter-sheet-backdrop="">
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
              <button onClick={() => closeCategory()} type="button">
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
              <button onClick={reset} type="button">
                重置
              </button>
              <button
                data-filter-confirm=""
                onClick={() => {
                  const next =
                    draftValue === undefined
                      ? withoutSelection(selection, category.key)
                      : { ...selection, [category.key]: draftValue };
                  applyState(next, true);
                  closeCategory();
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
