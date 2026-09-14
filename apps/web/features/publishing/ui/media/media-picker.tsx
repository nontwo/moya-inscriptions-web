"use client";

import Uppy from "@uppy/core";
import { UppyContextProvider, useDropzone } from "@uppy/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import styles from "./media.module.css";

import type { FileOrigin } from "../../import-grouping";

/**
 * Native multi-file selection and the desktop drop zone (Q02), through the
 * Uppy headless dropzone hook. The picker's Uppy instance only relays the
 * chosen File objects to the publishing staging: `onBeforeFileAdded` refuses
 * every file, so Uppy never holds, previews or uploads anything. Transfers
 * run in the upload manager's own Uppy instance after confirmation.
 */

/** Stills and the motion files of Live Photos; staging identifies bytes, never names. */
export const MEDIA_ACCEPT = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  ".heic",
  ".heif",
  "video/quicktime",
  "video/mp4",
  ".mov",
].join(",");

const silentLogger = {
  debug: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

type DropzoneOptions = NonNullable<Parameters<typeof useDropzone>[0]>;

export interface MediaPickerProps {
  readonly layout: "phone" | "desktop";
  readonly disabled: boolean;
  /** Why selection is not possible now (shown instead of the hint). */
  readonly disabledReason?: string | null;
  readonly onFiles: (files: File[], origin: FileOrigin) => void;
  /** Files were dropped while selection is not possible. */
  readonly onRefused?: () => void;
}

const PickerSurface = ({
  layout,
  disabled,
  disabledReason = null,
  onFiles,
  onRefused,
}: MediaPickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const latest = useRef({ onFiles, onRefused, disabled });
  useEffect(() => {
    latest.current = { onFiles, onRefused, disabled };
  });
  const [over, setOver] = useState(false);
  const options = useMemo<DropzoneOptions>(
    () => ({
      noClick: true,
      onDragEnter: () => {
        if (!latest.current.disabled) setOver(true);
      },
      onDragOver: () => undefined,
      onDragLeave: (event) => {
        const { currentTarget, relatedTarget } = event as MouseEvent;
        // Moving between children of the zone is not leaving it.
        if (
          !(relatedTarget instanceof Node) ||
          !(currentTarget instanceof Node) ||
          !currentTarget.contains(relatedTarget)
        )
          setOver(false);
      },
      onDrop: (files) => {
        setOver(false);
        if (files.length === 0) return;
        if (latest.current.disabled) latest.current.onRefused?.();
        else latest.current.onFiles(files, "drop");
      },
      onFileInputChange: (files) => {
        if (!latest.current.disabled && files.length > 0)
          latest.current.onFiles(files, "picker");
      },
    }),
    [],
  );
  const dropzone = useDropzone(options);
  const root = dropzone.getRootProps();
  const input = dropzone.getInputProps();
  const hintId = useId();
  const wide = layout === "desktop";

  return (
    <div
      className={styles.picker}
      data-disabled={disabled ? "true" : undefined}
      data-layout={layout}
      data-media-picker=""
      data-over={over ? "true" : undefined}
      onDragEnter={(event) => root.onDragEnter(event as never)}
      onDragLeave={(event) => root.onDragLeave(event as never)}
      onDragOver={(event) => root.onDragOver(event as never)}
      onDrop={(event) => root.onDrop(event as never)}
    >
      <input
        ref={inputRef}
        accept={MEDIA_ACCEPT}
        aria-label="选择照片或实况照片文件"
        disabled={disabled}
        hidden
        id={input.id}
        multiple
        onChange={(event) => input.onChange(event as never)}
        tabIndex={-1}
        type="file"
      />
      <button
        aria-describedby={hintId}
        className={wide ? styles.secondaryButton : styles.pickerButton}
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {wide ? "选择文件" : "选择照片"}
      </button>
      <p className={styles.pickerHint} id={hintId}>
        {disabled && disabledReason !== null
          ? disabledReason
          : wide
            ? "也可以把照片拖到这里，或粘贴剪贴板中的图片。实况照片请同时选择照片和对应的视频文件。"
            : "可一次选择多张。实况照片请同时选择照片和对应的视频文件。"}
      </p>
    </div>
  );
};

export const MediaPicker = (props: MediaPickerProps) => {
  const id = useId();
  const [uppy, setUppy] = useState<Uppy | null>(null);
  useEffect(() => {
    const instance = new Uppy({
      id: `media-staging-${id.replace(/[^A-Za-z0-9_-]/gu, "")}`,
      autoProceed: false,
      logger: silentLogger,
      // Relay only: the picker instance never keeps a file.
      onBeforeFileAdded: () => false,
    });
    setUppy(instance);
    return () => {
      setUppy(null);
      instance.destroy();
    };
  }, [id]);
  if (uppy === null)
    return (
      <div
        className={styles.picker}
        data-layout={props.layout}
        data-media-picker=""
      >
        <button
          className={
            props.layout === "desktop"
              ? styles.secondaryButton
              : styles.pickerButton
          }
          disabled
          type="button"
        >
          {props.layout === "desktop" ? "选择文件" : "选择照片"}
        </button>
      </div>
    );
  return (
    <UppyContextProvider uppy={uppy}>
      <PickerSurface {...props} />
    </UppyContextProvider>
  );
};
