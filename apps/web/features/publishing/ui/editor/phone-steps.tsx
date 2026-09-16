"use client";

import { useEffect, useRef } from "react";

import styles from "./editor.module.css";

import type { EditorStep } from "./editor-session-state";
import type { ReactNode } from "react";

const steps: readonly {
  readonly step: EditorStep;
  readonly title: string;
}[] = [
  { step: "media", title: "添加图片" },
  { step: "text", title: "文字与设置" },
  { step: "confirm", title: "确认" },
];

/**
 * Phone and narrow tablet (E04): three full-screen steps over one session.
 * Every step's content comes from the same hoisted state, so moving between
 * steps (or resizing into the desktop editor and back) keeps all input, and
 * uploads continue whichever step is shown.
 */
export const PhoneSteps = ({
  step,
  canContinue,
  mediaItemCount,
  media,
  text,
  confirm,
  onStepChange,
  onPreview,
  focusHeading,
}: {
  readonly step: EditorStep;
  /** Step 1 offers 下一步 once there is media (or a selection to finish later). */
  readonly canContinue: boolean;
  readonly mediaItemCount: number;
  readonly media: ReactNode;
  readonly text: ReactNode;
  readonly confirm: ReactNode;
  readonly onStepChange: (step: EditorStep) => void;
  readonly onPreview: (opener: HTMLElement) => void;
  /** Moves focus to the step heading after an explicit step change. */
  readonly focusHeading: boolean;
}) => {
  const index = steps.findIndex((entry) => entry.step === step);
  const current = steps[index]!;
  const headingRef = useRef<HTMLHeadingElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const shownStep = useRef(step);
  useEffect(() => {
    // Only a step change moves focus; mounting (or a resize) never does.
    if (shownStep.current === step) return;
    shownStep.current = step;
    scrollerRef.current?.scrollTo?.({ top: 0 });
    if (focusHeading) headingRef.current?.focus({ preventScroll: true });
  }, [focusHeading, step]);

  return (
    <div
      className={styles.phone}
      data-editor-layout="phone"
      data-editor-step={step}
    >
      <div className={styles.stepScroller} ref={scrollerRef}>
        <div className={styles.stepContent}>
          <header className={styles.stepHeader}>
            <ol aria-hidden="true" className={styles.stepProgress}>
              {steps.map((entry, position) => (
                <li
                  data-reached={position <= index ? "true" : undefined}
                  key={entry.step}
                />
              ))}
            </ol>
            <p className={styles.stepCaption}>
              第 {index + 1} 步，共 {steps.length} 步
            </p>
            <h2
              className={styles.stepHeading}
              data-editor-step-heading=""
              ref={headingRef}
              tabIndex={-1}
            >
              {current.title}
            </h2>
          </header>
          {step === "media" ? media : step === "text" ? text : confirm}
        </div>
      </div>
      <nav aria-label="步骤" className={styles.stepFooter}>
        <div>
          {step === "media" && mediaItemCount > 0 ? (
            <p className={styles.reorderHint}>长按可拖动排序，也可多选移除</p>
          ) : null}
          {step === "media" ? null : (
            <button
              className={styles.textButton}
              onClick={() =>
                onStepChange(step === "confirm" ? "text" : "media")
              }
              type="button"
            >
              上一步
            </button>
          )}
          {step === "media" ? null : (
            <button
              className={styles.textButton}
              data-editor-preview-open=""
              onClick={(event) => onPreview(event.currentTarget)}
              type="button"
            >
              预览
            </button>
          )}
        </div>
        <div>
          {step === "media" ? (
            // Without media, the section's own 跳过，只发布文字 leads on.
            canContinue ? (
              <button
                className={styles.primaryButton}
                onClick={() => onStepChange("text")}
                type="button"
              >
                下一步
              </button>
            ) : null
          ) : step === "text" ? (
            <button
              className={styles.primaryButton}
              onClick={() => onStepChange("confirm")}
              type="button"
            >
              下一步
            </button>
          ) : null}
        </div>
      </nav>
    </div>
  );
};
