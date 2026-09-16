"use client";

import { Icon } from "@moya/ui";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";

import { textExcerpt } from "./drafts-format";
import styles from "./drafts.module.css";

import type { RefObject } from "react";

/**
 * An inline confirmation inside an open panel. A second AuthorDialog would
 * share the first one's history entry, so confirmations stay in the same
 * dialog: focus moves to the safe choice, Escape cancels, and focus returns
 * to the control that asked when the confirmation goes away.
 */
export const ConfirmPanel = ({
  title,
  description,
  confirmLabel,
  busyLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly busyLabel: string;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Read while rendering: the control that asked still has focus then, even
  // when another confirmation's cleanup moves focus during the same commit.
  const [opener] = useState(() =>
    typeof document !== "undefined" &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  useEffect(() => {
    cancelRef.current?.focus();
    return () => {
      if (opener?.isConnected) opener.focus();
    };
  }, [opener]);
  return (
    <div
      aria-describedby={descriptionId}
      aria-labelledby={titleId}
      className={styles.confirm}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        // Keeps the surrounding dialog open: Escape answers this question only.
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onCancel();
      }}
      role="alertdialog"
    >
      <p className={styles.confirmTitle} id={titleId}>
        {title}
      </p>
      <p className={styles.confirmText} id={descriptionId}>
        {description}
      </p>
      {/* Busy buttons stay focusable (aria-disabled), so focus is never
          dropped to the page while the command runs or after it fails. */}
      <div className={styles.actions}>
        <button
          ref={cancelRef}
          aria-disabled={busy || undefined}
          className={styles.button}
          onClick={() => {
            if (!busy) onCancel();
          }}
          type="button"
        >
          取消
        </button>
        <button
          aria-disabled={busy || undefined}
          className={`${styles.button} ${styles.primary}`}
          onClick={() => {
            if (!busy) onConfirm();
          }}
          type="button"
        >
          {busy ? busyLabel : confirmLabel}
        </button>
      </div>
    </div>
  );
};

/**
 * Where focus goes after the row that held it left the list: the list while
 * rows remain, the empty state when none do, otherwise the panel itself
 * (while later pages load). Never a hidden element.
 */
export const useFocusAfterRemoval = (
  count: number,
  refs: {
    readonly list: RefObject<HTMLElement | null>;
    readonly empty: RefObject<HTMLElement | null>;
    readonly panel: RefObject<HTMLElement | null>;
  },
) => {
  const pending = useRef(false);
  useLayoutEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    const target =
      count > 0
        ? refs.list.current
        : (refs.empty.current ?? refs.panel.current);
    target?.focus({ preventScroll: true });
  });
  return () => {
    pending.current = true;
  };
};

/**
 * A small private cover: the derivative when there is one, otherwise the
 * text itself (no fake cover), otherwise a neutral mark.
 */
export const CoverThumb = ({
  src,
  text,
  className = styles.thumb,
  textClassName = styles.thumbText,
  maximum = 24,
  onSettled,
}: {
  readonly src: string | null;
  readonly text: string;
  readonly className?: string | undefined;
  readonly textClassName?: string | undefined;
  readonly maximum?: number;
  readonly onSettled?: (() => void) | undefined;
}) => {
  const [failed, setFailed] = useState<string | null>(null);
  const excerpt = textExcerpt(text, maximum);
  return (
    <div aria-hidden="true" className={className}>
      {src !== null && failed !== src ? (
        <img
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => {
            setFailed(src);
            onSettled?.();
          }}
          onLoad={onSettled}
          src={src}
        />
      ) : excerpt !== "" ? (
        <p className={textClassName}>{excerpt}</p>
      ) : (
        <Icon name={src !== null ? "error" : "empty"} />
      )}
    </div>
  );
};
