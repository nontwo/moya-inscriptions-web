"use client";

import { useId } from "react";

import { EditorDialog } from "./editor-dialog";
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

/** 保存草稿到账号 (D01, default on) — visible before any selection or typing. */
export const DraftModeSwitch = ({
  saving,
  busy,
  disabledReason,
  onChange,
  autoFocus,
}: {
  readonly saving: boolean;
  readonly busy: boolean;
  /** Why the switch cannot be turned on now, if it cannot. */
  readonly disabledReason: string | null;
  readonly onChange: (saving: boolean) => void;
  readonly autoFocus?: boolean;
}) => (
  <EditorSwitch
    autoFocus={autoFocus ?? false}
    busy={busy}
    checked={saving}
    description={
      disabledReason ??
      (saving
        ? "自动保存为仅自己可见的草稿，可在其他设备继续编辑"
        : "不保存草稿，离开或放弃后内容不会保留")
    }
    disabled={!saving && disabledReason !== null}
    label="保存草稿到账号"
    name="drafts"
    onChange={onChange}
  />
);

/** 原图画质 (Q01, default off) — applies to the next selection batch only. */
export const OriginalQualitySwitch = ({
  original,
  onChange,
}: {
  readonly original: boolean;
  readonly onChange: (original: boolean) => void;
}) => (
  <EditorSwitch
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

/**
 * D06: turning drafts off for a saved draft deletes exactly that draft, its
 * history and conflict copies, and media only they reference — never other
 * drafts or any work revision.
 */
export const DraftDeletionDialog = ({
  isEdit,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  readonly isEdit: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) => (
  <EditorDialog
    cancellable={!busy}
    dataName="draft-deletion"
    description={
      <>
        <p className={styles.dialogDescription}>
          关闭后将删除这份草稿、它的全部历史版本和冲突副本，以及只被它们使用的图片。
        </p>
        <p className={styles.dialogDescription}>
          {isEdit
            ? "其他草稿和已发布的作品及其版本不受影响。"
            : "其他草稿和已发布的作品不受影响。"}
          当前页面中的内容会保留，但不再保存到账号。
        </p>
        {error === null ? null : (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </>
    }
    onCancel={onCancel}
    title="不再保存这份草稿？"
  >
    <div className={styles.dialogActions}>
      <button
        className={styles.textButton}
        data-dialog-initial-focus=""
        disabled={busy}
        onClick={onCancel}
        type="button"
      >
        继续保存草稿
      </button>
      <button
        aria-busy={busy || undefined}
        className={styles.primaryButton}
        disabled={busy}
        onClick={onConfirm}
        type="button"
      >
        {busy ? "正在删除…" : "删除草稿并关闭"}
      </button>
    </div>
  </EditorDialog>
);
