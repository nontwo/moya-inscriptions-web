"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useStagedItems, useUploadSession } from "../../publishing-provider";
import { useEditorSession } from "../editor/editor-session-provider";
import { CoverCropDialog } from "./cover-crop-dialog";
import { attachDropGuard } from "./drop-guard";
import { MediaEditDialog } from "./media-edit-dialog";
import {
  appendItems,
  confirmedItems,
  indexOfKey,
  moveBy,
  moveToIndex,
  removeItem,
  replaceItem,
  setCover,
  setCoverCrop,
  setItemEdit,
  withValidCover,
} from "./media-order";
import { MediaPicker } from "./media-picker";
import { derivativeExpected, itemStatus } from "./media-status";
import { MediaStrip } from "./media-strip";
import { mediaUiFor, useMediaUiState } from "./media-ui-store";
import styles from "./media.module.css";
import { attachPasteCapture } from "./paste-capture";
import { StagedChoices } from "./staged-choices";

import type { MediaValue } from "./media-order";
import type { RetryPlan } from "./media-status";
import type { MediaDialog } from "./media-ui-store";
import type {
  ConfirmedSource,
  FileOrigin,
  StagedEntry,
} from "../../import-grouping";
import type { UploadItemPhase, UploadItemView } from "../../upload-manager";
import type { EditorSessionHandle } from "../editor/editor-session-provider";
import type { MediaCrop, MediaEdit, WorkDraftItem } from "@moya/contracts";

/**
 * Step 1 of the phone editor, or the media column of the desktop editor
 * (§11 items 3 and 4): selection (picker, drop, paste) into staging with the
 * required explicit choices, confirmation under the session's 原图画质
 * switch, and the ordered strip of items with their upload state, cover,
 * edits and removal.
 *
 * The album lives in the editor session (`useEditorSession(sessionKey)`);
 * this section changes it only through the session's media actions. Upload
 * identities follow the manager through `syncManagedItems` (never an edit).
 * Removing an item cancels it through the runtime first, so the runtime
 * never puts it back. The open dialog, a pending re-selection and the last
 * notice belong to the session too (media-ui-store.ts): the section is
 * unmounted by every phone step change and layout swap.
 */

export type MediaSectionLayout = "phone" | "desktop";

export interface MediaSectionProps {
  readonly sessionKey: string;
  readonly layout: MediaSectionLayout;
  /** 跳过，只发布文字 for the phone steps, when the step shows it here. */
  readonly onSkip?: () => void;
}

const sourceFiles = (source: ConfirmedSource["source"]): File[] =>
  source.kind === "live" && source.layout === "pair"
    ? [source.still.file, source.motion.file]
    : [source.still.file];

const stagedFiles = (entry: StagedEntry): File[] => {
  switch (entry.status) {
    case "ready":
      return sourceFiles(entry.source);
    case "needs_counterpart":
    case "container_invalid":
      return [entry.still.file];
    case "needs_still":
      return [entry.motion.file];
    case "ambiguous":
      return [...entry.stills, ...entry.motions].map((file) => file.file);
    case "unsupported":
      return [entry.file];
  }
};

/** The manager still counts this item against the limit. */
const holdsSlot = (view: UploadItemView | undefined) =>
  view !== undefined && view.phase !== "cancelled" && view.phase !== "cleanup";

const coverFallbackNotice = (value: MediaValue) =>
  value.items.length > 0
    ? "封面已移除，现在以第 1 项作为封面"
    : "封面已移除，没有图片时作品以文字展示";

const qualityText = (mode: WorkDraftItem["qualityMode"]) =>
  mode === "original" ? "原图" : mode === "standard" ? "标准" : null;

const announcedPhases: Partial<Record<UploadItemPhase, string>> = {
  ready: "已就绪",
  failed: "上传失败",
  needs_choice: "需要选择",
  missing_local: "缺少本地文件",
  paused: "已暂停",
};

const RESELECT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,video/quicktime,video/mp4,.mov";

const SELECTION_UNAVAILABLE = "暂时无法添加图片";

const MediaSectionBody = ({
  editor,
  layout,
  onSkip,
}: {
  readonly editor: EditorSessionHandle;
  readonly layout: MediaSectionLayout;
  readonly onSkip: (() => void) | undefined;
}) => {
  const session = useUploadSession();
  const staged = useStagedItems();
  const rootRef = useRef<HTMLDivElement>(null);
  const { state, actions } = editor;
  const ui = mediaUiFor(actions);
  const { dialog, replacement, notice } = useMediaUiState(ui);
  const uploads = session.uploads;
  const staging = staged.staging;
  const maxItems = session.limits?.maxItems ?? 50;
  const value = useMemo<MediaValue>(
    () => ({
      items: state.items,
      coverKey: state.coverKey,
      coverCrop: state.coverCrop,
    }),
    [state.items, state.coverKey, state.coverCrop],
  );

  const views = useMemo(
    () =>
      new Map<string, UploadItemView>(
        (uploads?.items ?? []).map((item) => [item.key, item]),
      ),
    [uploads],
  );

  const [announcement, setAnnouncement] = useState("");
  const announce = useCallback((message: string) => {
    // A repeated message still reaches screen readers.
    setAnnouncement((current) =>
      current === message ? `${message}\u200b` : message,
    );
  }, []);
  /** Shows a notice (kept by the session) and says it with `lead`, politely. */
  const showNotice = useCallback(
    (text: string | null, lead: string | null = null) => {
      ui.setNotice(text);
      const spoken = [lead, text].filter((part) => part !== null).join("。");
      if (spoken !== "") announce(spoken);
    },
    [ui, announce],
  );
  const [stageError, setStageError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const reselectInput = useRef<HTMLInputElement>(null);
  const reselectTarget = useRef<string | null>(null);
  const pendingFocus = useRef<string | null>(null);

  const canSelect = session.accountId !== null && session.session !== null;

  /** The album right now (the session store answers synchronously). */
  const current = useCallback(() => actions.media(), [actions]);

  // -- following the upload manager -----------------------------------------

  useEffect(() => {
    if (uploads === null) return;
    // Identities and newly confirmed items follow the manager (not an edit).
    actions.syncManagedItems(session.draftItems());
    const cancelled = uploads.items.filter(
      (item) =>
        item.phase === "cancelled" && indexOfKey(current(), item.key) >= 0,
    );
    if (cancelled.length === 0) return;
    // Cancelled on the account elsewhere: it is no longer part of the work.
    let next = current();
    let coverRemoved = false;
    for (const item of cancelled) {
      const removed = removeItem(next, item.key);
      next = removed.value;
      coverRemoved ||= removed.coverRemoved;
      session.forgetItem(item.key);
    }
    actions.setMedia(next);
    const gone = `${cancelled.length} 项已不可用，已从作品中移除`;
    showNotice(coverRemoved ? `${gone}；${coverFallbackNotice(next)}` : gone);
  }, [uploads, session, actions, current, showNotice]);

  useEffect(() => {
    const checked = withValidCover(value);
    if (!checked.coverRemoved) return;
    actions.setMedia(checked.value);
    showNotice(coverFallbackNotice(checked.value));
  }, [value, actions, showNotice]);

  // A dialog whose item left the album (removed elsewhere, another version) ends.
  useEffect(() => {
    if (dialog !== null && indexOfKey(value, dialog.key) < 0) ui.closeDialog();
  }, [dialog, value, ui]);

  // A re-selection ends with its target, or when its files leave staging.
  useEffect(() => {
    if (replacement === null) return;
    if (indexOfKey(value, replacement.target) < 0) {
      ui.setReplacement(null);
      return;
    }
    const present =
      staging !== null &&
      staging.batch.entries.some((entry) =>
        stagedFiles(entry).some((file) => replacement.files.has(file)),
      );
    if (present) ui.markReplacementStaged();
    else if (replacement.staged && (staging?.identifying ?? 0) === 0)
      ui.setReplacement(null);
  }, [replacement, staging, value, ui]);

  const phases = useRef(new Map<string, UploadItemPhase>());
  useEffect(() => {
    if (uploads === null) return;
    const messages: string[] = [];
    for (const item of uploads.items) {
      const before = phases.current.get(item.key);
      const text = announcedPhases[item.phase];
      if (before === undefined || before === item.phase || text === undefined)
        continue;
      const index = indexOfKey(current(), item.key);
      if (index < 0) continue;
      messages.push(
        item.phase === "failed" && item.failure !== null
          ? `第 ${index + 1} 项${text}：${item.failure.message}`
          : `第 ${index + 1} 项${text}`,
      );
    }
    phases.current = new Map(
      uploads.items.map((item) => [item.key, item.phase]),
    );
    if (messages.length > 0) announce(messages.join("；"));
  }, [uploads, announce, current]);

  // Focus follows the author's action when the control it was on goes away.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const root = rootRef.current;
    if (!root) return;
    root
      .querySelector<HTMLElement>(
        target === "picker" ? "[data-media-picker] button" : target,
      )
      ?.focus();
  });

  // -- selection -----------------------------------------------------------

  const stage = useCallback(
    (files: readonly File[], origin: FileOrigin, onFailed?: () => void) => {
      if (files.length === 0) return;
      setStageError(null);
      setConfirmError(null);
      staged.stageFiles(files, origin).catch(() => {
        onFailed?.();
        setStageError("文件无法读取，请重新选择");
      });
    },
    [staged],
  );
  const refuse = useCallback(() => announce(SELECTION_UNAVAILABLE), [announce]);
  const latest = useRef({ stage, canSelect, refuse });
  useEffect(() => {
    latest.current = { stage, canSelect, refuse };
  });

  useEffect(() => {
    const modalOpen = () => document.querySelector("dialog[open]") !== null;
    const detachPaste = attachPasteCapture(
      document,
      (files) => latest.current.stage(files, "paste"),
      () => latest.current.canSelect && !modalOpen(),
    );
    const detachDrop = attachDropGuard(document, {
      root: () => rootRef.current,
      availability: () =>
        modalOpen()
          ? "blocked"
          : latest.current.canSelect
            ? "accept"
            : "disabled",
      onFiles: (files) => latest.current.stage(files, "drop"),
      onRefused: () => latest.current.refuse(),
    });
    return () => {
      detachPaste();
      detachDrop();
    };
  }, []);

  /** The re-selection whose files are ready to confirm now, if any. */
  const readyReplacement = () => {
    const pending = ui.get().replacement;
    if (
      pending === null ||
      staging === null ||
      indexOfKey(current(), pending.target) < 0
    )
      return null;
    const ready = staging.batch.entries.some(
      (entry) =>
        entry.status === "ready" &&
        stagedFiles(entry).some((file) => pending.files.has(file)),
    );
    return ready ? pending : null;
  };
  const replacementNow = readyReplacement();
  const limitCredit =
    replacementNow !== null && holdsSlot(views.get(replacementNow.target))
      ? 1
      : 0;

  const confirm = () => {
    if (session.session === null) {
      setConfirmError("本次编辑已结束，无法添加");
      return;
    }
    const original = actions.get().originalNext;
    if (staging !== null && staging.batch.original !== original)
      staged.setOriginal(original);
    const pending = readyReplacement();
    // The missing item gives its place (and its slot in the limit) to its
    // replacement: cancelled first, only when the confirmation then fits.
    let cancelledTarget: Promise<void> | null = null;
    if (
      pending !== null &&
      staging !== null &&
      staging.identifying === 0 &&
      staging.count.overBy <= limitCredit
    )
      cancelledTarget = session.cancelItem(pending.target);
    const result = staged.confirm();
    if (!result.ok) {
      setConfirmError(
        result.error === "items_limit"
          ? `作品最多 ${maxItems} 项，请先移除部分内容`
          : "没有可以添加的项",
      );
      return;
    }
    setConfirmError(null);
    const added = confirmedItems(result.confirmed);
    let next = current();
    let replaced: number | null = null;
    if (pending !== null) {
      const replacing = added
        .filter((_, index) =>
          sourceFiles(result.confirmed[index]!.source).some((file) =>
            pending.files.has(file),
          ),
        )
        // The rotation and crop travel when the kind is the same.
        .map((item) =>
          item.kind === pending.previous.kind
            ? { ...item, edit: pending.previous.edit }
            : item,
        );
      if (replacing.length > 0) {
        const target = pending.target;
        replaced = indexOfKey(next, target) + 1;
        next = replaceItem(next, target, replacing);
        void (cancelledTarget ?? session.cancelItem(target)).then(() =>
          session.forgetItem(target),
        );
        ui.setReplacement(null);
      }
    }
    actions.setMedia(appendItems(next, added));
    // 原图画质 applies to one batch; entries still waiting for a choice belong to it.
    if (result.remaining === null) actions.setOriginalNext(false);
    announce(
      `已添加 ${added.length} 项，${original ? "原图" : "标准"}画质${
        replaced === null ? "" : `，已替换第 ${replaced} 项`
      }`,
    );
  };

  const cancelStaging = () => {
    staged.cancel();
    ui.setReplacement(null);
    setConfirmError(null);
  };

  // -- item actions --------------------------------------------------------

  const move = (key: string, offset: -1 | 1) => {
    const before = current();
    const from = indexOfKey(before, key);
    const next = moveBy(before, key, offset);
    if (next === before) return;
    const to = from + offset;
    if (to === 0 || to === next.items.length - 1)
      // The button used is disabled at the edge: focus moves to its sibling.
      pendingFocus.current = `[data-media-key="${key}"] [data-media-action="${
        to === 0 ? "down" : "up"
      }"]`;
    actions.setMedia(next);
    announce(`第 ${from + 1} 项已移到第 ${to + 1} 位`);
  };

  const reorder = (key: string, index: number) =>
    actions.setMedia(moveToIndex(current(), key, index));

  const remove = (key: string) => {
    const before = current();
    const index = indexOfKey(before, key);
    if (index < 0) return;
    const view = views.get(key);
    // Cancelled through the runtime before the album changes (never re-added).
    const cancelled =
      view === undefined ||
      view.phase === "cleanup" ||
      view.phase === "cancelled"
        ? Promise.resolve()
        : session.cancelItem(key);
    const result = removeItem(before, key);
    const neighbour =
      result.value.items[index]?.key ?? result.value.items[index - 1]?.key;
    pendingFocus.current =
      neighbour === undefined ? "picker" : `[data-media-handle="${neighbour}"]`;
    actions.setMedia(result.value);
    void cancelled.then(() => session.forgetItem(key));
    if (ui.get().replacement?.target === key) ui.setReplacement(null);
    showNotice(
      result.coverRemoved ? coverFallbackNotice(result.value) : null,
      `已移除第 ${index + 1} 项`,
    );
  };

  const chooseCover = (key: string) => {
    const before = current();
    actions.setMedia(setCover(before, key));
    ui.setNotice(null);
    announce(`已将第 ${indexOfKey(before, key) + 1} 项设为封面`);
  };

  const applyEdit = (key: string, edit: MediaEdit) => {
    const number = indexOfKey(current(), key) + 1;
    const result = setItemEdit(current(), key, edit);
    if (result.value === current()) return;
    actions.setMedia(result.value);
    const lead = `第 ${number} 项的编辑已应用`;
    if (result.coverCropReset)
      showNotice("图片编辑后，封面构图已恢复为完整画面，可重新调整", lead);
    else announce(lead);
  };

  const applyCoverCrop = (key: string, crop: MediaCrop | null) => {
    const before = current();
    const next = setCoverCrop(before, key, crop);
    if (next === before) return;
    actions.setMedia(next);
    ui.setNotice(null);
    announce("封面构图已更新");
  };

  const retry = (key: string, plan: RetryPlan) => {
    switch (plan.type) {
      case "processing":
        void session.retryProcessing(key);
        return;
      case "registration":
        session.retryRegistration(key);
        return;
      case "components":
        for (const role of plan.roles) void session.retryComponent(key, role);
    }
  };

  const reselect = (key: string) => {
    reselectTarget.current = key;
    // Opened directly from the author's click (browsers require the gesture).
    reselectInput.current?.click();
  };

  const startReplacement = (target: string, files: File[]) => {
    const item = current().items.find((entry) => entry.key === target);
    if (item === undefined) return;
    ui.setReplacement({
      target,
      files: new Set(files),
      staged: false,
      previous: {
        kind: item.kind,
        qualityMode: item.qualityMode,
        edit: item.edit,
      },
    });
    // A lone re-selection keeps the missing item's quality; a batch in
    // progress keeps the author's switch (the note names the old mode).
    if (staging === null && item.qualityMode !== "legacy")
      actions.setOriginalNext(item.qualityMode === "original");
    stage(files, "picker", () => ui.setReplacement(null));
  };

  // -- rendering -----------------------------------------------------------

  const paused =
    uploads !== null &&
    (uploads.status === "paused" ||
      uploads.items.some((item) => item.phase === "paused"));
  const dialogItem =
    dialog === null
      ? null
      : (value.items.find((item) => item.key === dialog.key) ?? null);
  const dialogServer =
    dialogItem === null
      ? null
      : (views.get(dialogItem.key)?.serverItem ??
        (dialogItem.itemId === null
          ? null
          : (state.serverItems[dialogItem.itemId] ?? null)));
  const dialogNumber =
    dialogItem === null ? 0 : indexOfKey(value, dialogItem.key) + 1;
  const loaded = state.phase === "ready" && uploads !== null;
  const dialogDerivative =
    dialogItem === null
      ? true
      : derivativeExpected(
          itemStatus(views.get(dialogItem.key), dialogServer ?? undefined, {
            loaded,
            item: dialogItem,
          }),
        );
  const replacementIndex =
    replacement === null ? -1 : indexOfKey(value, replacement.target);
  const replacementNote = (() => {
    if (replacement === null || replacementIndex < 0) return null;
    const mode = qualityText(replacement.previous.qualityMode);
    const keepsEdit =
      replacement.previous.edit.rotation !== 0 ||
      replacement.previous.edit.crop !== null;
    return `确认后，新选择的文件将替换第 ${replacementIndex + 1} 项${
      mode === null ? "" : `（原为${mode}画质）`
    }${keepsEdit ? "，同类文件沿用原来的旋转和裁剪" : ""}`;
  })();
  const showSkip =
    layout === "phone" &&
    onSkip !== undefined &&
    value.items.length === 0 &&
    staging === null;
  const openDialog = (next: MediaDialog) => ui.openDialog(next);

  return (
    <div
      ref={rootRef}
      className={styles.section}
      data-layout={layout}
      data-media-section={state.key}
    >
      <p className={styles.count}>
        {`已添加 ${value.items.length} 项，最多 ${maxItems} 项`}
      </p>

      <MediaPicker
        disabled={!canSelect}
        disabledReason={SELECTION_UNAVAILABLE}
        layout={layout}
        onFiles={(files, origin) => stage(files, origin)}
        onRefused={refuse}
      />
      <input
        ref={reselectInput}
        accept={RESELECT_ACCEPT}
        aria-label="重新选择缺少的文件"
        hidden
        multiple
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          const target = reselectTarget.current;
          reselectTarget.current = null;
          if (files.length === 0 || target === null) return;
          startReplacement(target, files);
        }}
        tabIndex={-1}
        type="file"
      />
      {stageError !== null && (
        <p className={styles.fieldError} role="alert">
          {stageError}
        </p>
      )}

      {staging !== null && (
        <StagedChoices
          confirmError={confirmError}
          limitCredit={limitCredit}
          onAttach={(key, file) => staged.attachCounterpart(key, file)}
          onCancel={cancelStaging}
          onConfirm={confirm}
          onKeepStill={(key) => {
            staged.keepStill(key);
          }}
          onRemove={(key) => {
            staged.remove(key);
          }}
          onResolve={(key, still, motion) =>
            staged.resolveAmbiguous(key, still, motion)
          }
          originalQuality={state.originalNext}
          replacementNote={replacementNote}
          staging={staging}
        />
      )}

      {paused && (
        <div className={styles.notice} data-media-paused="">
          <p>
            {uploads?.pauseReason === "account"
              ? "账户状态已变化，上传已暂停"
              : "上传已暂停，确认网络正常后可继续"}
          </p>
          <button
            className={styles.secondaryButton}
            onClick={() => void session.continueUploads()}
            type="button"
          >
            继续上传
          </button>
        </div>
      )}

      {notice !== null && (
        <div className={styles.notice} data-media-notice="">
          <p>{notice}</p>
          <button
            className={styles.textButton}
            onClick={() => ui.setNotice(null)}
            type="button"
          >
            知道了
          </button>
        </div>
      )}

      {value.items.length > 0 && (
        <MediaStrip
          coverKey={value.coverKey}
          id={`media-strip-${state.key}`}
          items={value.items}
          label="已添加的图片，可调整顺序"
          loaded={loaded}
          localStill={session.localStill}
          onChooseOriginal={(key) => session.chooseOriginal(key)}
          onComposeCover={(key) => openDialog({ type: "cover", key })}
          onEdit={(key) => openDialog({ type: "edit", key })}
          onMove={move}
          onRemove={remove}
          onReorder={reorder}
          onReselect={reselect}
          onRetry={retry}
          onSetCover={chooseCover}
          serverItems={state.serverItems}
          views={views}
        />
      )}

      {showSkip && (
        <button
          className={styles.skipButton}
          data-media-skip=""
          onClick={onSkip}
          type="button"
        >
          跳过，只发布文字
        </button>
      )}

      <div
        aria-live="polite"
        className={styles.visuallyHidden}
        data-media-announcer=""
        role="status"
      >
        {announcement}
      </div>

      {dialog?.type === "edit" && dialogItem !== null && (
        <MediaEditDialog
          blob={session.localStill(dialogItem.key)}
          derivativeExpected={dialogDerivative}
          edit={dialogItem.edit}
          initialDraft={ui.draftFor(dialog)}
          itemNumber={dialogNumber}
          kind={dialogItem.kind}
          knownSize={dialogServer?.presentation ?? null}
          onApply={(edit) => applyEdit(dialogItem.key, edit)}
          onClose={() => ui.closeDialog()}
          onDraftChange={(draft) => ui.saveDraft(dialog, draft)}
          src={dialogServer?.media?.displaySrc ?? null}
        />
      )}
      {dialog?.type === "cover" && dialogItem !== null && (
        <CoverCropDialog
          blob={session.localStill(dialogItem.key)}
          coverCrop={value.coverKey === dialogItem.key ? value.coverCrop : null}
          derivativeExpected={dialogDerivative}
          edit={dialogItem.edit}
          initialDraft={ui.draftFor(dialog)}
          itemNumber={dialogNumber}
          onApply={(crop) => applyCoverCrop(dialogItem.key, crop)}
          onClose={() => ui.closeDialog()}
          onDraftChange={(draft) => ui.saveDraft(dialog, draft)}
          src={dialogServer?.media?.displaySrc ?? null}
        />
      )}
    </div>
  );
};

export const MediaSection = ({
  sessionKey,
  layout,
  onSkip,
}: MediaSectionProps) => {
  const editor = useEditorSession(sessionKey);
  // The session ended (submitted or discarded): nothing to show.
  if (editor === null) return null;
  return (
    <MediaSectionBody
      key={sessionKey}
      editor={editor}
      layout={layout}
      onSkip={onSkip}
    />
  );
};
