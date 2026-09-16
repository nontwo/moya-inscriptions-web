"use client";

import { useId, useRef, useState } from "react";

import { unsupportedReasonText } from "../../import-grouping";
import { THUMBNAIL_EDGE } from "./bounded-preview";
import { useBoundedPreview } from "./media-preview";
import styles from "./media.module.css";

import type {
  IdentifiedMotion,
  IdentifiedStill,
  StagedEntry,
  StagingChoiceError,
} from "../../import-grouping";
import type { StagingView } from "../../publishing-runtime";

/**
 * The staging batch between selection and upload (Q02, L03): grouping
 * results, the explicit choice each incomplete Live Photo needs, and one
 * confirmation under the batch quality mode. Nothing is transferred until
 * the author confirms.
 */

const COUNTERPART_ACCEPT = {
  motion: "video/quicktime,video/mp4,.mov,.mp4",
  still: "image/jpeg,image/heic,image/heif,.heic,.heif,.jpg,.jpeg",
} as const;

const choiceErrorText = (
  error: StagingChoiceError,
  wanted: "motion" | "still",
): string => {
  switch (error) {
    case "pairing_mismatch":
      return wanted === "motion"
        ? "所选视频与这张照片不属于同一张实况照片"
        : "所选照片与这个视频不属于同一张实况照片";
    case "choice_invalid":
      return wanted === "motion"
        ? "请选择与这张照片对应的 MOV 或 MP4 视频文件"
        : "请选择与这个视频对应的照片文件";
    case "entry_missing":
      return "这一项已不在待添加列表中";
  }
};

export interface StagedChoicesProps {
  readonly staging: StagingView;
  readonly originalQuality: boolean;
  /** "重新选择的文件将替换第 N 项" while a missing item is being re-selected. */
  readonly replacementNote: string | null;
  /**
   * Items the confirmation frees at the same time (a missing item replaced
   * by its re-selected file), so they do not count against the limit.
   */
  readonly limitCredit?: number;
  readonly confirmError: string | null;
  readonly onRemove: (key: string) => void;
  readonly onKeepStill: (key: string) => void;
  readonly onAttach: (
    key: string,
    file: File,
  ) => Promise<StagingChoiceError | null>;
  readonly onResolve: (
    key: string,
    stillIndex: number,
    motionIndex: number,
  ) => StagingChoiceError | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

const StillThumb = ({ still }: { readonly still: IdentifiedStill }) => {
  // A bounded copy: a batch of camera originals is never decoded at full size here.
  const { url } = useBoundedPreview(still.file, THUMBNAIL_EDGE);
  const [failed, setFailed] = useState(false);
  return (
    <span aria-hidden="true" className={styles.stagedThumb}>
      {url !== null && !failed ? (
        <img
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          src={url}
        />
      ) : (
        <span>照片</span>
      )}
    </span>
  );
};

const MotionThumb = () => (
  <span aria-hidden="true" className={styles.stagedThumb}>
    <span>视频</span>
  </span>
);

const fileLabel = (file: File, pasted: boolean) =>
  pasted ? "来自剪贴板" : file.name || "未命名文件";

const entryTitle = (entry: StagedEntry): string => {
  switch (entry.status) {
    case "ready":
      return entry.source.kind === "live" ? "实况照片" : "照片";
    case "needs_counterpart":
      return "实况照片缺少视频";
    case "needs_still":
      return "实况照片缺少照片";
    case "ambiguous":
      return "需要选择实况照片的配对";
    case "container_invalid":
      return "无法验证内嵌视频";
    case "unsupported":
      return "无法添加";
  }
};

const entryFileName = (entry: StagedEntry): string => {
  switch (entry.status) {
    case "ready":
      return fileLabel(entry.source.still.file, entry.pasted === true);
    case "needs_counterpart":
    case "container_invalid":
      return fileLabel(entry.still.file, false);
    case "needs_still":
      return fileLabel(entry.motion.file, false);
    case "ambiguous":
      return `${entry.stills.length} 张照片，${entry.motions.length} 个视频`;
    case "unsupported":
      return fileLabel(entry.file, false);
  }
};

const AmbiguousChoice = ({
  entryKey,
  stills,
  motions,
  onResolve,
}: {
  readonly entryKey: string;
  readonly stills: readonly IdentifiedStill[];
  readonly motions: readonly IdentifiedMotion[];
  readonly onResolve: (stillIndex: number, motionIndex: number) => void;
}) => {
  const name = useId();
  const [still, setStill] = useState(0);
  const [motion, setMotion] = useState(0);
  return (
    <div className={styles.pairing} data-staged-pairing={entryKey}>
      <fieldset>
        <legend>照片</legend>
        {stills.map((candidate, index) => (
          <label key={index}>
            <input
              checked={still === index}
              name={`${name}-still`}
              onChange={() => setStill(index)}
              type="radio"
            />
            <span>{fileLabel(candidate.file, false)}</span>
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>视频</legend>
        {motions.map((candidate, index) => (
          <label key={index}>
            <input
              checked={motion === index}
              name={`${name}-motion`}
              onChange={() => setMotion(index)}
              type="radio"
            />
            <span>{fileLabel(candidate.file, false)}</span>
          </label>
        ))}
      </fieldset>
      <button
        className={styles.secondaryButton}
        onClick={() => onResolve(still, motion)}
        type="button"
      >
        确认配对
      </button>
    </div>
  );
};

export const StagedChoices = ({
  staging,
  originalQuality,
  replacementNote,
  limitCredit = 0,
  confirmError,
  onRemove,
  onKeepStill,
  onAttach,
  onResolve,
  onConfirm,
  onCancel,
}: StagedChoicesProps) => {
  const headingId = useId();
  const counterpartInput = useRef<HTMLInputElement>(null);
  const counterpartTarget = useRef<{
    readonly key: string;
    readonly wanted: "motion" | "still";
  } | null>(null);
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(
    () => new Map(),
  );
  const setError = (key: string, message: string | null) =>
    setErrors((current) => {
      const next = new Map(current);
      if (message === null) next.delete(key);
      else next.set(key, message);
      return next;
    });

  const pickCounterpart = (key: string, wanted: "motion" | "still") => {
    const input = counterpartInput.current;
    if (!input) return;
    counterpartTarget.current = { key, wanted };
    input.accept = COUNTERPART_ACCEPT[wanted];
    // Opened directly from the author's click (browsers require the gesture).
    input.click();
  };

  const { batch, count, identifying } = staging;
  const overBy = Math.max(0, count.overBy - limitCredit);
  const quality = originalQuality ? "原图" : "标准";
  const summary = [
    identifying > 0 ? `正在识别 ${identifying} 个文件` : null,
    count.ready > 0 ? `可添加 ${count.ready} 项` : null,
    count.unresolved > 0 ? `${count.unresolved} 项需要选择` : null,
    count.unsupported > 0 ? `${count.unsupported} 项无法添加` : null,
  ]
    .filter((part): part is string => part !== null)
    .join("，");

  return (
    <section
      aria-labelledby={headingId}
      className={styles.staged}
      data-media-staging=""
    >
      <div className={styles.stagedHeader}>
        <h3 id={headingId}>待添加</h3>
        <p className={styles.stagedSummary}>{summary || "没有待添加的文件"}</p>
      </div>
      {replacementNote !== null && (
        <p className={styles.stagedNote}>{replacementNote}</p>
      )}
      <input
        ref={counterpartInput}
        aria-label="补选实况照片的另一部分"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          const target = counterpartTarget.current;
          counterpartTarget.current = null;
          if (!file || target === null) return;
          setError(target.key, null);
          onAttach(target.key, file).then(
            (error) =>
              setError(
                target.key,
                error === null ? null : choiceErrorText(error, target.wanted),
              ),
            () => setError(target.key, "文件无法读取，请重新选择"),
          );
        }}
        tabIndex={-1}
        type="file"
      />
      <ul className={styles.stagedList}>
        {batch.entries.map((entry) => {
          const error = errors.get(entry.key) ?? null;
          const errorId = `${headingId}-${entry.key}-error`;
          return (
            <li
              aria-describedby={error === null ? undefined : errorId}
              className={styles.stagedEntry}
              data-staged-key={entry.key}
              data-staged-status={entry.status}
              key={entry.key}
            >
              {entry.status === "ready" ? (
                <StillThumb still={entry.source.still} />
              ) : entry.status === "needs_still" ? (
                <MotionThumb />
              ) : entry.status === "ambiguous" ? (
                <StillThumb still={entry.stills[0]!} />
              ) : entry.status === "unsupported" ? (
                <span aria-hidden="true" className={styles.stagedThumb}>
                  <span>文件</span>
                </span>
              ) : (
                <StillThumb still={entry.still} />
              )}
              <div className={styles.stagedInfo}>
                <p className={styles.stagedTitle}>
                  <strong>{entryTitle(entry)}</strong>
                  {entry.status === "ready" && entry.pasted === true && (
                    <span
                      className={styles.badge}
                      title="剪贴板中的图片不是相机原始文件"
                    >
                      来自剪贴板
                    </span>
                  )}
                </p>
                <p className={styles.stagedFile}>{entryFileName(entry)}</p>
                {entry.status === "needs_counterpart" && (
                  <p className={styles.stagedMessage}>
                    这张照片属于实况照片，但没有找到对应的视频。可以补选视频，或只作为静态照片添加。
                  </p>
                )}
                {entry.status === "needs_still" && (
                  <p className={styles.stagedMessage}>
                    这个视频属于实况照片，但没有找到对应的照片。请补选照片，或移除。
                  </p>
                )}
                {entry.status === "container_invalid" && (
                  <p className={styles.stagedMessage}>
                    这张照片声明内嵌了动态视频，但无法验证。可以作为静态照片添加，或移除。
                  </p>
                )}
                {entry.status === "unsupported" && (
                  <p className={styles.stagedMessage}>
                    {unsupportedReasonText[entry.reason]}
                  </p>
                )}
                {entry.status === "ambiguous" && (
                  <>
                    <p className={styles.stagedMessage}>
                      多个文件属于同一张实况照片，请选择要配对的照片和视频。
                    </p>
                    <AmbiguousChoice
                      entryKey={entry.key}
                      motions={entry.motions}
                      onResolve={(still, motion) => {
                        const result = onResolve(entry.key, still, motion);
                        setError(
                          entry.key,
                          result === null
                            ? null
                            : choiceErrorText(result, "motion"),
                        );
                      }}
                      stills={entry.stills}
                    />
                  </>
                )}
                {error !== null && (
                  <p className={styles.fieldError} id={errorId} role="alert">
                    {error}
                  </p>
                )}
                <div className={styles.actions}>
                  {entry.status === "needs_counterpart" && (
                    <button
                      className={styles.actionButton}
                      onClick={() => pickCounterpart(entry.key, "motion")}
                      type="button"
                    >
                      补选动态文件
                    </button>
                  )}
                  {entry.status === "needs_still" && (
                    <button
                      className={styles.actionButton}
                      onClick={() => pickCounterpart(entry.key, "still")}
                      type="button"
                    >
                      补选照片
                    </button>
                  )}
                  {(entry.status === "needs_counterpart" ||
                    entry.status === "container_invalid") && (
                    <button
                      className={styles.actionButton}
                      onClick={() => {
                        setError(entry.key, null);
                        onKeepStill(entry.key);
                      }}
                      type="button"
                    >
                      作为静态照片
                    </button>
                  )}
                  <button
                    aria-label={`移除${entryTitle(entry)}：${entryFileName(entry)}`}
                    className={styles.actionButton}
                    onClick={() => {
                      setError(entry.key, null);
                      onRemove(entry.key);
                    }}
                    type="button"
                  >
                    移除
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {overBy > 0 && (
        <p className={styles.fieldError} role="alert">
          {`作品最多 ${count.maxItems} 项，请先移除 ${overBy} 项`}
        </p>
      )}
      {confirmError !== null && (
        <p className={styles.fieldError} role="alert">
          {confirmError}
        </p>
      )}
      <div className={styles.stagedActions}>
        <button
          className={styles.secondaryButton}
          onClick={onCancel}
          type="button"
        >
          全部取消
        </button>
        <button
          className={styles.primaryButton}
          disabled={count.ready === 0 || overBy > 0 || identifying > 0}
          onClick={onConfirm}
          type="button"
        >
          {`添加 ${count.ready} 项（${quality}）`}
        </button>
      </div>
    </section>
  );
};
