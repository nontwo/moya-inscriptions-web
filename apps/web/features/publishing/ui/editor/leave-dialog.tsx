"use client";

import { EditorDialog } from "./editor-dialog";
import styles from "./editor.module.css";

/**
 * What leaving would lose (D04, D07):
 * - `saved`: saved-draft mode with changes the account has not confirmed;
 * - `unsaved`: a no-save session (its content exists nowhere else);
 * - `submitting`: the result of 发布 is still being confirmed.
 */
export type LeaveDialogVariant = "saved" | "unsaved" | "submitting";

/** The exact scope of 放弃本次未保存的更改 in saved-draft mode. */
export const savedDiscardScope = (
  hasDraft: boolean,
  unfinishedUploads: number,
): string =>
  `${
    hasDraft
      ? "有更改还没有保存到草稿。放弃会丢弃这些未保存的更改，草稿保留上次保存的内容。"
      : "这些内容还没有保存到账号。放弃后，文字、设置和已添加的图片都会被丢弃，无法找回。"
  }${
    unfinishedUploads > 0
      ? `另有 ${unfinishedUploads} 项图片还没有上传完成，放弃后这些上传会停止。`
      : ""
  }`;

export const LeaveDialog = ({
  variant,
  isEdit,
  hasDraft = true,
  unfinishedUploads = 0,
  saveBlocked = false,
  canChooseVersion = false,
  saving = false,
  error = null,
  onSaveAndLeave,
  onChooseVersion,
  onContinue,
  onDiscard,
}: {
  readonly variant: LeaveDialogVariant;
  readonly isEdit: boolean;
  /** Whether the account holds a draft of this session yet. */
  readonly hasDraft?: boolean;
  /** Items still preparing, uploading or processing. */
  readonly unfinishedUploads?: number;
  /** Two versions wait for a choice: nothing can be saved until then. */
  readonly saveBlocked?: boolean;
  readonly canChooseVersion?: boolean;
  readonly saving?: boolean;
  readonly error?: string | null;
  readonly onSaveAndLeave: () => void;
  readonly onChooseVersion?: () => void;
  readonly onContinue: () => void;
  readonly onDiscard: () => void;
}) => {
  if (variant === "submitting")
    return (
      <EditorDialog
        dataName="leave"
        description={
          <p className={styles.dialogDescription}>
            {isEdit
              ? "更新是否保存成功还在确认中，确认后会打开作品。"
              : "作品是否提交成功还在确认中，确认后会打开作品。"}
          </p>
        }
        onCancel={onContinue}
        title="正在确认结果…"
      >
        <div className={styles.dialogActions}>
          <button
            className={styles.primaryButton}
            onClick={onContinue}
            type="button"
          >
            继续等待
          </button>
        </div>
      </EditorDialog>
    );

  if (variant === "unsaved")
    return (
      <EditorDialog
        dataName="leave"
        description={
          <>
            <p className={styles.dialogDescription}>
              本次编辑没有保存到账号。结束后，文字、设置和已添加的图片都会被丢弃，无法找回。
            </p>
            {isEdit ? (
              <p className={styles.dialogDescription}>已发布的作品不受影响。</p>
            ) : null}
          </>
        }
        onCancel={onContinue}
        title="结束本次编辑？"
      >
        <div className={styles.dialogActions}>
          <button
            className={styles.primaryButton}
            onClick={onContinue}
            type="button"
          >
            返回编辑
          </button>
          <button
            className={styles.textButton}
            onClick={onDiscard}
            type="button"
          >
            放弃并结束
          </button>
        </div>
      </EditorDialog>
    );

  return (
    <EditorDialog
      cancellable={!saving}
      dataName="leave"
      description={
        <>
          <p className={styles.dialogDescription} data-leave-scope="">
            {savedDiscardScope(hasDraft, unfinishedUploads)}
          </p>
          {saveBlocked ? (
            <p className={styles.dialogDescription}>
              {canChooseVersion
                ? "这份草稿有两个版本待选择，选择版本后才能保存。"
                : "这份草稿的版本选择还没有完成，图片上传完成后才能保存。"}
            </p>
          ) : null}
          {error === null ? null : (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </>
      }
      onCancel={onContinue}
      title="离开前保存更改？"
    >
      <div className={styles.dialogActions}>
        {saveBlocked ? (
          canChooseVersion && onChooseVersion !== undefined ? (
            <button
              className={styles.primaryButton}
              onClick={onChooseVersion}
              type="button"
            >
              选择版本
            </button>
          ) : null
        ) : (
          <button
            aria-busy={saving || undefined}
            className={styles.primaryButton}
            disabled={saving}
            onClick={onSaveAndLeave}
            type="button"
          >
            {saving ? "保存中…" : "保存并离开"}
          </button>
        )}
        <button
          className={styles.textButton}
          disabled={saving}
          onClick={onContinue}
          type="button"
        >
          继续编辑
        </button>
        <button
          className={styles.textButton}
          disabled={saving}
          onClick={onDiscard}
          type="button"
        >
          放弃本次未保存的更改
        </button>
      </div>
    </EditorDialog>
  );
};
