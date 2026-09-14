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
 * The crop to store: what the cropper reported, else where it was seeded,
 * else the centered crop of the chosen aspect (the full frame is null).
 */
export const resolvedCrop = (
  session: CropSession,
  ratio: number,
  frame: Size | null,
): MediaCrop | null => {
  if (session.area !== undefined) return session.area;
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
          onSession((current) => ({ ...current, position }))
        }
        onZoomChange={(zoom) => onSession((current) => ({ ...current, zoom }))}
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
          onSession((current) => ({ ...current, zoom }));
        }}
        step="0.01"
        type="range"
        value={session.zoom}
      />
    </label>
  </>
);
