"use client";

import { useId } from "react";

import styles from "./editor.module.css";

import type { ReactNode } from "react";

export const EditorSwitch = ({
  label,
  description,
  checked,
  disabled = false,
  busy = false,
  onChange,
  name,
  autoFocus = false,
}: {
  readonly label: string;
  readonly description?: ReactNode;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly name: string;
  readonly autoFocus?: boolean;
}) => {
  const labelId = useId();
  const descriptionId = useId();
  return (
    <div className={styles.switchRow} data-editor-switch={name}>
      <span className={styles.switchText}>
        <span className={styles.switchLabel} id={labelId}>
          {label}
        </span>
        {description === undefined ? null : (
          <span className={styles.hint} id={descriptionId}>
            {description}
          </span>
        )}
      </span>
      <button
        aria-busy={busy || undefined}
        aria-checked={checked}
        aria-describedby={description === undefined ? undefined : descriptionId}
        aria-labelledby={labelId}
        className={styles.switch}
        data-editor-autofocus={autoFocus ? "" : undefined}
        disabled={disabled || busy}
        onClick={() => onChange(!checked)}
        role="switch"
        type="button"
      >
        <span aria-hidden="true" className={styles.switchThumb} />
      </button>
    </div>
  );
};

/** 原图画质 (Q01, default off) — applies to the next selection batch only. */
export const OriginalQualitySwitch = ({
  original,
  onChange,
  autoFocus = false,
}: {
  readonly original: boolean;
  readonly onChange: (original: boolean) => void;
  readonly autoFocus?: boolean;
}) => (
  <EditorSwitch
    autoFocus={autoFocus}
    checked={original}
    description={
      original
        ? "下一批选择的图片按原文件上传，不压缩"
        : "下一批选择的图片先优化为标准画质再上传"
    }
    label="原图画质"
    name="original"
    onChange={onChange}
  />
);

export const ModeSwitches = ({
  children,
}: {
  readonly children: ReactNode;
}) => (
  <div className={styles.switches} data-editor-mode-switches="">
    {children}
  </div>
);
