"use client";

import { useEffect, useId, useRef } from "react";

import styles from "./editor.module.css";

import type { ReactNode } from "react";

/**
 * A modal choice inside the editor. The editor already owns its history
 * entry, so the dialog adds none: Escape (or the platform's cancel gesture)
 * takes the safe choice, focus starts on the first action and returns to
 * the control that opened it.
 */
export const EditorDialog = ({
  title,
  description,
  children,
  onCancel,
  cancellable = true,
  size,
  dataName,
}: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
  /** The safe choice (keep editing); also Escape. */
  readonly onCancel: () => void;
  readonly cancellable?: boolean;
  readonly size?: "wide";
  readonly dataName?: string;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  const latest = useRef({ onCancel, cancellable });
  latest.current = { onCancel, cancellable };

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return undefined;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    const first = dialog.querySelector<HTMLElement>(
      "[data-dialog-initial-focus], button:not([disabled])",
    );
    first?.focus({ preventScroll: true });
    return () => {
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close();
        else dialog.removeAttribute("open");
      }
      if (
        opener?.isConnected &&
        opener.closest('[inert], [hidden], [aria-hidden="true"]') === null
      )
        opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-describedby={description === undefined ? undefined : descriptionId}
      aria-labelledby={titleId}
      className={styles.dialog}
      data-editor-dialog={dataName}
      data-size={size}
      onCancel={(event) => {
        event.preventDefault();
        if (latest.current.cancellable) latest.current.onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      {description === undefined ? null : (
        <div id={descriptionId}>{description}</div>
      )}
      {children}
    </dialog>
  );
};
