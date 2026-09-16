/**
 * Synthetic regression fixtures for parser and grouping tests: minimal byte
 * layouts of JPEG/HEIC stills with Apple MakerNotes, QuickTime motion files
 * with content identifiers, Motion Photo containers and animated or refused
 * formats. They are structural fixtures only, not decodable media, and are
 * never evidence for real device files.
 */

const encoder = new TextEncoder();

export const bytes = (
  ...parts: (Uint8Array | number[] | string)[]
): Uint8Array => {
  const chunks = parts.map((part) =>
    typeof part === "string"
      ? encoder.encode(part)
      : part instanceof Uint8Array
        ? part
        : Uint8Array.from(part),
  );
  const out = new Uint8Array(
    chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
};

export const u16 = (value: number) => [(value >>> 8) & 255, value & 255];
export const u32 = (value: number) => [
  (value >>> 24) & 255,
  (value >>> 16) & 255,
  (value >>> 8) & 255,
  value & 255,
];
const u32le = (value: number) => [
  value & 255,
  (value >>> 8) & 255,
  (value >>> 16) & 255,
  (value >>> 24) & 255,
];

export const box = (
  type: string,
  ...payload: (Uint8Array | number[] | string)[]
) => {
  const body = bytes(...payload);
  return bytes(u32(8 + body.byteLength), type, body);
};

export const fullBox = (
  type: string,
  version: number,
  ...payload: (Uint8Array | number[] | string)[]
) => box(type, [version, 0, 0, 0], ...payload);

export const IDENTIFIER = "1F0C1B7E-3E2A-4C4B-9D1E-6A7B8C9D0E1F";
export const OTHER_IDENTIFIER = "AAAAAAAA-BBBB-4CCC-8DDD-EEEEEEEEEEEE";

/** Apple MakerNote with ContentIdentifier (tag 0x0011), big-endian. */
export const appleMakerNote = (identifier: string) => {
  const value = bytes(identifier, [0]);
  const header = bytes("Apple iOS\0", [0, 1], "MM");
  // IFD at 14: 1 entry (12 bytes) + next IFD (4 bytes) → value at 14 + 2 + 12 + 4 = 32.
  const ifd = bytes(
    u16(1),
    u16(0x0011),
    u16(2),
    u32(value.byteLength),
    u32(32),
    u32(0),
  );
  return bytes(header, ifd, value);
};

/** Big-endian TIFF with Orientation and an Exif IFD holding the MakerNote. */
export const exifTiff = (options: {
  orientation?: number;
  makerNote?: Uint8Array | null;
}) => {
  const makerNote = options.makerNote ?? null;
  const ifd0Entries = [
    ...(options.orientation === undefined
      ? []
      : [bytes(u16(0x0112), u16(3), u32(1), u16(options.orientation), [0, 0])]),
    ...(makerNote === null ? [] : [bytes(u16(0x8769), u16(4), u32(1), u32(0))]),
  ];
  const ifd0Size = 2 + ifd0Entries.length * 12 + 4;
  const exifOffset = 8 + ifd0Size;
  const exifIfdSize = 2 + 12 + 4;
  const makerOffset = exifOffset + exifIfdSize;
  const patched = ifd0Entries.map((entry) => {
    if ((entry[0]! << 8) + entry[1]! !== 0x8769) return entry;
    return bytes(u16(0x8769), u16(4), u32(1), u32(exifOffset));
  });
  return bytes(
    "MM",
    [0, 42],
    u32(8),
    u16(patched.length),
    ...patched,
    u32(0),
    ...(makerNote === null
      ? []
      : [
          bytes(
            u16(1),
            u16(0x927c),
            u16(7),
            u32(makerNote.byteLength),
            u32(makerOffset),
            u32(0),
          ),
          makerNote,
        ]),
  );
};

const segment = (marker: number, payload: Uint8Array) =>
  bytes([0xff, marker], u16(payload.byteLength + 2), payload);

/** A JPEG layout: SOI, optional APP1 Exif/XMP, SOF0, SOS, scan bytes, EOI. */
export const jpeg = (options: {
  identifier?: string | null;
  orientation?: number;
  xmp?: string | null;
  width?: number;
  height?: number;
}) => {
  const identifier = options.identifier ?? null;
  const tiff = exifTiff({
    ...(options.orientation === undefined
      ? {}
      : { orientation: options.orientation }),
    makerNote: identifier === null ? null : appleMakerNote(identifier),
  });
  return bytes(
    [0xff, 0xd8],
    identifier !== null || options.orientation !== undefined
      ? segment(0xe1, bytes("Exif\0\0", tiff))
      : [],
    options.xmp
      ? segment(0xe1, bytes("http://ns.adobe.com/xap/1.0/\0", options.xmp))
      : [],
    segment(
      0xc0,
      bytes(
        [8],
        u16(options.height ?? 3),
        u16(options.width ?? 4),
        [3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0],
      ),
    ),
    segment(0xda, bytes([3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0])),
    [0x12, 0x34, 0x56],
    [0xff, 0xd9],
  );
};

/** A HEIC layout whose Exif item (in `mdat`) carries the MakerNote. */
export const heic = (options: {
  identifier?: string | null;
  orientation?: number;
}) => {
  const tiff = exifTiff({
    ...(options.orientation === undefined
      ? {}
      : { orientation: options.orientation }),
    makerNote: options.identifier ? appleMakerNote(options.identifier) : null,
  });
  const exifPayload = bytes(u32(0), tiff);
  const ftyp = box("ftyp", "heic", u32(0), "mif1", "heic");
  const build = (exifOffset: number) =>
    fullBox(
      "meta",
      0,
      fullBox("hdlr", 0, u32(0), "pict", u32(0), u32(0), u32(0), [0]),
      fullBox("pitm", 0, u16(1)),
      fullBox(
        "iinf",
        0,
        u16(2),
        fullBox("infe", 2, u16(1), u16(0), "hvc1", [0]),
        fullBox("infe", 2, u16(2), u16(0), "Exif", [0]),
      ),
      fullBox("iref", 0, box("cdsc", u16(2), u16(1), u16(1))),
      fullBox(
        "iloc",
        0,
        [0x44, 0x00],
        u16(1),
        u16(2),
        u16(0),
        u16(1),
        u32(exifOffset),
        u32(exifPayload.byteLength),
      ),
    );
  const metaLength = build(0).byteLength;
  const exifOffset = ftyp.byteLength + metaLength + 8;
  return bytes(ftyp, build(exifOffset), box("mdat", exifPayload));
};

const handler = (type: string) =>
  box(
    "trak",
    box("mdia", fullBox("hdlr", 0, u32(0), type, u32(0), u32(0), u32(0), [0])),
  );

const CONTENT_ID_KEY = "com.apple.quicktime.content.identifier";

const keyedMeta = (identifier: string) =>
  box(
    "meta",
    fullBox("hdlr", 0, u32(0), "mdta", u32(0), u32(0), u32(0), [0]),
    fullBox(
      "keys",
      0,
      u32(1),
      u32(8 + CONTENT_ID_KEY.length),
      "mdta",
      CONTENT_ID_KEY,
    ),
    box(
      "ilst",
      bytes(
        u32(8 + 8 + 8 + identifier.length),
        u32(1),
        box("data", u32(1), u32(0), identifier),
      ),
    ),
  );

const STILL_IMAGE_TIME_KEY = "com.apple.quicktime.still-image-time";

/** Apple still-image-time timed-metadata track layouts (movie timescale 600). */
export interface StillImageTimeTrack {
  /** Movie duration in ms (mvhd). */
  readonly movieMs: number;
  /** An empty edit of this many ms before the value sample. */
  readonly emptyEditMs?: number;
  /** A leading empty sample of this many ms before the value sample. */
  readonly emptySampleMs?: number;
  /** Extra keys declared next to still-image-time (makes the track ambiguous). */
  readonly extraKeys?: readonly string[];
}

const mediaHeader = (
  type: "mvhd" | "mdhd",
  timescale: number,
  duration: number,
) =>
  fullBox(
    type,
    0,
    u32(0),
    u32(0),
    u32(timescale),
    u32(duration),
    new Uint8Array(type === "mvhd" ? 80 : 4),
  );

const stillImageTimeTrak = (track: StillImageTimeTrack) => {
  const keys = [STILL_IMAGE_TIME_KEY, ...(track.extraKeys ?? [])];
  const emptySample = track.emptySampleMs !== undefined;
  const ms = (value: number) => Math.round((value * 600) / 1000);
  return box(
    "trak",
    ...(track.emptyEditMs !== undefined
      ? [
          box(
            "edts",
            fullBox(
              "elst",
              0,
              u32(2),
              u32(ms(track.emptyEditMs)),
              u32(0xffff_ffff),
              u32(0x0001_0000),
              u32(ms(track.movieMs - track.emptyEditMs)),
              u32(0),
              u32(0x0001_0000),
            ),
          ),
        ]
      : []),
    box(
      "mdia",
      mediaHeader("mdhd", 600, ms(track.movieMs)),
      fullBox("hdlr", 0, u32(0), "meta", u32(0), u32(0), u32(0), [0]),
      box(
        "minf",
        box(
          "stbl",
          fullBox(
            "stsd",
            0,
            u32(1),
            box(
              "mebx",
              [0, 0, 0, 0, 0, 0],
              u16(1),
              box(
                "keys",
                ...keys.map((key, index) =>
                  box(
                    String.fromCharCode(0, 0, 0, index + 1),
                    box("keyd", "mdta", key),
                  ),
                ),
              ),
            ),
          ),
          emptySample
            ? fullBox(
                "stts",
                0,
                u32(2),
                u32(1),
                u32(ms(track.emptySampleMs!)),
                u32(1),
                u32(1),
              )
            : fullBox("stts", 0, u32(1), u32(1), u32(1)),
          emptySample
            ? fullBox("stsz", 0, u32(0), u32(2), u32(0), u32(9))
            : fullBox("stsz", 0, u32(9), u32(1)),
        ),
      ),
    ),
  );
};

/** A QuickTime (or MP4) motion layout with optional identifier metadata. */
export const motion = (options: {
  identifier?: string | null;
  layout?: "moov/meta" | "moov/udta/meta";
  brand?: "qt  " | "isom";
  audio?: boolean;
  stillImageTime?: StillImageTimeTrack;
}) => {
  const identifier = options.identifier ?? null;
  const meta = identifier === null ? null : keyedMeta(identifier);
  const still = options.stillImageTime;
  return bytes(
    box("ftyp", options.brand ?? "qt  ", u32(0), options.brand ?? "qt  "),
    box("mdat", [1, 2, 3, 4]),
    box(
      "moov",
      ...(still
        ? [mediaHeader("mvhd", 600, Math.round((still.movieMs * 600) / 1000))]
        : []),
      handler("vide"),
      ...(options.audio ? [handler("soun")] : []),
      ...(still ? [stillImageTimeTrak(still)] : []),
      ...(meta === null
        ? []
        : options.layout === "moov/udta/meta"
          ? [box("udta", meta)]
          : [meta]),
    ),
  );
};

/** A JPEG Motion Photo with an embedded MP4 (Container:Directory). */
export const motionPhotoJpeg = (
  options: { valid?: boolean; presentationUs?: number } = {},
) => {
  const video = motion({ brand: "isom" });
  const directory = (videoLength: number) =>
    `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:GCamera="http://ns.google.com/photos/1.0/camera/" xmlns:Container="http://ns.google.com/photos/1.0/container/" xmlns:Item="http://ns.google.com/photos/1.0/container/item/" GCamera:MotionPhoto="1" GCamera:MotionPhotoPresentationTimestampUs="${options.presentationUs ?? 1500000}"><Container:Directory><rdf:Seq><rdf:li rdf:parseType="Resource"><Container:Item Item:Mime="image/jpeg" Item:Semantic="Primary" Item:Length="0" Item:Padding="0"/></rdf:li><rdf:li rdf:parseType="Resource"><Container:Item Item:Mime="video/mp4" Item:Semantic="MotionPhoto" Item:Length="${videoLength}" Item:Padding="0"/></rdf:li></rdf:Seq></Container:Directory></rdf:Description></rdf:RDF></x:xmpmeta>`;
  const declared =
    options.valid === false ? video.byteLength + 7 : video.byteLength;
  return bytes(jpeg({ xmp: directory(declared) }), video);
};

export const animatedGif = () =>
  bytes(
    "GIF89a",
    u16(1).reverse(),
    u16(1).reverse(),
    [0, 0, 0],
    ...[0, 1].map(() =>
      bytes([0x2c], [0, 0, 0, 0, 1, 0, 1, 0, 0], [2, 2, 0x44, 0x01, 0]),
    ),
    [0x3b],
  );

const pngChunk = (type: string, data: number[] = []) =>
  bytes(u32(data.length), type, data, u32(0));

export const png = (
  options: {
    animated?: boolean;
    colorType?: number;
    transparent?: boolean;
  } = {},
) =>
  bytes(
    [0x89],
    "PNG\r\n\x1a\n",
    pngChunk("IHDR", [
      ...u32(4),
      ...u32(3),
      8,
      options.colorType ?? 2,
      0,
      0,
      0,
    ]),
    ...(options.animated ? [pngChunk("acTL", [...u32(2), ...u32(0)])] : []),
    ...(options.transparent ? [pngChunk("tRNS", [0, 0])] : []),
    pngChunk("IDAT", [1, 2, 3]),
    pngChunk("IEND"),
  );

export const animatedWebp = () => {
  const vp8x = bytes("VP8X", u32le(10), [0x02, 0, 0, 0], [3, 0, 0], [2, 0, 0]);
  const body = bytes("WEBP", vp8x, "ANIM", u32le(6), [0, 0, 0, 0, 0, 0]);
  return bytes("RIFF", u32le(body.byteLength), body);
};

export const tiff = () => bytes("II*\0", u32le(8), [0, 0, 0, 0]);

export const avif = () =>
  bytes(box("ftyp", "avif", u32(0), "mif1", "avif"), box("mdat", [0]));

export const fileOf = (data: Uint8Array, name = "selected", type = "") =>
  new File([data as BlobPart], name, { type });
