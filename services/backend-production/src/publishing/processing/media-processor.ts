import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { chmod, open } from "node:fs/promises";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { PublishingMediaStoreError } from "../../storage/publishing-media-store.js";
import {
  contentIdentifierSha256,
  readExifContentIdentifier,
  readHeifExifTiff,
  readQuickTimeContentIdentifier,
} from "./apple-live-photo.js";
import { openFileByteReader } from "./byte-reader.js";
import { isEditKey, isIdentityEdit, parseCrop, parseEdit } from "./edits.js";
import {
  MediaParseError,
  MediaProcessingInputError,
  MediaProcessingUnavailableError,
  MediaRejectedError,
  systemErrorCode,
} from "./errors.js";
import {
  ISOBMFF_LIMITS,
  readTopLevelBox,
  readTopLevelBoxes,
  readVideoTrackRotation,
} from "./isobmff.js";
import { readJpegExifTiff } from "./jpeg.js";
import { probeMotionInput, renderMotionDerivative } from "./live-processor.js";
import { MediaToolError, heifDecodeToPng } from "./media-tools.js";
import {
  locateMotionPhotoVideo,
  readHeifXmpPackets,
  readJpegXmpPackets,
  readMotionPhotoDirectory,
} from "./motion-photo.js";
import { COVER_CROPPED_VARIANTS, METADATA_HEAD_BYTES } from "./profiles.js";
import {
  SIGNATURE_HEAD_BYTES,
  countGifFrames,
  declaredTypeMatches,
  pngHasAnimationControl,
  sniffSignature,
} from "./signature.js";
import {
  inspectStaticSource,
  renderStaticDerivative,
} from "./static-processor.js";
import { readExifSummary } from "./tiff-exif.js";

import type {
  PublishingMediaStoreContentType,
  PublishingMediaStoreRead,
} from "../../storage/publishing-media-store.js";
import type { ByteReader } from "./byte-reader.js";
import type { MediaEdit, NormalizedCrop } from "./edits.js";
import type { MediaFailureCode } from "./errors.js";
import type { MotionProbe } from "./live-processor.js";
import type { MediaToolJob, MediaToolsRunner } from "./media-tools.js";
import type { StaticDerivativeVariant } from "./profiles.js";
import type { SniffedMediaType } from "./signature.js";
import type { StaticInspection, StaticSource } from "./static-processor.js";

export type ProcessorMode = "process" | "derive";
export type ProcessorComponentRole = "still" | "motion" | "package";
export type ProcessorVariant =
  "thumb" | "display" | "full" | "motion" | "cover";
export type ProcessorPairingMethod =
  "apple-content-identifier" | "motion-photo-container" | "none";

/** Structural mirror of `PublishingProcessInput` (`@moya/api`). */
export interface ProcessorInput {
  readonly mode: ProcessorMode;
  readonly itemId: string;
  readonly ownerId: string;
  readonly kind: "static" | "live";
  readonly qualityMode: "standard" | "original";
  readonly components: readonly {
    readonly role: ProcessorComponentRole;
    readonly storageKey: string;
    readonly byteSize: number;
    readonly sha256: string;
    readonly declaredType: PublishingMediaStoreContentType;
  }[];
  readonly clientPairing: {
    readonly method: ProcessorPairingMethod;
    readonly identifierSha256: string | null;
    readonly stillTimeMs?: number;
  } | null;
  /** Opaque upstream key; `base` only for the identity edit. */
  readonly editKey: string;
  readonly edit: MediaEdit;
  readonly coverCrop: NormalizedCrop | null;
  readonly variants: readonly ProcessorVariant[];
  readonly signal?: AbortSignal;
}

export interface ProcessorDerivative {
  readonly variant: ProcessorVariant;
  readonly editKey: string;
  readonly storageKey: string;
  readonly byteSize: number;
  readonly sha256: string;
  readonly contentType: "image/webp" | "video/mp4";
  readonly width: number;
  readonly height: number;
  readonly durationMs: number | null;
}

export interface ProcessorPairing {
  readonly method: ProcessorPairingMethod;
  readonly verifiedBy: "server" | "client";
  readonly identifierSha256: string | null;
  readonly stillTimeMs?: number;
}

/** Structural mirror of `PublishingProcessOutcome` (`@moya/api`). */
export type ProcessorOutcome =
  | {
      readonly status: "processed";
      readonly detectedTypes: readonly {
        readonly role: ProcessorComponentRole;
        readonly contentType: PublishingMediaStoreContentType;
      }[];
      readonly presentation: {
        readonly width: number;
        readonly height: number;
        readonly durationMs?: number;
        readonly hasAudio?: boolean;
        readonly displayRotation?: 0 | 90 | 180 | 270;
      };
      readonly pairing: ProcessorPairing | null;
      readonly stillExifOrientation: number | null;
      readonly derivatives: readonly ProcessorDerivative[];
    }
  | {
      readonly status: "derived";
      readonly derivatives: readonly ProcessorDerivative[];
    }
  | { readonly status: "rejected"; readonly failureCode: MediaFailureCode };

/** The media store operations the processor needs. */
export interface ProcessorMediaStore {
  openRead(storageKey: string): Promise<PublishingMediaStoreRead | null>;
  writeStream(
    ownerId: string,
    purpose: "derivative",
    contentType: "image/webp" | "video/mp4",
    maxBytes: number,
    source: AsyncIterable<Uint8Array>,
    options?: {
      readonly signal?: AbortSignal;
      readonly requireExactSize?: boolean;
    },
  ): Promise<{ storageKey: string; byteSize: number; sha256: string }>;
  remove(storageKey: string): Promise<void>;
}

export interface PublishingMediaProcessorOptions {
  readonly store: ProcessorMediaStore;
  readonly runner: MediaToolsRunner;
}

type Component = ProcessorInput["components"][number];

const ITEM_ID_PATTERN = /^media-item-[0-9a-f]{32}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const MAX_STILL_TIME_MS = 60_000;
const VARIANTS = new Set<string>([
  "thumb",
  "display",
  "full",
  "motion",
  "cover",
]);
const PAIRING_METHODS = new Set<string>([
  "apple-content-identifier",
  "motion-photo-container",
  "none",
]);
const STILL_TYPES = new Set<SniffedMediaType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const GIF_SCAN_BYTES = 16 * 1024 * 1024;

const withSignal = (signal: AbortSignal | undefined) =>
  signal ? { signal } : {};

const invalidClientPairing = (pairing: ProcessorInput["clientPairing"]) =>
  pairing !== null &&
  (typeof pairing !== "object" ||
    !PAIRING_METHODS.has(pairing.method) ||
    (pairing.method === "apple-content-identifier") !==
      (typeof pairing.identifierSha256 === "string" &&
        SHA256_PATTERN.test(pairing.identifierSha256)) ||
    (pairing.method !== "apple-content-identifier" &&
      pairing.identifierSha256 !== null) ||
    (pairing.stillTimeMs !== undefined &&
      (pairing.method === "none" ||
        !Number.isSafeInteger(pairing.stillTimeMs) ||
        pairing.stillTimeMs < 0 ||
        pairing.stillTimeMs > MAX_STILL_TIME_MS)));

const assertInput = (input: ProcessorInput) => {
  const roles = input.components.map((component) => component.role);
  if (
    (input.mode !== "process" && input.mode !== "derive") ||
    !ITEM_ID_PATTERN.test(input.itemId) ||
    typeof input.ownerId !== "string" ||
    (input.kind !== "static" && input.kind !== "live") ||
    (input.qualityMode !== "standard" && input.qualityMode !== "original") ||
    !Array.isArray(input.components) ||
    new Set(roles).size !== roles.length ||
    input.components.some(
      (component) =>
        !SHA256_PATTERN.test(component.sha256) ||
        !Number.isSafeInteger(component.byteSize) ||
        component.byteSize < 1,
    ) ||
    invalidClientPairing(input.clientPairing) ||
    !isEditKey(input.editKey) ||
    !Array.isArray(input.variants) ||
    input.variants.length === 0 ||
    new Set(input.variants).size !== input.variants.length ||
    input.variants.some((variant) => !VARIANTS.has(variant)) ||
    (input.kind === "static" && input.variants.includes("motion"))
  ) {
    throw new MediaProcessingInputError();
  }
};

/** Resolves the component layout for the item kind (registration enforces it). */
const componentLayout = (input: ProcessorInput) => {
  const byRole = new Map(input.components.map((c) => [c.role, c]));
  const roles = [...byRole.keys()].sort().join(",");
  if (input.kind === "static" && roles === "still") {
    return { still: byRole.get("still")!, motion: null, pack: null };
  }
  if (input.kind === "live" && roles === "motion,still") {
    return {
      still: byRole.get("still")!,
      motion: byRole.get("motion")!,
      pack: null,
    };
  }
  if (input.kind === "live" && roles === "package") {
    return { still: null, motion: null, pack: byRole.get("package")! };
  }
  throw new MediaProcessingInputError();
};

async function materialize(
  store: ProcessorMediaStore,
  job: MediaToolJob,
  component: Component,
  signal: AbortSignal | undefined,
) {
  const read = await store.openRead(component.storageKey);
  if (read?.status !== "ok") throw new MediaProcessingUnavailableError(null);
  if (read.byteSize !== component.byteSize) {
    await read.close();
    throw new MediaProcessingUnavailableError(null);
  }
  const target = job.inputPath(component.role);
  const handle = await open(target, "wx", 0o644);
  const hash = createHash("sha256");
  try {
    await pipeline(
      read.body,
      new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          hash.update(chunk);
          callback(null, chunk);
        },
      }),
      handle.createWriteStream(),
      withSignal(signal),
    );
  } finally {
    await read.close();
    await handle.close().catch(() => undefined);
  }
  await chmod(target, 0o644);
  if (hash.digest("hex") !== component.sha256) {
    throw new MediaProcessingUnavailableError(null);
  }
}

async function copyRange(
  sourcePath: string,
  start: number,
  length: number,
  targetPath: string,
  signal: AbortSignal | undefined,
) {
  const handle = await open(targetPath, "wx", 0o644);
  try {
    await pipeline(
      createReadStream(sourcePath, { start, end: start + length - 1 }),
      handle.createWriteStream(),
      withSignal(signal),
    );
  } finally {
    await handle.close().catch(() => undefined);
  }
  await chmod(targetPath, 0o644);
}

const readHead = (reader: ByteReader, bytes: number) =>
  reader.read(0, Math.min(bytes, reader.size));

/**
 * Splits a Motion Photo package into the `still` and/or `motion` job inputs.
 * A package without a Motion Photo directory is unsupported; an inconsistent
 * directory fails decoding.
 */
async function splitMotionPhoto(
  job: MediaToolJob,
  declaredType: string,
  needs: { readonly still: boolean; readonly motion: boolean },
  signal: AbortSignal | undefined,
): Promise<"image/jpeg" | "image/heic" | "image/heif"> {
  const packagePath = job.inputPath("package");
  const reader = await openFileByteReader(packagePath);
  try {
    const signature = sniffSignature(
      await readHead(reader, SIGNATURE_HEAD_BYTES),
    );
    if (
      (signature.type !== "image/jpeg" &&
        signature.type !== "image/heic" &&
        signature.type !== "image/heif") ||
      !declaredTypeMatches(declaredType, signature.type)
    ) {
      throw new MediaRejectedError("unsupported_type");
    }
    const packets =
      signature.type === "image/jpeg"
        ? readJpegXmpPackets(await readHead(reader, METADATA_HEAD_BYTES))
        : await readHeifXmpPackets(reader);
    const directory =
      packets.map(readMotionPhotoDirectory).find((items) => items !== null) ??
      null;
    if (!directory) throw new MediaRejectedError("unsupported_type");
    const layout = await locateMotionPhotoVideo(
      reader,
      signature.type,
      directory,
    );
    if (needs.still) {
      await copyRange(
        packagePath,
        0,
        layout.primaryLength,
        job.inputPath("still"),
        signal,
      );
    }
    if (needs.motion) {
      await copyRange(
        packagePath,
        layout.videoStart,
        layout.videoLength,
        job.inputPath("motion"),
        signal,
      );
    }
    return signature.type;
  } finally {
    await reader.close();
  }
}

interface StillContainer {
  readonly detectedType: PublishingMediaStoreContentType;
  readonly contentIdentifier: string | null;
  /** EXIF Orientation from a HEIF Exif item (other formats use the decoder). */
  readonly heifExifOrientation: number | null;
}

const parsedOrNull = async <T>(read: () => Promise<T | null>) => {
  try {
    return await read();
  } catch (error) {
    if (error instanceof MediaParseError) return null;
    throw error;
  }
};

/** Container checks and metadata reads of the still; no tool runs. */
async function inspectStillContainer(
  job: MediaToolJob,
  declaredType: string,
  facts: { readonly identifier: boolean; readonly orientation: boolean },
): Promise<StillContainer> {
  const reader = await openFileByteReader(job.inputPath("still"));
  try {
    const signature = sniffSignature(
      await readHead(reader, SIGNATURE_HEAD_BYTES),
    );
    if (signature.type === "image/gif") {
      let frames = 1;
      try {
        frames = countGifFrames(await readHead(reader, GIF_SCAN_BYTES));
      } catch {
        // Malformed or oversized GIFs are unsupported either way.
      }
      throw new MediaRejectedError(
        frames > 1 ? "animated_image_unsupported" : "unsupported_type",
      );
    }
    if (!STILL_TYPES.has(signature.type)) {
      throw new MediaRejectedError("unsupported_type");
    }
    if (signature.animated) {
      throw new MediaRejectedError("animated_image_unsupported");
    }
    if (!declaredTypeMatches(declaredType, signature.type)) {
      throw new MediaRejectedError("unsupported_type");
    }
    const detectedType = signature.type as PublishingMediaStoreContentType;
    const heif = detectedType === "image/heic" || detectedType === "image/heif";
    if (
      detectedType === "image/png" &&
      (await pngHasAnimationControl(reader))
    ) {
      throw new MediaRejectedError("animated_image_unsupported");
    }
    if (
      heif &&
      (await readTopLevelBoxes(reader)).some((b) => b.type === "moov")
    ) {
      throw new MediaRejectedError("animated_image_unsupported");
    }
    let tiff: Uint8Array | null = null;
    if (facts.identifier && detectedType === "image/jpeg") {
      const head = await readHead(reader, METADATA_HEAD_BYTES);
      tiff = await parsedOrNull(async () => readJpegExifTiff(head));
    } else if (heif && (facts.identifier || facts.orientation)) {
      tiff = await parsedOrNull(() => readHeifExifTiff(reader));
    }
    const exif = tiff;
    return {
      detectedType,
      contentIdentifier:
        facts.identifier && exif
          ? await parsedOrNull(async () => readExifContentIdentifier(exif))
          : null,
      heifExifOrientation:
        facts.orientation && heif && exif
          ? await parsedOrNull(async () => readExifSummary(exif).orientation)
          : null,
    };
  } finally {
    await reader.close();
  }
}

interface MotionContainer {
  readonly detectedType: PublishingMediaStoreContentType;
  readonly contentIdentifier: string | null;
  readonly trackRotation: number | null;
}

/** Container checks and metadata reads of the motion; no tool runs. */
async function inspectMotionContainer(
  job: MediaToolJob,
  declaredType: string,
  readIdentifier: boolean,
): Promise<MotionContainer> {
  const reader = await openFileByteReader(job.inputPath("motion"));
  try {
    const signature = sniffSignature(
      await readHead(reader, SIGNATURE_HEAD_BYTES),
    );
    if (
      (signature.type !== "video/quicktime" &&
        signature.type !== "video/mp4") ||
      !declaredTypeMatches(declaredType, signature.type)
    ) {
      throw new MediaRejectedError("unsupported_type");
    }
    const moov = await readTopLevelBox(
      reader,
      "moov",
      ISOBMFF_LIMITS.maxMovieBoxBytes,
    );
    if (!moov) throw new MediaRejectedError("decode_failed");
    return {
      detectedType: signature.type,
      trackRotation: readVideoTrackRotation(moov.bytes),
      contentIdentifier: readIdentifier
        ? await parsedOrNull(async () =>
            readQuickTimeContentIdentifier(moov.bytes),
          )
        : null,
    };
  } finally {
    await reader.close();
  }
}

interface DecodedStill {
  readonly source: StaticSource;
  readonly inspection: StaticInspection;
}

async function decodeStill(
  runner: MediaToolsRunner,
  job: MediaToolJob,
  container: StillContainer,
  signal: AbortSignal | undefined,
): Promise<DecodedStill> {
  let source: StaticSource;
  if (
    container.detectedType === "image/heic" ||
    container.detectedType === "image/heif"
  ) {
    let decoded;
    try {
      decoded = await heifDecodeToPng(runner, job, "still", signal);
    } catch (error) {
      if (error instanceof MediaToolError && error.code === "tool_failed") {
        throw new MediaRejectedError("decode_failed");
      }
      throw error;
    }
    // A host-written copy inside the read-only job input; never a link.
    source = { input: decoded.path, autoOrient: false, expectedFormat: "png" };
  } else {
    source = {
      input: job.inputPath("still"),
      autoOrient: true,
      expectedFormat: container.detectedType.slice("image/".length) as
        "jpeg" | "png" | "webp",
    };
  }
  return { source, inspection: await inspectStaticSource(source) };
}

const mismatch = () => new MediaRejectedError("pairing_mismatch");

/**
 * Decides the pairing before any tool runs. Server-read Apple identifiers
 * win; a client claim that contradicts them, or a container claim next to an
 * Apple identifier, is a mismatch. Only Standard items may rely on a client
 * proof, because optimization strips the identifiers.
 */
const decidePairing = (
  input: ProcessorInput,
  packaged: boolean,
  stillId: string | null,
  motionId: string | null,
): ProcessorPairing | null => {
  if (input.kind === "static") return null;
  const client = input.clientPairing;
  const stillTime = (method: ProcessorPairingMethod) =>
    client?.method === method && client.stillTimeMs !== undefined
      ? { stillTimeMs: client.stillTimeMs }
      : {};
  if (packaged) {
    if (client?.method === "apple-content-identifier") throw mismatch();
    return {
      method: "motion-photo-container",
      verifiedBy: "server",
      identifierSha256: null,
      ...stillTime("motion-photo-container"),
    };
  }
  if (stillId !== null && motionId !== null) {
    if (stillId !== motionId) throw mismatch();
    const digest = contentIdentifierSha256(stillId);
    if (
      client &&
      client.method !== "none" &&
      (client.method !== "apple-content-identifier" ||
        client.identifierSha256 !== digest)
    ) {
      throw mismatch();
    }
    return {
      method: "apple-content-identifier",
      verifiedBy: "server",
      identifierSha256: digest,
      ...stillTime("apple-content-identifier"),
    };
  }
  if (input.qualityMode === "original" || !client || client.method === "none") {
    throw mismatch();
  }
  const surviving = stillId ?? motionId;
  if (
    surviving !== null &&
    (client.method !== "apple-content-identifier" ||
      contentIdentifierSha256(surviving) !== client.identifierSha256)
  ) {
    throw mismatch();
  }
  return {
    method: client.method,
    verifiedBy: "client",
    identifierSha256:
      client.method === "apple-content-identifier"
        ? client.identifierSha256
        : null,
    ...stillTime(client.method),
  };
};

async function storeFile(
  store: ProcessorMediaStore,
  ownerId: string,
  filePath: string,
  byteSize: number,
  signal: AbortSignal | undefined,
) {
  const handle = await open(
    filePath,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  );
  let body: ReturnType<typeof handle.createReadStream> | undefined;
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size !== byteSize) {
      throw new MediaRejectedError("processing_failed");
    }
    body = handle.createReadStream();
    return await store.writeStream(
      ownerId,
      "derivative",
      "video/mp4",
      byteSize,
      body,
      { requireExactSize: true, ...withSignal(signal) },
    );
  } finally {
    // A stream keeps its FileHandle referenced until it is destroyed.
    body?.destroy();
    await handle.close().catch(() => undefined);
  }
}

/**
 * Maps a failure to a rejection or rethrows it as a retryable, content-free
 * error. Mode `derive` retries timeouts instead of rejecting.
 */
function settleFailure(
  error: unknown,
  input: ProcessorInput,
): Extract<ProcessorOutcome, { status: "rejected" }> {
  if (input.signal?.aborted) throw new MediaToolError("aborted");
  let failureCode: MediaFailureCode | null = null;
  if (error instanceof MediaRejectedError) failureCode = error.failureCode;
  else if (error instanceof MediaParseError) failureCode = "decode_failed";
  else if (error instanceof MediaToolError) {
    if (error.code === "timeout") failureCode = "processing_timeout";
    if (error.code === "tool_failed" || error.code === "output_limit") {
      failureCode = "processing_failed";
    }
  }
  if (failureCode === "processing_timeout" && input.mode === "derive") {
    throw new MediaToolError("timeout");
  }
  if (failureCode !== null) return { status: "rejected", failureCode };
  if (
    error instanceof MediaToolError ||
    error instanceof PublishingMediaStoreError ||
    error instanceof MediaProcessingInputError ||
    error instanceof MediaProcessingUnavailableError
  ) {
    throw error;
  }
  throw new MediaProcessingUnavailableError(systemErrorCode(error));
}

async function processItem(
  { store, runner }: PublishingMediaProcessorOptions,
  input: ProcessorInput,
): Promise<ProcessorOutcome> {
  assertInput(input);
  const layout = componentLayout(input);
  const edit = parseEdit(input.edit);
  const coverCrop = parseCrop(input.coverCrop);
  const usesCoverCrop = input.variants.some((variant) =>
    COVER_CROPPED_VARIANTS.has(variant as StaticDerivativeVariant),
  );
  if (
    input.editKey === "base" &&
    (!isIdentityEdit(edit) || (coverCrop !== null && usesCoverCrop))
  ) {
    throw new MediaProcessingInputError();
  }
  const signal = input.signal;
  const processing = input.mode === "process";
  const live = input.kind === "live";
  const needStill =
    processing || input.variants.some((variant) => variant !== "motion");
  const needMotion = live && (processing || input.variants.includes("motion"));
  const written: string[] = [];
  let job: MediaToolJob | undefined;
  try {
    job = await runner.createJob();
    let stillDeclared: string | undefined;
    let motionDeclared: string | undefined;
    let packageType: PublishingMediaStoreContentType | null = null;
    if (layout.pack) {
      await materialize(store, job, layout.pack, signal);
      packageType = await splitMotionPhoto(
        job,
        layout.pack.declaredType,
        { still: needStill, motion: needMotion },
        signal,
      );
      stillDeclared = packageType;
      motionDeclared = "video/mp4";
    } else {
      if (needStill) await materialize(store, job, layout.still, signal);
      if (needMotion) await materialize(store, job, layout.motion!, signal);
      stillDeclared = layout.still.declaredType;
      motionDeclared = layout.motion?.declaredType;
    }

    // Cheap container and identifier checks first; tools run only after.
    const pairedComponents = processing && live && !layout.pack;
    const stillContainer = needStill
      ? await inspectStillContainer(job, stillDeclared, {
          identifier: pairedComponents,
          orientation: processing,
        })
      : null;
    const motionContainer = needMotion
      ? await inspectMotionContainer(job, motionDeclared!, pairedComponents)
      : null;
    const pairing = processing
      ? decidePairing(
          input,
          layout.pack !== null,
          stillContainer?.contentIdentifier ?? null,
          motionContainer?.contentIdentifier ?? null,
        )
      : null;

    const still = stillContainer
      ? await decodeStill(runner, job, stillContainer, signal)
      : null;
    let motion: MotionProbe | null = null;
    if (motionContainer) {
      motion = await probeMotionInput(runner, job, "motion", signal);
      if (
        motionContainer.trackRotation !== null &&
        motionContainer.trackRotation !== motion.rotation
      ) {
        throw new MediaRejectedError("stream_layout_unsupported");
      }
      if (
        pairing?.stillTimeMs !== undefined &&
        pairing.stillTimeMs > motion.durationMs
      ) {
        throw mismatch();
      }
    }

    const derivatives: ProcessorDerivative[] = [];
    for (const variant of input.variants) {
      if (variant === "motion") {
        const file = await renderMotionDerivative(
          runner,
          job,
          "motion",
          "motion-output.mp4",
          motion!,
          edit,
          signal,
        );
        const stored = await storeFile(
          store,
          input.ownerId,
          file.path,
          file.byteSize,
          signal,
        );
        written.push(stored.storageKey);
        derivatives.push({
          ...stored,
          variant,
          editKey: input.editKey,
          contentType: "video/mp4",
          width: file.width,
          height: file.height,
          durationMs: file.durationMs,
        });
        continue;
      }
      const rendered = await renderStaticDerivative(
        still!.source,
        still!.inspection,
        variant,
        edit,
        coverCrop,
      );
      const stored = await store.writeStream(
        input.ownerId,
        "derivative",
        "image/webp",
        rendered.buffer.byteLength,
        (async function* () {
          yield rendered.buffer;
        })(),
        { requireExactSize: true, ...withSignal(signal) },
      );
      written.push(stored.storageKey);
      derivatives.push({
        ...stored,
        variant,
        editKey: input.editKey,
        contentType: "image/webp",
        width: rendered.width,
        height: rendered.height,
        durationMs: null,
      });
    }
    if (!processing) return { status: "derived", derivatives };
    const detectedTypes = packageType
      ? [{ role: "package" as const, contentType: packageType }]
      : [
          { role: "still" as const, contentType: stillContainer!.detectedType },
          ...(motionContainer
            ? [
                {
                  role: "motion" as const,
                  contentType: motionContainer.detectedType,
                },
              ]
            : []),
        ];
    const heifStill =
      stillContainer!.detectedType === "image/heic" ||
      stillContainer!.detectedType === "image/heif";
    return {
      status: "processed",
      detectedTypes,
      presentation: {
        width: still!.inspection.width,
        height: still!.inspection.height,
        ...(motion
          ? {
              durationMs: motion.durationMs,
              hasAudio: motion.hasAudio,
              displayRotation: motion.rotation,
            }
          : {}),
      },
      pairing,
      stillExifOrientation: heifStill
        ? stillContainer!.heifExifOrientation
        : still!.inspection.orientation,
      derivatives,
    };
  } catch (caught) {
    await Promise.all(
      written.map((key) => store.remove(key).catch(() => undefined)),
    );
    return settleFailure(caught, input);
  } finally {
    await job?.dispose().catch(() => undefined);
  }
}

/**
 * Validates received components (signatures, containers, pairing, decode)
 * and commits the requested derivatives to the media store. Implements
 * `PublishingMediaProcessorPort` structurally.
 */
export function createPublishingMediaProcessor(
  options: PublishingMediaProcessorOptions,
): { process(input: ProcessorInput): Promise<ProcessorOutcome> } {
  return { process: (input) => processItem(options, input) };
}
