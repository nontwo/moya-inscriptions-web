import { normalizeContentIdentifier } from "./apple-live-photo";
import { MediaParseError, asciiEquals, fourCc, u32be, u64be } from "./bytes";
import { listBoxes, parseBoxHeader, readMovieBox } from "./isobmff";

import type { ByteReader } from "./bytes";
import type { BoxHeader } from "./isobmff";

/**
 * QuickTime/MP4 motion component facts: the Apple Live Photo content
 * identifier from keys+ilst metadata in `moov/meta` (camera files) or
 * `moov/udta/meta` (remuxers), and the stream layout needed to tell a Live
 * Photo motion from an independent video.
 */

export const QUICKTIME_CONTENT_IDENTIFIER_KEY =
  "com.apple.quicktime.content.identifier";

const MAX_KEYS = 1024;
const MAX_KEY_BYTES = 256;
const MAX_VALUE_BYTES = 256;
const MAX_META_BOXES = 4;

/** Children of a QuickTime `meta` atom, which may or may not be a FullBox. */
const metaChildren = (bytes: Uint8Array, meta: BoxHeader): BoxHeader[] => {
  try {
    const plain = listBoxes(bytes, meta.contentStart, meta.end);
    if (plain.some((box) => box.type === "hdlr" || box.type === "keys"))
      return plain;
  } catch {
    // Fall through to the ISO FullBox layout.
  }
  return listBoxes(bytes, meta.contentStart + 4, meta.end);
};

const utf8 = new TextDecoder("utf-8", { fatal: true });

const readKeyedContentIdentifier = (
  moovBytes: Uint8Array,
  meta: BoxHeader,
): string | null => {
  const children = metaChildren(moovBytes, meta);
  const keys = children.find((box) => box.type === "keys");
  const ilst = children.find((box) => box.type === "ilst");
  if (!keys || !ilst) return null;
  let cursor = keys.contentStart + 4;
  const count = u32be(moovBytes, cursor);
  cursor += 4;
  if (count > MAX_KEYS) throw new MediaParseError("limit_exceeded");
  let keyIndex: number | null = null;
  for (let index = 1; index <= count; index += 1) {
    if (cursor + 8 > keys.end) throw new MediaParseError("truncated");
    const size = u32be(moovBytes, cursor);
    if (size < 8 || cursor + size > keys.end)
      throw new MediaParseError("box_invalid");
    if (
      keyIndex === null &&
      fourCc(moovBytes, cursor + 4) === "mdta" &&
      size - 8 === QUICKTIME_CONTENT_IDENTIFIER_KEY.length &&
      size - 8 <= MAX_KEY_BYTES &&
      asciiEquals(moovBytes, cursor + 8, QUICKTIME_CONTENT_IDENTIFIER_KEY)
    )
      keyIndex = index;
    cursor += size;
  }
  if (keyIndex === null) return null;
  for (const entry of listBoxes(moovBytes, ilst.contentStart, ilst.end)) {
    if (u32be(moovBytes, entry.start + 4) !== keyIndex) continue;
    const data = listBoxes(moovBytes, entry.contentStart, entry.end).find(
      (box) => box.type === "data",
    );
    if (!data || data.contentStart + 8 > data.end)
      throw new MediaParseError("structure_invalid");
    // Type indicator 1 = UTF-8 well-known type.
    if (u32be(moovBytes, data.contentStart) !== 1) return null;
    const valueStart = data.contentStart + 8;
    if (data.end - valueStart > MAX_VALUE_BYTES)
      throw new MediaParseError("limit_exceeded");
    try {
      return normalizeContentIdentifier(
        utf8.decode(moovBytes.subarray(valueStart, data.end)),
      );
    } catch {
      return null;
    }
  }
  return null;
};

/** Reads the content identifier from complete `moov` bytes (rebased to 0). */
export function readQuickTimeContentIdentifier(
  moovBytes: Uint8Array,
): string | null {
  const moov = parseBoxHeader(moovBytes, 0, moovBytes.byteLength);
  if (moov.type !== "moov") throw new MediaParseError("structure_invalid");
  const children = listBoxes(moovBytes, moov.contentStart, moov.end);
  const metas = children.filter((box) => box.type === "meta");
  for (const udta of children.filter((box) => box.type === "udta"))
    metas.push(
      ...listBoxes(moovBytes, udta.contentStart, udta.end).filter(
        (box) => box.type === "meta",
      ),
    );
  for (const meta of metas.slice(0, MAX_META_BOXES)) {
    const identifier = readKeyedContentIdentifier(moovBytes, meta);
    if (identifier !== null) return identifier;
  }
  return null;
}

export const QUICKTIME_STILL_IMAGE_TIME_KEY =
  "com.apple.quicktime.still-image-time";

const MAX_TIMING_ENTRIES = 16_384;
const MAX_EDITS = 64;
const MAX_STILL_TIME_MS = 60_000;
const UNIT_RATE = 0x0001_0000;

const childBoxes = (bytes: Uint8Array, parent: BoxHeader | undefined) =>
  parent ? listBoxes(bytes, parent.contentStart, parent.end) : [];

const child = (
  bytes: Uint8Array,
  parent: BoxHeader | undefined,
  type: string,
) => childBoxes(bytes, parent).find((box) => box.type === type);

/** Timescale and duration of an `mvhd` or `mdhd` FullBox. */
const headerTiming = (
  bytes: Uint8Array,
  box: BoxHeader,
): { timescale: number; duration: number } => {
  const version = bytes[box.contentStart];
  if (version === 1)
    return {
      timescale: u32be(bytes, box.contentStart + 20),
      duration: u64be(bytes, box.contentStart + 24),
    };
  if (version !== 0) throw new MediaParseError("structure_invalid");
  return {
    timescale: u32be(bytes, box.contentStart + 12),
    duration: u32be(bytes, box.contentStart + 16),
  };
};

/** Whether a `mebx` sample entry declares exactly the still-image-time key. */
const declaresOnlyStillImageTime = (
  bytes: Uint8Array,
  stsd: BoxHeader,
): boolean => {
  if (u32be(bytes, stsd.contentStart + 4) < 1) return false;
  const entry = parseBoxHeader(bytes, stsd.contentStart + 8, stsd.end);
  if (entry.type !== "mebx") return false;
  // SampleEntry: 6 reserved bytes and a data reference index precede the atoms.
  const keys = listBoxes(bytes, entry.contentStart + 8, entry.end).find(
    (box) => box.type === "keys",
  );
  if (!keys) return false;
  const declared = listBoxes(bytes, keys.contentStart, keys.end);
  if (declared.length !== 1) return false;
  const keyd = listBoxes(
    bytes,
    declared[0]!.contentStart,
    declared[0]!.end,
  ).find((box) => box.type === "keyd");
  return (
    keyd !== undefined &&
    fourCc(bytes, keyd.contentStart) === "mdta" &&
    keyd.end - keyd.contentStart - 4 ===
      QUICKTIME_STILL_IMAGE_TIME_KEY.length &&
    asciiEquals(bytes, keyd.contentStart + 4, QUICKTIME_STILL_IMAGE_TIME_KEY)
  );
};

/** Media time of the first sample that carries a value (an item atom of ≥ 9 bytes). */
const firstValueSampleTime = (
  bytes: Uint8Array,
  stbl: BoxHeader,
): number | null => {
  const stsz = child(bytes, stbl, "stsz");
  const stts = child(bytes, stbl, "stts");
  if (!stsz || !stts || child(bytes, stbl, "ctts")) return null;
  const uniformSize = u32be(bytes, stsz.contentStart + 4);
  const sampleCount = u32be(bytes, stsz.contentStart + 8);
  let index = -1;
  for (
    let sample = 0;
    sample < Math.min(sampleCount, MAX_TIMING_ENTRIES);
    sample += 1
  ) {
    const size =
      uniformSize !== 0
        ? uniformSize
        : u32be(bytes, stsz.contentStart + 12 + sample * 4);
    if (size >= 9) {
      index = sample;
      break;
    }
  }
  if (index < 0) return null;
  const entries = u32be(bytes, stts.contentStart + 4);
  if (entries > MAX_TIMING_ENTRIES) throw new MediaParseError("limit_exceeded");
  let time = 0;
  let before = index;
  for (let entry = 0; entry < entries; entry += 1) {
    const offset = stts.contentStart + 8 + entry * 8;
    const count = u32be(bytes, offset);
    const delta = u32be(bytes, offset + 4);
    if (before < count) return time + before * delta;
    time += count * delta;
    before -= count;
  }
  return null;
};

/** Maps a media time through the track's edit list to seconds on the movie timeline. */
const presentationSeconds = (
  bytes: Uint8Array,
  trak: BoxHeader,
  mediaTime: number,
  mediaTimescale: number,
  movieTimescale: number,
): number | null => {
  const elst = child(bytes, child(bytes, trak, "edts"), "elst");
  if (!elst) return mediaTime / mediaTimescale;
  const version = bytes[elst.contentStart];
  if (version !== 0 && version !== 1)
    throw new MediaParseError("structure_invalid");
  const entries = u32be(bytes, elst.contentStart + 4);
  if (entries > MAX_EDITS) throw new MediaParseError("limit_exceeded");
  const entrySize = version === 1 ? 20 : 12;
  let movieCursor = 0;
  for (let entry = 0; entry < entries; entry += 1) {
    const offset = elst.contentStart + 8 + entry * entrySize;
    const segment = version === 1 ? u64be(bytes, offset) : u32be(bytes, offset);
    const high = u32be(bytes, offset + (version === 1 ? 8 : 4));
    const start =
      version === 1
        ? high === 0xffff_ffff && u32be(bytes, offset + 12) === 0xffff_ffff
          ? -1
          : u64be(bytes, offset + 8)
        : high === 0xffff_ffff
          ? -1
          : high;
    const rate = u32be(bytes, offset + entrySize - 4);
    if (start === -1) {
      movieCursor += segment;
      continue;
    }
    if (rate !== UNIT_RATE) return null;
    const segmentMedia = (segment * mediaTimescale) / movieTimescale;
    const last = entry === entries - 1;
    if (
      mediaTime >= start &&
      (mediaTime < start + segmentMedia || (last && segment === 0))
    )
      return (
        movieCursor / movieTimescale + (mediaTime - start) / mediaTimescale
      );
    movieCursor += segment;
  }
  return null;
};

/**
 * The Live Photo still's presentation time (ms on the movie timeline) from
 * the Apple `mebx` timed-metadata track that declares only
 * `com.apple.quicktime.still-image-time`: the first sample carrying a value,
 * mapped through the track's edit list. Null when absent, ambiguous or
 * outside the movie; Standard transcoding drops the track, so the client
 * sends this (L09).
 */
export function readStillImageTimeMs(moovBytes: Uint8Array): number | null {
  const moov = parseBoxHeader(moovBytes, 0, moovBytes.byteLength);
  const children = listBoxes(moovBytes, moov.contentStart, moov.end);
  const mvhd = children.find((box) => box.type === "mvhd");
  if (!mvhd) return null;
  const movie = headerTiming(moovBytes, mvhd);
  if (movie.timescale === 0) return null;
  const found: number[] = [];
  for (const trak of children) {
    if (trak.type !== "trak") continue;
    const mdia = child(moovBytes, trak, "mdia");
    const hdlr = child(moovBytes, mdia, "hdlr");
    if (!hdlr || hdlr.contentStart + 12 > hdlr.end) continue;
    if (fourCc(moovBytes, hdlr.contentStart + 8) !== "meta") continue;
    const stbl = child(moovBytes, child(moovBytes, mdia, "minf"), "stbl");
    const stsd = child(moovBytes, stbl, "stsd");
    const mdhd = child(moovBytes, mdia, "mdhd");
    if (!stbl || !stsd || !mdhd) continue;
    if (!declaresOnlyStillImageTime(moovBytes, stsd)) continue;
    const media = headerTiming(moovBytes, mdhd);
    if (media.timescale === 0) continue;
    const sampleTime = firstValueSampleTime(moovBytes, stbl);
    if (sampleTime === null) continue;
    const seconds = presentationSeconds(
      moovBytes,
      trak,
      sampleTime,
      media.timescale,
      movie.timescale,
    );
    if (seconds !== null) found.push(Math.round(seconds * 1000));
  }
  // One unambiguous still time within the movie, or nothing.
  if (found.length !== 1) return null;
  const stillTimeMs = found[0]!;
  const movieMs = (movie.duration * 1000) / movie.timescale;
  return stillTimeMs >= 0 &&
    stillTimeMs <= MAX_STILL_TIME_MS &&
    (movie.duration === 0 || stillTimeMs <= movieMs)
    ? stillTimeMs
    : null;
}

export interface MotionFacts {
  readonly contentIdentifier: string | null;
  readonly videoTracks: number;
  readonly audioTracks: number;
  /** Apple still-image-time (ms), or null. */
  readonly stillTimeMs: number | null;
}

/** Counts `trak` handlers (`vide`, `soun`) within the movie box. */
export function readTrackLayout(moovBytes: Uint8Array): {
  videoTracks: number;
  audioTracks: number;
} {
  const moov = parseBoxHeader(moovBytes, 0, moovBytes.byteLength);
  let videoTracks = 0;
  let audioTracks = 0;
  for (const trak of listBoxes(moovBytes, moov.contentStart, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = listBoxes(moovBytes, trak.contentStart, trak.end).find(
      (box) => box.type === "mdia",
    );
    if (!mdia) continue;
    const hdlr = listBoxes(moovBytes, mdia.contentStart, mdia.end).find(
      (box) => box.type === "hdlr",
    );
    if (!hdlr || hdlr.contentStart + 12 > hdlr.end) continue;
    const handler = fourCc(moovBytes, hdlr.contentStart + 8);
    if (handler === "vide") videoTracks += 1;
    else if (handler === "soun") audioTracks += 1;
  }
  return { videoTracks, audioTracks };
}

/** Identifier and track layout of a QuickTime/MP4 file or embedded range. */
export async function readMotionFacts(
  reader: ByteReader,
  start = 0,
  end = reader.size,
): Promise<MotionFacts> {
  const moov = await readMovieBox(reader, start, end);
  if (moov === null) throw new MediaParseError("structure_invalid");
  let stillTimeMs: number | null;
  try {
    stillTimeMs = readStillImageTimeMs(moov);
  } catch {
    // An unreadable timed-metadata track only loses the optional still time.
    stillTimeMs = null;
  }
  return {
    contentIdentifier: readQuickTimeContentIdentifier(moov),
    ...readTrackLayout(moov),
    stillTimeMs,
  };
}
