"use client";

import styles from "./editor.module.css";

import type { AutosaveState } from "../../draft-autosave";
import type { SaveMode } from "../../publishing-runtime";

export type SaveStatusKind =
  | "none"
  | "unsaved_mode"
  | "pending"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

export const saveStatusOf = (
  saveMode: SaveMode | null,
  autosave: AutosaveState | null,
): SaveStatusKind => {
  if (saveMode === "unsaved") return "unsaved_mode";
  if (autosave === null) return "none";
  switch (autosave.status) {
    case "pending":
      return "pending";
    case "saving":
    case "reconciling":
      return "saving";
    case "error":
      return "error";
    case "conflict":
      return "conflict";
    case "saved":
      return autosave.editVersion > autosave.savedVersion ? "pending" : "saved";
    case "idle":
      return autosave.draftId === null ? "none" : "saved";
  }
};

const statusText: Readonly<Record<SaveStatusKind, string>> = {
  none: "",
  unsaved_mode: "未保存到账号",
  pending: "有未保存的更改",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败",
  conflict: "有两个版本待选择",
};

/**
 * The return bar's save state (D02, V03). The visible text follows every
 * autosave; only states that ask something of the author (a failed save,
 * two versions) are announced, so typing does not make a screen reader
 * repeat 保存中… and 已保存.
 */
export const SaveStatus = ({
  saveMode,
  autosave,
  onRetry,
  onChooseVersion,
}: {
  readonly saveMode: SaveMode | null;
  readonly autosave: AutosaveState | null;
  readonly onRetry: () => void;
  readonly onChooseVersion: () => void;
}) => {
  const kind = saveStatusOf(saveMode, autosave);
  const text =
    kind === "error" && autosave?.error
      ? autosave.error.message
      : statusText[kind];
  const announced = kind === "error" || kind === "conflict";
  return (
    <span className={styles.saveStatus} data-save-status={kind}>
      <span aria-hidden={announced ? undefined : true}>{text}</span>
      <span aria-live="polite" className={styles.visuallyHidden} role="status">
        {announced ? text : ""}
      </span>
      {kind === "error" ? (
        <button className={styles.inlineAction} onClick={onRetry} type="button">
          重试
        </button>
      ) : kind === "conflict" ? (
        <button
          className={styles.inlineAction}
          onClick={onChooseVersion}
          type="button"
        >
          选择版本
        </button>
      ) : null}
    </span>
  );
};
