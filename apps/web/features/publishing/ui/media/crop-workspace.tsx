"use client";

import { useEffect, useRef, useState } from "react";
import Cropper from "react-easy-crop";
import "react-easy-crop/react-easy-crop.css";

import {
  centeredCrop,
  cropFromPercentages,
  normalizeCrop,
  percentagesFromCrop,
} from "./media-geometry";
import styles from "./media.module.css";

import type {
  AspectPreset,
  AspectPresetId,
  PercentArea,
  Size,
} from "./media-geometry";
import type { MediaCrop, MediaRotation } from "@moya/contracts";
import type { Dispatch, SetStateAction } from "react";

/**
 * The crop mechanics shared by the edit and cover composition dialogs:
 * react-easy-crop (drag, pinch, wheel, arrow keys) inside a bounded
 * viewport, aspect presets as a radio group and a zoom slider.
 */

export type CropPreset = AspectPresetId | "custom";

export interface CropSession {
  readonly preset: CropPreset;
  /** Where the cropper starts, in percentages of the frame; undefined centers it. */
  readonly seed: PercentArea | undefined;
  /** The last area the cropper reported; undefined until it reports one. */
  readonly area: MediaCrop | null | undefined;
  readonly position: { readonly x: number; readonly y: number };
  readonly zoom: number;
  /**
   * The author moved or zoomed the crop in this session. The cropper also
   * reports an area on its own when it mounts or its frame changes (with a
   * turned image that area is not the full frame on every layout), and such
   * a report is never an edit the author asked for.
   */
  readonly touched: boolean;
  /** Remounts the cropper when its frame or aspect changes. */
  readonly generation: number;
}

export const startCrop = (
  preset: CropPreset,
  crop: MediaCrop | null,
): CropSession => ({
  preset,
  seed: crop === null ? undefined : percentagesFromCrop(crop),
  area: undefined,
  position: { x: 0, y: 0 },
  zoom: 1,
  touched: false,
  generation: 0,
});

/** A new frame or aspect: the crop starts again centered at full zoom-out. */
export const restartCrop = (
  session: CropSession,
  preset: CropPreset,
): CropSession => ({
  preset,
  seed: undefined,
  area: undefined,
  position: { x: 0, y: 0 },
  zoom: 1,
  touched: false,
  generation: session.generation + 1,
});

/**
 * Continues a session in a newly mounted cropper (the dialog came back after
 * a layout change, or its image source changed): the cropper starts where
 * the author left the crop, not where the session was first seeded.
 */
export const resumeCrop = (session: CropSession): CropSession =>
  session.area === undefined
    ? session
    : {
        ...session,
        seed:
          session.area === null ? undefined : percentagesFromCrop(session.area),
      };

/**
 * Whether the session's reported area is an explicit crop: it continues a
 * stored crop (seeded), the author chose an aspect other than 原始比例, or
 * moved or zoomed the crop. A fresh 原始比例 session left alone is the full
 * frame, whatever the cropper reported for it.
 */
const explicitArea = (session: CropSession): boolean =>
  session.seed !== undefined ||
  session.preset !== "original" ||
  session.touched;

/**
 * The crop to store: what the cropper reported when that is an explicit
 * crop, else where it was seeded, else the centered crop of the chosen
 * aspect (the full frame is null).
 */
export const resolvedCrop = (
  session: CropSession,
  ratio: number,
  frame: Size | null,
): MediaCrop | null => {
  if (session.area !== undefined && explicitArea(session)) return session.area;
  if (session.seed !== undefined) return cropFromPercentages(session.seed);
  if (frame === null || session.preset === "original") return null;
  return normalizeCrop(centeredCrop(ratio, frame));
};

/** The natural (display-orientation) size of an image URL, or a known size. */
export const useNaturalSize = (
  src: string | null,
  known: Size | null,
): { readonly size: Size | null; readonly failed: boolean } => {
  const [measured, setMeasured] = useState<{
    readonly src: string;
    readonly size: Size | null;
    readonly failed: boolean;
  } | null>(null);
  useEffect(() => {
    if (src === null || known !== null || typeof Image === "undefined") return;
    const image = new Image();
    let active = true;
    image.onload = () => {
      if (!active) return;
      setMeasured(
        image.naturalWidth > 0 && image.naturalHeight > 0
          ? {
              src,
              size: { width: image.naturalWidth, height: image.naturalHeight },
              failed: false,
            }
          : { src, size: null, failed: true },
      );
    };
    image.onerror = () => {
      if (active) setMeasured({ src, size: null, failed: true });
    };
    image.src = src;
    return () => {
      active = false;
      image.onload = null;
      image.onerror = null;
    };
  }, [src, known]);
  if (known !== null) return { size: known, failed: false };
  if (measured === null || measured.src !== src)
    return { size: null, failed: false };
  return { size: measured.size, failed: measured.failed };
};

export const PresetPicker = ({
  name,
  presets,
  value,
  disabled = false,
  onChange,
}: {
  readonly name: string;
  readonly presets: readonly AspectPreset[];
  readonly value: CropPreset;
  readonly disabled?: boolean;
  readonly onChange: (preset: AspectPresetId) => void;
}) => (
  <fieldset className={styles.presets} disabled={disabled}>
    <legend>裁剪比例</legend>
    <div className={styles.presetOptions}>
      {presets.map((preset) => (
        <label className={styles.presetOption} key={preset.id}>
          <input
            checked={value === preset.id}
            name={name}
            onChange={() => onChange(preset.id)}
            type="radio"
            value={preset.id}
          />
          <span>{preset.label}</span>
        </label>
      ))}
      {value === "custom" && (
        <label className={styles.presetOption}>
          <input checked name={name} readOnly type="radio" value="custom" />
          <span>当前比例</span>
        </label>
      )}
    </div>
  </fieldset>
);

export const CropWorkspace = ({
  image,
  rotation,
  ratio,
  session,
  onSession,
  label,
}: {
  readonly image: string;
  readonly rotation: MediaRotation;
  readonly ratio: number;
  readonly session: CropSession;
  readonly onSession: Dispatch<SetStateAction<CropSession>>;
  readonly label: string;
}) => {
  // A new source (e.g. the account derivative replacing local bytes) keeps
  // the crop the author made: the cropper reseeds from it when it loads.
  const shown = useRef(image);
  const latest = useRef(onSession);
  useEffect(() => {
    latest.current = onSession;
  });
  useEffect(() => {
    if (shown.current === image) return;
    shown.current = image;
    latest.current(resumeCrop);
  }, [image]);
  return (
    <CropFrame
      image={image}
      label={label}
      onSession={onSession}
      ratio={ratio}
      rotation={rotation}
      session={session}
    />
  );
};

const CropFrame = ({
  image,
  rotation,
  ratio,
  session,
  onSession,
  label,
}: {
  readonly image: string;
  readonly rotation: MediaRotation;
  readonly ratio: number;
  readonly session: CropSession;
  readonly onSession: Dispatch<SetStateAction<CropSession>>;
  readonly label: string;
}) => (
  <>
    <div className={styles.cropViewport} data-media-crop="">
      <Cropper
        key={session.generation}
        aspect={ratio}
        classes={{ cropAreaClassName: styles.cropArea ?? "" }}
        crop={session.position}
        cropperProps={{ tabIndex: 0, "aria-label": label }}
        disableAutomaticStylesInjection
        image={image}
        {...(session.seed === undefined
          ? {}
          : { initialCroppedAreaPercentages: session.seed })}
        maxZoom={4}
        mediaProps={{ alt: "" }}
        minZoom={1}
        objectFit="contain"
        onCropAreaChange={(area) =>
          onSession((current) => ({
            ...current,
            area: cropFromPercentages(area),
          }))
        }
        onCropChange={(position) =>
          onSession((current) =>
            // The cropper re-reports its position when it mounts or clamps;
            // only a moved crop is the author's.
            current.position.x === position.x &&
            current.position.y === position.y
              ? current
              : { ...current, position, touched: true },
          )
        }
        onZoomChange={(zoom) =>
          onSession((current) =>
            current.zoom === zoom
              ? current
              : { ...current, zoom, touched: true },
          )
        }
        rotation={rotation}
        showGrid
      />
    </div>
    <label className={styles.zoom}>
      <span>缩放</span>
      <input
        max="4"
        min="1"
        onChange={(event) => {
          const zoom = Number(event.target.value);
          onSession((current) =>
            current.zoom === zoom
              ? current
              : { ...current, zoom, touched: true },
          );
        }}
        step="0.01"
        type="range"
        value={session.zoom}
      />
    </label>
  </>
);
