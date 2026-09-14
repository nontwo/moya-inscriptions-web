"use client";

import { AuthorshipFields } from "./authorship-fields";
import { bodyRule, checkEditorText, titleRule } from "./editor-text";
import { TextField } from "./text-field";
import { VisibilityField } from "./visibility-field";
import styles from "./editor.module.css";

import type {
  EditorSessionState,
  EditorSessionStore,
} from "./editor-session-state";
import type { ReactNode } from "react";

/** The non-blocking recommendation (C03): a title and an image are suggested, never required. */
export const recommendationText = (
  state: EditorSessionState,
): string | null => {
  const hasTitle = checkEditorText(state.title, titleRule).length > 0;
  const hasMedia = state.items.length > 0;
  if (hasTitle && hasMedia) return null;
  return !hasTitle && !hasMedia
    ? "建议添加标题和图片"
    : !hasTitle
      ? "建议添加标题"
      : "建议添加图片";
};

export const TitleField = ({
  state,
  store,
  autoFocus = false,
}: {
  readonly state: EditorSessionState;
  readonly store: EditorSessionStore;
  readonly autoFocus?: boolean;
}) => (
  <TextField
    autoFocus={autoFocus}
    error={state.fieldErrors.title ?? null}
    field="title"
    label="标题"
    onChange={store.setTitle}
    optional
    placeholder="添加标题"
    rule={titleRule}
    value={state.title}
  />
);

export const BodyField = ({
  state,
  store,
}: {
  readonly state: EditorSessionState;
  readonly store: EditorSessionStore;
}) => (
  <TextField
    error={state.fieldErrors.body ?? null}
    field="body"
    hint="保留换行；首尾的空白不计入字数"
    label="正文"
    multiline
    onChange={store.setBody}
    optional
    placeholder="写下作品的说明、释文或心得"
    rule={bodyRule}
    value={state.body}
  />
);

/**
 * Step 2 (phone) and the desktop text column (E04–E05): title, body,
 * authorship, visibility and the draft mode; upload progress stays visible
 * through the editor's own status line.
 */
export const TextSettings = ({
  state,
  store,
  draftMode,
  progress,
  autoFocusTitle = false,
}: {
  readonly state: EditorSessionState;
  readonly store: EditorSessionStore;
  /** The 保存草稿到账号 switch, repeated here for text-only works. */
  readonly draftMode?: ReactNode;
  /** Upload progress summary kept visible while typing. */
  readonly progress?: ReactNode;
  readonly autoFocusTitle?: boolean;
}) => {
  const recommendation = recommendationText(state);
  return (
    <div className={styles.fields} data-editor-text-settings="">
      {progress}
      <TitleField autoFocus={autoFocusTitle} state={state} store={store} />
      <BodyField state={state} store={store} />
      {recommendation === null ? null : (
        <p className={styles.hint} data-editor-recommendation="">
          {recommendation}
        </p>
      )}
      <AuthorshipFields state={state} store={store} />
      <VisibilityField state={state} store={store} />
      {draftMode === undefined ? null : (
        <div className={styles.field}>
          <span className={styles.label}>草稿</span>
          {draftMode}
        </div>
      )}
    </div>
  );
};
