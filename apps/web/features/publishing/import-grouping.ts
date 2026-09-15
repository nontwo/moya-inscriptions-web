import {
  contentIdentifierSha256,
  readStillFacts,
} from "./parsers/apple-live-photo";
import { blobByteReader, readHead } from "./parsers/bytes";
import { readMotionPhotoContainer } from "./parsers/motion-photo";
import { readMotionFacts } from "./parsers/quicktime";
import {
  SIGNATURE_HEAD_BYTES,
  detectAnimation,
  sniffSignature,
} from "./parsers/signature";

import type { ByteReader } from "./parsers/bytes";
import type { MotionPhotoContainer } from "./parsers/motion-photo";
import type { SniffedMediaType } from "./parsers/signature";
import type { MediaClientSource } from "@moya/contracts";

/**
 * Selection staging (Q01–Q03, L01–L04): every selected file is identified by
 * its bytes, grouped into logical items (a static image, an Apple Live Photo
 * pair proven by ContentIdentifier, or a Google Motion Photo container) and
 * held in a staging batch until the author confirms it under the batch's
 * quality mode. File names, extensions and browser MIME types are never used
 * for identification or pairing. Nothing here uploads.
 */

export type StillType =
  "image/jpeg" | "image/png" | "image/webp" | "image/heic" | "image/heif";
export type MotionType = "video/quicktime" | "video/mp4";

export type FileOrigin = "picker" | "drop" | "paste";

/**
 * Where a confirmed item was selected, as its registration provenance names
 * it (`clientSource`). Presentation provenance only: never an authorization
 * or originality proof.
 */
export const selectionSourceOf = (origin: FileOrigin): MediaClientSource =>
  origin === "paste" ? "clipboard" : origin;

export type UnsupportedReason =
  | "empty_file"
  | "unreadable"
  | "animated_image"
  | "raw_or_tiff"
  | "unsupported_type"
  | "independent_video";

/** Product text for each refusal (shown in the staging list). */
export const unsupportedReasonText: Readonly<
  Record<UnsupportedReason, string>
> = {
  empty_file: "文件为空，无法添加",
  unreadable: "文件无法读取",
  animated_image: "暂不支持动图（GIF、APNG、动态 WebP 等）",
  raw_or_tiff: "暂不支持 RAW 或 TIFF 格式",
  unsupported_type: "格式不支持，请选择 JPEG、PNG、WebP、HEIC 或 HEIF 图片",
  independent_video: "暂不支持单独的视频，实况照片请同时选择照片与动态文件",
};

export interface IdentifiedStill {
  readonly kind: "still";
  readonly file: File;
  readonly type: StillType;
  readonly orientation: number | null;
  /** Canonical Apple ContentIdentifier; kept in memory only, never sent. */
  readonly contentIdentifier: string | null;
  readonly appleMakerNote: boolean;
  /** A validated Motion Photo container inside this still. */
  readonly motionPhoto: MotionPhotoContainer | null;
  /** The still declares a Motion Photo directory that contradicts the file. */
  readonly motionPhotoInvalid: boolean;
}

export interface IdentifiedMotion {
  readonly kind: "motion";
  readonly file: File;
  readonly type: MotionType;
  readonly contentIdentifier: string | null;
  readonly audioTracks: number;
  /** Apple still-image-time on the movie timeline (ms), kept for the pairing claim. */
  readonly stillTimeMs: number | null;
}

export interface UnidentifiedFile {
  readonly kind: "unsupported";
  readonly file: File;
  readonly reason: UnsupportedReason;
}

export type IdentifiedFile =
  IdentifiedStill | IdentifiedMotion | UnidentifiedFile;

const STILL_TYPES: ReadonlySet<SniffedMediaType> = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const safely = async <T>(read: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await read();
  } catch {
    return fallback;
  }
};

/** Identifies one file from its bytes (bounded reads only). */
export async function identifyFile(
  file: File,
  reader: ByteReader = blobByteReader(file),
): Promise<IdentifiedFile> {
  if (file.size === 0)
    return { kind: "unsupported", file, reason: "empty_file" };
  let head: Uint8Array;
  try {
    head = await readHead(reader, SIGNATURE_HEAD_BYTES);
  } catch {
    return { kind: "unsupported", file, reason: "unreadable" };
  }
  const signature = sniffSignature(head);
  if (signature.type === "image/tiff" || signature.type === "image/x-raw")
    return { kind: "unsupported", file, reason: "raw_or_tiff" };
  if (signature.type === "video/quicktime" || signature.type === "video/mp4") {
    const facts = await safely(() => readMotionFacts(reader), null);
    if (facts === null || facts.videoTracks === 0)
      return { kind: "unsupported", file, reason: "unreadable" };
    return {
      kind: "motion",
      file,
      type: signature.type,
      contentIdentifier: facts.contentIdentifier,
      audioTracks: facts.audioTracks,
      stillTimeMs: facts.stillTimeMs,
    };
  }
  if (
    signature.type === "image/gif" ||
    signature.type === "image/avif" ||
    STILL_TYPES.has(signature.type)
  ) {
    const animated = await safely(
      () => detectAnimation(reader, signature),
      signature.type === "image/gif",
    );
    if (animated)
      return { kind: "unsupported", file, reason: "animated_image" };
  }
  if (!STILL_TYPES.has(signature.type))
    return { kind: "unsupported", file, reason: "unsupported_type" };
  const type = signature.type as StillType;
  const facts =
    type === "image/png" || type === "image/webp"
      ? null
      : await safely(() => readStillFacts(reader, type), null);
  let motionPhoto: MotionPhotoContainer | null = null;
  let motionPhotoInvalid = false;
  if (type === "image/jpeg" || type === "image/heic" || type === "image/heif") {
    try {
      motionPhoto = await readMotionPhotoContainer(reader, type);
    } catch {
      // A directory that cannot be read or contradicts the file: never a silent still.
      motionPhotoInvalid = await safely(
        () => hasMotionPhotoMarker(reader),
        false,
      );
    }
  }
  return {
    kind: "still",
    file,
    type,
    orientation: facts?.orientation ?? null,
    contentIdentifier: facts?.contentIdentifier ?? null,
    appleMakerNote: facts?.appleMakerNote ?? false,
    motionPhoto,
    motionPhotoInvalid,
  };
}

const MOTION_PHOTO_MARKERS = [
  "http://ns.google.com/photos/1.0/container/",
  "MicroVideo",
  "MotionPhoto",
];

/** Whether the header bytes mention a Motion Photo at all (text scan, bounded). */
const hasMotionPhotoMarker = async (reader: ByteReader): Promise<boolean> => {
  const head = await readHead(reader, 256 * 1024);
  const text = new TextDecoder("latin1").decode(head);
  return MOTION_PHOTO_MARKERS.some((marker) => text.includes(marker));
};

/** Identifies files with bounded parallelism, keeping selection order. */
export async function identifyFiles(
  files: readonly File[],
  identify: (file: File) => Promise<IdentifiedFile> = (file) =>
    identifyFile(file),
  parallelism = 4,
): Promise<IdentifiedFile[]> {
  const unique = files.filter((file, index) => files.indexOf(file) === index);
  const results = new Array<IdentifiedFile>(unique.length);
  let next = 0;
  const worker = async () => {
    while (next < unique.length) {
      const index = next;
      next += 1;
      results[index] = await identify(unique[index]!);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(parallelism, unique.length) }, worker),
  );
  return results;
}

// ---------------------------------------------------------------------------
// Logical items and staging

export type LogicalSource =
  | { readonly kind: "static"; readonly still: IdentifiedStill }
  | {
      readonly kind: "live";
      readonly layout: "pair";
      readonly still: IdentifiedStill;
      readonly motion: IdentifiedMotion;
    }
  | {
      readonly kind: "live";
      readonly layout: "container";
      readonly still: IdentifiedStill & {
        readonly motionPhoto: MotionPhotoContainer;
      };
    };

export type StagedEntry =
  | {
      readonly key: string;
      readonly status: "ready";
      readonly source: LogicalSource;
      /** Came from the clipboard (not a camera original), whatever the batch began with. */
      readonly pasted?: true;
    }
  | {
      /** A Live still without its motion file: select it, keep a still, or remove. */
      readonly key: string;
      readonly status: "needs_counterpart";
      readonly still: IdentifiedStill;
    }
  | {
      /** A Live motion file without its still: select the still or remove. */
      readonly key: string;
      readonly status: "needs_still";
      readonly motion: IdentifiedMotion;
    }
  | {
      /** Several stills or motions share one identifier: the author picks the pair. */
      readonly key: string;
      readonly status: "ambiguous";
      readonly stills: readonly IdentifiedStill[];
      readonly motions: readonly IdentifiedMotion[];
    }
  | {
      /** A still whose Motion Photo container cannot be verified: keep a still or remove. */
      readonly key: string;
      readonly status: "container_invalid";
      readonly still: IdentifiedStill;
    }
  | {
      readonly key: string;
      readonly status: "unsupported";
      readonly file: File;
      readonly reason: UnsupportedReason;
    };

export interface StagingBatch {
  readonly origin: FileOrigin;
  /** Original quality for this batch (default off, reset after each batch). */
  readonly original: boolean;
  readonly entries: readonly StagedEntry[];
  /** How each staged file was selected (a later pick keeps its own origin). */
  readonly fileOrigins?: ReadonlyMap<File, FileOrigin>;
}

export type KeyFactory = () => string;

let keySequence = 0;
const randomKey = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  keySequence += 1;
  return `i${keySequence.toString(36)}${Array.from(bytes, (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("")}`.slice(0, 32);
};

/** Groups identified files into staged entries. Pairing is by identifier only. */
export function groupIdentifiedFiles(
  files: readonly IdentifiedFile[],
  newKey: KeyFactory = randomKey,
): StagedEntry[] {
  const entries: StagedEntry[] = [];
  const byIdentifier = new Map<
    string,
    { stills: IdentifiedStill[]; motions: IdentifiedMotion[]; at: number }
  >();
  const placeholders: (StagedEntry | string)[] = [];
  for (const file of files) {
    if (file.kind === "unsupported") {
      placeholders.push({
        key: newKey(),
        status: "unsupported",
        file: file.file,
        reason: file.reason,
      });
      continue;
    }
    if (file.kind === "still") {
      if (file.motionPhoto !== null) {
        placeholders.push({
          key: newKey(),
          status: "ready",
          source: {
            kind: "live",
            layout: "container",
            still: file as IdentifiedStill & {
              motionPhoto: MotionPhotoContainer;
            },
          },
        });
        continue;
      }
      if (file.motionPhotoInvalid) {
        placeholders.push({
          key: newKey(),
          status: "container_invalid",
          still: file,
        });
        continue;
      }
      if (file.contentIdentifier === null) {
        placeholders.push({
          key: newKey(),
          status: "ready",
          source: { kind: "static", still: file },
        });
        continue;
      }
    } else if (file.contentIdentifier === null) {
      placeholders.push({
        key: newKey(),
        status: "unsupported",
        file: file.file,
        reason: "independent_video",
      });
      continue;
    }
    const identifier = file.contentIdentifier!;
    let group = byIdentifier.get(identifier);
    if (!group) {
      group = { stills: [], motions: [], at: placeholders.length };
      byIdentifier.set(identifier, group);
      placeholders.push(identifier);
    }
    if (file.kind === "still") group.stills.push(file);
    else group.motions.push(file);
  }
  for (const placeholder of placeholders) {
    if (typeof placeholder !== "string") {
      entries.push(placeholder);
      continue;
    }
    const group = byIdentifier.get(placeholder)!;
    const { stills, motions } = group;
    if (stills.length === 1 && motions.length === 1) {
      entries.push({
        key: newKey(),
        status: "ready",
        source: {
          kind: "live",
          layout: "pair",
          still: stills[0]!,
          motion: motions[0]!,
        },
      });
    } else if (stills.length > 0 && motions.length > 0) {
      entries.push({ key: newKey(), status: "ambiguous", stills, motions });
    } else {
      for (const still of stills)
        entries.push({ key: newKey(), status: "needs_counterpart", still });
      for (const motion of motions)
        entries.push({ key: newKey(), status: "needs_still", motion });
    }
  }
  return entries;
}

const markPasted = (
  entries: readonly StagedEntry[],
  origin: FileOrigin,
): StagedEntry[] =>
  entries.map((entry) =>
    origin === "paste" && entry.status === "ready"
      ? { ...entry, pasted: true }
      : entry,
  );

export const createStagingBatch = (
  files: readonly IdentifiedFile[],
  origin: FileOrigin,
  newKey?: KeyFactory,
): StagingBatch => ({
  origin,
  original: false,
  entries: markPasted(groupIdentifiedFiles(files, newKey), origin),
  fileOrigins: new Map(files.map((file) => [file.file, origin])),
});

const entryFiles = (entry: StagedEntry): File[] => {
  switch (entry.status) {
    case "ready":
      return entry.source.kind === "live" && entry.source.layout === "pair"
        ? [entry.source.still.file, entry.source.motion.file]
        : [entry.source.still.file];
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

/**
 * Adds a later pick to the staging batch. Live halves still waiting for
 * their counterpart are grouped again together with the new files, so a
 * still and its motion chosen in separate picks pair by identifier (never by
 * name); a file object already staged is not added twice. Entries that stay
 * as they were keep their keys.
 */
export const addToStagingBatch = (
  batch: StagingBatch | null,
  files: readonly IdentifiedFile[],
  origin: FileOrigin,
  newKey: KeyFactory = randomKey,
): StagingBatch => {
  if (batch === null) return createStagingBatch(files, origin, newKey);
  const staged = new Set(batch.entries.flatMap(entryFiles));
  const incoming = files.filter((file) => !staged.has(file.file));
  const pastedFiles = new Set(
    origin === "paste" ? incoming.map((file) => file.file) : [],
  );
  const fileOrigins = new Map(batch.fileOrigins ?? []);
  for (const file of incoming)
    if (!fileOrigins.has(file.file)) fileOrigins.set(file.file, origin);
  const waiting = batch.entries.filter(
    (entry) =>
      entry.status === "needs_counterpart" ||
      entry.status === "needs_still" ||
      entry.status === "ambiguous",
  );
  const halves: IdentifiedFile[] = waiting.flatMap((entry) =>
    entry.status === "needs_counterpart"
      ? [entry.still]
      : entry.status === "needs_still"
        ? [entry.motion]
        : entry.status === "ambiguous"
          ? [...entry.stills, ...entry.motions]
          : [],
  );
  const keyByFile = new Map<File, string>();
  for (const entry of waiting)
    if (entry.status === "needs_counterpart")
      keyByFile.set(entry.still.file, entry.key);
    else if (entry.status === "needs_still")
      keyByFile.set(entry.motion.file, entry.key);
  const used = new Set<string>();
  const reuse = (entry: StagedEntry, candidates: File[]): StagedEntry => {
    for (const file of candidates) {
      const key = keyByFile.get(file);
      if (key !== undefined && !used.has(key)) {
        used.add(key);
        return { ...entry, key };
      }
    }
    return entry;
  };
  const regrouped = groupIdentifiedFiles([...halves, ...incoming], newKey).map(
    (entry): StagedEntry => {
      const kept =
        entry.status === "unsupported" ||
        entry.status === "ambiguous" ||
        entry.status === "container_invalid"
          ? entry
          : reuse(entry, entryFiles(entry));
      return kept.status === "ready" &&
        entryFiles(kept).some((file) => pastedFiles.has(file))
        ? { ...kept, pasted: true }
        : kept;
    },
  );
  return {
    ...batch,
    fileOrigins,
    entries: [
      ...batch.entries.filter(
        (entry) =>
          entry.status !== "needs_counterpart" &&
          entry.status !== "needs_still" &&
          entry.status !== "ambiguous",
      ),
      ...regrouped,
    ],
  };
};

export const setBatchOriginal = (
  batch: StagingBatch,
  original: boolean,
): StagingBatch => ({ ...batch, original });

/** Web r4 imports photos only. Keep the parser facts for bounded extraction,
 * but never turn a new selection into Live media or wait for another file.
 * Compatibility pairing above is retained for backend/browser fixtures.
 */
export const addStaticPhotosToStaging = (
  batch: StagingBatch | null,
  files: readonly IdentifiedFile[],
  origin: FileOrigin,
  newKey: KeyFactory = randomKey,
): StagingBatch => {
  const staged = new Set(batch?.entries.flatMap(entryFiles) ?? []);
  const incoming = files.filter((file) => !staged.has(file.file));
  const entries = incoming.map((file): StagedEntry => {
    if (file.kind === "unsupported")
      return {
        key: newKey(),
        status: "unsupported",
        file: file.file,
        reason: file.reason,
      };
    if (file.kind === "motion" || file.motionPhotoInvalid)
      return {
        key: newKey(),
        status: "unsupported",
        file: file.file,
        reason: file.kind === "motion" ? "independent_video" : "unreadable",
      };
    return {
      key: newKey(),
      status: "ready",
      source: { kind: "static", still: file },
      ...(origin === "paste" ? { pasted: true as const } : {}),
    };
  });
  return {
    origin: batch?.origin ?? origin,
    original: batch?.original ?? false,
    entries: [...(batch?.entries ?? []), ...entries],
    fileOrigins: new Map([
      ...(batch?.fileOrigins ?? []),
      ...incoming.map((file) => [file.file, origin] as const),
    ]),
  };
};

const replaceEntry = (
  batch: StagingBatch,
  key: string,
  replacement: readonly StagedEntry[],
): StagingBatch => ({
  ...batch,
  entries: batch.entries.flatMap((entry) =>
    entry.key === key ? replacement : [entry],
  ),
});

export type StagingChoiceError =
  "entry_missing" | "choice_invalid" | "pairing_mismatch";

export type StagingChoiceResult =
  | { readonly ok: true; readonly batch: StagingBatch }
  | { readonly ok: false; readonly error: StagingChoiceError };

const findEntry = (batch: StagingBatch, key: string) =>
  batch.entries.find((entry) => entry.key === key);

/** Removes one staged entry (any status). */
export const removeStagedEntry = (
  batch: StagingBatch,
  key: string,
): StagingChoiceResult =>
  findEntry(batch, key)
    ? { ok: true, batch: replaceEntry(batch, key, []) }
    : { ok: false, error: "entry_missing" };

/** Keeps a Live still (or an unverifiable container) as a static photo. */
export const keepStagedStillAsPhoto = (
  batch: StagingBatch,
  key: string,
): StagingChoiceResult => {
  const entry = findEntry(batch, key);
  if (!entry) return { ok: false, error: "entry_missing" };
  if (
    entry.status !== "needs_counterpart" &&
    entry.status !== "container_invalid"
  )
    return { ok: false, error: "choice_invalid" };
  return {
    ok: true,
    batch: replaceEntry(batch, key, [
      {
        key,
        status: "ready",
        source: {
          kind: "static",
          still: {
            ...entry.still,
            motionPhoto: null,
            motionPhotoInvalid: false,
          },
        },
      },
    ]),
  };
};

/**
 * Attaches an explicitly selected counterpart. The pair is accepted only when
 * both components carry the same Apple ContentIdentifier.
 */
export const attachStagedCounterpart = (
  batch: StagingBatch,
  key: string,
  counterpart: IdentifiedFile,
): StagingChoiceResult => {
  const entry = findEntry(batch, key);
  if (!entry) return { ok: false, error: "entry_missing" };
  if (entry.status === "needs_counterpart") {
    if (counterpart.kind !== "motion")
      return { ok: false, error: "choice_invalid" };
    if (counterpart.contentIdentifier !== entry.still.contentIdentifier)
      return { ok: false, error: "pairing_mismatch" };
    return {
      ok: true,
      batch: replaceEntry(batch, key, [
        {
          key,
          status: "ready",
          source: {
            kind: "live",
            layout: "pair",
            still: entry.still,
            motion: counterpart,
          },
        },
      ]),
    };
  }
  if (entry.status === "needs_still") {
    if (counterpart.kind !== "still" || counterpart.motionPhoto !== null)
      return { ok: false, error: "choice_invalid" };
    if (counterpart.contentIdentifier !== entry.motion.contentIdentifier)
      return { ok: false, error: "pairing_mismatch" };
    return {
      ok: true,
      batch: replaceEntry(batch, key, [
        {
          key,
          status: "ready",
          source: {
            kind: "live",
            layout: "pair",
            still: counterpart,
            motion: entry.motion,
          },
        },
      ]),
    };
  }
  return { ok: false, error: "choice_invalid" };
};

/**
 * Resolves an ambiguous group by the author's pick. The files not picked stay
 * staged and are re-evaluated on their own (they still need a choice).
 */
export const resolveStagedAmbiguity = (
  batch: StagingBatch,
  key: string,
  stillIndex: number,
  motionIndex: number,
  newKey: KeyFactory = randomKey,
): StagingChoiceResult => {
  const entry = findEntry(batch, key);
  if (!entry) return { ok: false, error: "entry_missing" };
  if (entry.status !== "ambiguous")
    return { ok: false, error: "choice_invalid" };
  const still = entry.stills[stillIndex];
  const motion = entry.motions[motionIndex];
  if (!still || !motion) return { ok: false, error: "choice_invalid" };
  const rest: StagedEntry[] = [
    ...entry.stills
      .filter((_, index) => index !== stillIndex)
      .map((other): StagedEntry => ({
        key: newKey(),
        status: "needs_counterpart",
        still: other,
      })),
    ...entry.motions
      .filter((_, index) => index !== motionIndex)
      .map((other): StagedEntry => ({
        key: newKey(),
        status: "needs_still",
        motion: other,
      })),
  ];
  return {
    ok: true,
    batch: replaceEntry(batch, key, [
      {
        key,
        status: "ready",
        source: { kind: "live", layout: "pair", still, motion },
      },
      ...rest,
    ]),
  };
};

export interface StagingCount {
  /** Logical items that would be added now (a Live pair counts once). */
  readonly ready: number;
  /** Entries waiting for an explicit choice. */
  readonly unresolved: number;
  readonly unsupported: number;
  /** Items in the work after confirming the ready entries. */
  readonly total: number;
  readonly maxItems: number;
  readonly withinLimit: boolean;
  /** How many ready entries exceed the limit (0 when within). */
  readonly overBy: number;
}

export const countStaging = (
  batch: StagingBatch,
  existingItems: number,
  maxItems: number,
): StagingCount => {
  let ready = 0;
  let unresolved = 0;
  let unsupported = 0;
  for (const entry of batch.entries) {
    if (entry.status === "ready") ready += 1;
    else if (entry.status === "unsupported") unsupported += 1;
    else unresolved += 1;
  }
  const total = existingItems + ready;
  return {
    ready,
    unresolved,
    unsupported,
    total,
    maxItems,
    withinLimit: total <= maxItems,
    overBy: Math.max(0, total - maxItems),
  };
};

export interface ConfirmedSource {
  readonly key: string;
  readonly source: LogicalSource;
  readonly qualityMode: "standard" | "original";
  /** Clipboard images are not camera originals (labelled in the UI). */
  readonly notCameraOriginal: boolean;
  /** How the item was selected (registration provenance). */
  readonly clientSource?: MediaClientSource;
}

export type ConfirmStagingResult =
  | {
      readonly ok: true;
      readonly confirmed: readonly ConfirmedSource[];
      /** Entries still waiting for a choice, carried into the next staging view. */
      readonly remaining: StagingBatch | null;
    }
  | { readonly ok: false; readonly error: "items_limit" | "nothing_ready" };

/**
 * How a ready entry was selected: any file from the clipboard makes it a
 * clipboard item; otherwise the origin of its first file with a known origin.
 * A file without one (a counterpart chosen later) was picked explicitly.
 */
const entrySelectionSource = (
  batch: StagingBatch,
  entry: StagedEntry & { readonly status: "ready" },
): MediaClientSource => {
  const origins = entryFiles(entry).flatMap((file) => {
    const origin = batch.fileOrigins?.get(file);
    return origin === undefined ? [] : [origin];
  });
  if (entry.pasted === true || origins.includes("paste")) return "clipboard";
  const known = origins[0] ?? batch.origin;
  return known === "paste" ? "picker" : selectionSourceOf(known);
};

/**
 * Confirms the ready entries under the batch's quality mode. Refused as a
 * whole when the work would exceed the item limit; unsupported entries are
 * dropped and entries still waiting for a choice remain staged (with the
 * original switch reset).
 */
export const confirmStaging = (
  batch: StagingBatch,
  existingItems: number,
  maxItems: number,
): ConfirmStagingResult => {
  const count = countStaging(batch, existingItems, maxItems);
  if (count.ready === 0) return { ok: false, error: "nothing_ready" };
  if (!count.withinLimit) return { ok: false, error: "items_limit" };
  const qualityMode = batch.original ? "original" : "standard";
  const confirmed = batch.entries.flatMap((entry): ConfirmedSource[] => {
    if (entry.status !== "ready") return [];
    const clientSource = entrySelectionSource(batch, entry);
    return [
      {
        key: entry.key,
        source: entry.source,
        qualityMode,
        notCameraOriginal: clientSource === "clipboard",
        clientSource,
      },
    ];
  });
  const waiting = batch.entries.filter(
    (entry) => entry.status !== "ready" && entry.status !== "unsupported",
  );
  return {
    ok: true,
    confirmed,
    remaining:
      waiting.length === 0
        ? null
        : { ...batch, original: false, entries: waiting },
  };
};

/** SHA-256 digest of the pair identifier, the only pairing fact that is sent. */
export const pairingDigest = (source: LogicalSource): string | null =>
  source.kind === "live" &&
  source.layout === "pair" &&
  source.still.contentIdentifier
    ? contentIdentifierSha256(source.still.contentIdentifier)
    : null;
