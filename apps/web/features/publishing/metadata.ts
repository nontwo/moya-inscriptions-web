import type { MediaClientSource, MediaMetadata } from "@moya/contracts";

/**
 * Bounded, private metadata read from the source before Standard
 * optimization strips it (Q04, M05). exifr reads a bounded number of chunks;
 * the Apple MakerNote facts come from the client parser. Values are
 * allowlisted camera facts; serial numbers, maker-note blobs, thumbnails and
 * the pairing identifier itself are never included. The result is sent only
 * with item registration (stored privately by the Backend) and is never
 * logged, cached locally or shown publicly.
 */

export const METADATA_PARSER = "exifr@7.1.3";

/** exifr reading bounds: at most 16 chunks of 64 KiB (≈ 1 MiB). */
export const EXIFR_READ_OPTIONS = {
  firstChunkSize: 64 * 1024,
  chunkSize: 64 * 1024,
  chunkLimit: 16,
} as const;

const MAX_SERIALIZED_BYTES = 16 * 1024;
const MAX_STRING_LENGTH = 128;
const MAX_ARRAY_LENGTH = 16;

/** exifr tag name → stored key. Only these facts are ever kept. */
const PICKED_TAGS: Readonly<Record<string, string>> = {
  Make: "exif:Make",
  Model: "exif:Model",
  LensMake: "exif:LensMake",
  LensModel: "exif:LensModel",
  DateTimeOriginal: "exif:DateTimeOriginal",
  OffsetTimeOriginal: "exif:OffsetTimeOriginal",
  SubSecTimeOriginal: "exif:SubSecTimeOriginal",
  ExposureTime: "exif:ExposureTime",
  FNumber: "exif:FNumber",
  ISO: "exif:ISO",
  FocalLength: "exif:FocalLength",
  FocalLengthIn35mmFormat: "exif:FocalLengthIn35mmFormat",
  ExposureCompensation: "exif:ExposureCompensation",
  Flash: "exif:Flash",
  WhiteBalance: "exif:WhiteBalance",
  MeteringMode: "exif:MeteringMode",
  Orientation: "exif:Orientation",
  ColorSpace: "exif:ColorSpace",
  ExifImageWidth: "exif:ExifImageWidth",
  ExifImageHeight: "exif:ExifImageHeight",
  GPSAltitude: "gps:Altitude",
};

const GPS_TAGS = [
  "GPSLatitude",
  "GPSLatitudeRef",
  "GPSLongitude",
  "GPSLongitudeRef",
  "GPSAltitudeRef",
];

export type ExifrParse = (
  file: Blob,
  options: Record<string, unknown>,
) => Promise<Record<string, unknown> | undefined>;

const defaultParse: ExifrParse = async (file, options) => {
  const exifr = await import("exifr");
  return (await exifr.parse(file, options)) as
    Record<string, unknown> | undefined;
};

type Scalar = string | number | boolean | null;

const cleanString = (value: string): string | null => {
  // Drop control characters, NUL and lone surrogates; keep a bounded prefix.
  const text = [...value]
    .filter((character) => {
      const code = character.codePointAt(0)!;
      return (
        code >= 0x20 && !(code >= 0xd800 && code <= 0xdfff) && code !== 0x7f
      );
    })
    .join("")
    .trim();
  if (text === "") return null;
  return [...text].slice(0, MAX_STRING_LENGTH).join("");
};

const cleanScalar = (value: unknown): Scalar | undefined => {
  if (typeof value === "string") return cleanString(value) ?? undefined;
  if (typeof value === "number")
    return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : undefined;
  if (typeof value === "boolean") return value;
  return undefined;
};

const cleanValue = (value: unknown): Scalar | Scalar[] | undefined => {
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    if (value instanceof Uint8Array) return undefined; // binary payloads are never kept
    const items = [...(value as ArrayLike<unknown> & Iterable<unknown>)]
      .slice(0, MAX_ARRAY_LENGTH)
      .map(cleanScalar)
      .filter((item): item is Scalar => item !== undefined);
    return items.length === 0 ? undefined : items;
  }
  return cleanScalar(value);
};

/** Decimal degrees from exifr's raw [degrees, minutes, seconds] and reference. */
export const gpsDecimal = (raw: unknown, reference: unknown): number | null => {
  if (!Array.isArray(raw) || raw.length !== 3) return null;
  const [degrees, minutes, seconds] = raw as unknown[];
  if (
    typeof degrees !== "number" ||
    typeof minutes !== "number" ||
    typeof seconds !== "number" ||
    ![degrees, minutes, seconds].every(Number.isFinite)
  )
    return null;
  const value = degrees + minutes / 60 + seconds / 3600;
  const negative = reference === "S" || reference === "W";
  const signed = negative ? -value : value;
  return Math.abs(signed) <= 180 ? Math.round(signed * 1e6) / 1e6 : null;
};

export interface ClientStillFacts {
  readonly appleMakerNote: boolean;
  readonly livePhotoIdentifier: boolean;
  readonly exifOrientation: number | null;
}

const serializedBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

/** Stays within the serialized bound by dropping the last value keys if needed. */
const withinSerializedBound = (metadata: MediaMetadata): MediaMetadata => {
  if (serializedBytes(metadata) <= MAX_SERIALIZED_BYTES) return metadata;
  const values: Record<string, unknown> = { ...metadata.values };
  const bounded = { ...metadata, values } as MediaMetadata;
  while (
    serializedBytes(bounded) > MAX_SERIALIZED_BYTES &&
    Object.keys(values).length > 0
  ) {
    const last = Object.keys(values).pop()!;
    delete values[last];
  }
  return bounded;
};

/**
 * Builds contract metadata from exifr output plus client parser facts.
 * `status` is `parsed` when exifr produced facts, `partial` when only the
 * client parser did (or exifr failed), `absent` when nothing was found.
 */
export const buildMediaMetadata = (
  exif: Record<string, unknown> | undefined,
  exifFailed: boolean,
  facts: ClientStillFacts | null,
): MediaMetadata => {
  const values: Record<string, Scalar | Scalar[]> = {};
  if (exif) {
    for (const [tag, key] of Object.entries(PICKED_TAGS)) {
      if (!Object.hasOwn(exif, tag)) continue;
      const cleaned = cleanValue(exif[tag]);
      if (cleaned !== undefined) values[key] = cleaned;
    }
    const latitude = gpsDecimal(exif.GPSLatitude, exif.GPSLatitudeRef);
    const longitude = gpsDecimal(exif.GPSLongitude, exif.GPSLongitudeRef);
    if (latitude !== null && longitude !== null) {
      values["gps:Latitude"] = latitude;
      values["gps:Longitude"] = longitude;
    } else {
      delete values["gps:Altitude"];
    }
  }
  const exifKeys = Object.keys(values).length;
  if (facts) {
    if (facts.appleMakerNote) values["apple:MakerNote"] = true;
    if (facts.livePhotoIdentifier) values["apple:LivePhotoIdentifier"] = true;
    if (
      facts.exifOrientation !== null &&
      values["exif:Orientation"] === undefined
    )
      values["exif:Orientation"] = facts.exifOrientation;
  }
  const keys = Object.keys(values);
  const status =
    keys.length === 0
      ? "absent"
      : exifKeys > 0 && !exifFailed
        ? "parsed"
        : "partial";
  return withinSerializedBound({
    provenance: { source: "client", parser: METADATA_PARSER, status },
    values: status === "absent" ? {} : values,
  });
};

/**
 * Adds how the item was selected (picker, drop or clipboard) to its private
 * metadata provenance. Presentation provenance only; it proves nothing about
 * originality and never authorizes anything. Without extracted metadata the
 * provenance is recorded with no values.
 */
export const withClientSource = (
  metadata: MediaMetadata | undefined,
  clientSource: MediaClientSource | null,
): MediaMetadata | undefined => {
  if (clientSource === null) return metadata;
  const base = metadata ?? buildMediaMetadata(undefined, true, null);
  return withinSerializedBound({
    ...base,
    provenance: { ...base.provenance, clientSource },
  });
};

/** Reads bounded metadata from a still source; never throws. */
export const extractMediaMetadata = async (
  file: Blob,
  facts: ClientStillFacts | null,
  parse: ExifrParse = defaultParse,
): Promise<MediaMetadata> => {
  let exif: Record<string, unknown> | undefined;
  let failed = false;
  try {
    exif = await parse(file, {
      ...EXIFR_READ_OPTIONS,
      pick: [...Object.keys(PICKED_TAGS), ...GPS_TAGS],
      tiff: true,
      exif: true,
      gps: true,
      ifd1: false,
      interop: false,
      makerNote: false,
      userComment: false,
      xmp: false,
      icc: false,
      iptc: false,
      jfif: false,
      ihdr: false,
      translateKeys: true,
      translateValues: false,
      reviveValues: false,
      sanitize: true,
      mergeOutput: true,
      silentErrors: true,
    });
  } catch {
    failed = true;
  }
  return buildMediaMetadata(exif, failed, facts);
};
