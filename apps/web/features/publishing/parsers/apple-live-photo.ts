import { sha256HexOfText } from "../hashing";
import { MediaParseError, asciiEquals, readHead, u32be } from "./bytes";
import {
  ISOBMFF_LIMITS,
  findHeifExifItemId,
  parseHeifMeta,
  readHeifItem,
  readTopLevelBox,
} from "./isobmff";
import {
  JPEG_LIMITS,
  TiffReader,
  readExifSummary,
  readJpegExifTiff,
} from "./tiff-exif";

import type { ByteReader } from "./bytes";

/**
 * Apple Live Photo pairing identifiers (L03): the still's MakerNote
 * ContentIdentifier (HEIC Exif item or JPEG APP1) and the motion's
 * `com.apple.quicktime.content.identifier` (see quicktime.ts). Only the
 * SHA-256 of the canonical identifier ever leaves the browser.
 */

/** Apple MakerNote tag 0x0011 (ContentIdentifier, the Live Photo pair UUID). */
export const APPLE_CONTENT_IDENTIFIER_TAG = 0x0011;
const APPLE_MAKER_NOTE_HEADER = "Apple iOS\0";
const APPLE_MAKER_NOTE_IFD_OFFSET = 14;
const UUID_PATTERN =
  /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/u;

/** Uppercase canonical UUID, or null when the value is not a UUID. */
export function normalizeContentIdentifier(value: string): string | null {
  const upper = value.trim().toUpperCase();
  return UUID_PATTERN.test(upper) ? upper : null;
}

/** The pairing fact sent to the Backend: SHA-256 of the canonical identifier. */
export const contentIdentifierSha256 = (identifier: string): string =>
  sha256HexOfText(identifier);

/**
 * Reads ContentIdentifier from an Apple MakerNote (`Apple iOS\0`, version,
 * byte order, IFD at +14; value offsets relative to the MakerNote start).
 */
export function readAppleMakerNoteContentIdentifier(
  makerNote: Uint8Array,
): string | null {
  if (!asciiEquals(makerNote, 0, APPLE_MAKER_NOTE_HEADER)) return null;
  let littleEndian: boolean;
  if (asciiEquals(makerNote, 12, "MM")) littleEndian = false;
  else if (asciiEquals(makerNote, 12, "II")) littleEndian = true;
  else throw new MediaParseError("structure_invalid");
  const reader = new TiffReader(makerNote, littleEndian);
  const entry = reader
    .readIfd(APPLE_MAKER_NOTE_IFD_OFFSET)
    .get(APPLE_CONTENT_IDENTIFIER_TAG);
  if (!entry || entry.type !== 2) return null;
  return normalizeContentIdentifier(reader.ascii(entry));
}

export interface StillExifFacts {
  /** EXIF orientation 1..8, or null when absent. */
  readonly orientation: number | null;
  /** Canonical Apple ContentIdentifier, or null. */
  readonly contentIdentifier: string | null;
  /** Whether an Apple MakerNote was present (a coarse metadata fact). */
  readonly appleMakerNote: boolean;
}

const NO_FACTS: StillExifFacts = {
  orientation: null,
  contentIdentifier: null,
  appleMakerNote: false,
};

/** Orientation and identifier from a TIFF/Exif block. */
export function readStillExifFacts(tiff: Uint8Array): StillExifFacts {
  const summary = readExifSummary(tiff);
  if (!summary.makerNote)
    return { ...NO_FACTS, orientation: summary.orientation };
  const note = tiff.subarray(summary.makerNote.start, summary.makerNote.end);
  return {
    orientation: summary.orientation,
    contentIdentifier: readAppleMakerNoteContentIdentifier(note),
    appleMakerNote: asciiEquals(note, 0, APPLE_MAKER_NOTE_HEADER),
  };
}

/** HEIF Exif item payload: 4-byte TIFF header offset, then the block. */
export function exifItemTiff(item: Uint8Array): Uint8Array {
  const skip = u32be(item, 0);
  if (skip > item.byteLength - 4) throw new MediaParseError("offset_invalid");
  return item.subarray(4 + skip);
}

/** TIFF block of the primary image's Exif item, or null when there is none. */
export async function readHeifExifTiff(
  reader: ByteReader,
): Promise<Uint8Array | null> {
  const meta = await readTopLevelBox(
    reader,
    "meta",
    ISOBMFF_LIMITS.maxMetaBoxBytes,
  );
  if (!meta) throw new MediaParseError("structure_invalid");
  const parsed = parseHeifMeta(meta.bytes);
  const exifId = findHeifExifItemId(parsed);
  if (exifId === null) return null;
  return exifItemTiff(await readHeifItem(reader, meta.bytes, parsed, exifId));
}

/** Exif facts of a JPEG (APP1) or HEIC/HEIF (Exif item) still. */
export async function readStillFacts(
  reader: ByteReader,
  type: "image/jpeg" | "image/heic" | "image/heif",
): Promise<StillExifFacts> {
  const tiff =
    type === "image/jpeg"
      ? readJpegExifTiff(await readHead(reader, JPEG_LIMITS.maxHeaderBytes))
      : await readHeifExifTiff(reader);
  return tiff ? readStillExifFacts(tiff) : NO_FACTS;
}
