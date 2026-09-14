import {
  ISOBMFF_LIMITS,
  MediaParseError,
  PNG_MAX_CHUNKS_BEFORE_IMAGE_DATA,
  bufferByteReader,
  contentIdentifierSha256,
  countGifFrames,
  declaredTypeMatches,
  listBoxes,
  listJpegSegments,
  locateMotionPhotoVideo,
  matrixRotation,
  parseHeifMeta,
  pngHasAnimationControl,
  readExifSummary,
  readHeifContentIdentifier,
  readHeifXmpPackets,
  readJpegContentIdentifier,
  readJpegXmpPackets,
  readMotionPhotoDirectory,
  readQuickTimeContentIdentifier,
  readTopLevelBoxes,
  readVideoTrackRotation,
  sniffSignature,
} from "@moya/backend-production/internal/publishing-processing";
import { describe, expect, it } from "vitest";

// Every byte sequence below is constructed in-test; no fixture files.
const encoder = new TextEncoder();
const u8 = (...values: number[]) => Uint8Array.from(values);
const concat = (...parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};
const u16 = (v: number) => u8((v >>> 8) & 255, v & 255);
const u32 = (v: number) =>
  u8((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
const ascii = (text: string) =>
  Uint8Array.from([...text].map((c) => c.charCodeAt(0)));
const zeros = (length: number) => new Uint8Array(length);
const box = (type: string, ...payload: Uint8Array[]) => {
  const body = concat(...payload);
  return concat(u32(8 + body.length), ascii(type), body);
};
const fullBox = (type: string, version: number, ...payload: Uint8Array[]) =>
  box(type, u8(version, 0, 0, 0), ...payload);

const parseCode = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(MediaParseError);
    return (error as MediaParseError).code;
  }
  throw new Error("expected a parse failure");
};
const parseCodeAsync = async (run: () => Promise<unknown>) => {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(MediaParseError);
    return (error as MediaParseError).code;
  }
  throw new Error("expected a parse failure");
};

const IDENTIFIER = "7A1C2B3D-4E5F-4061-8273-94A5B6C7D8E9";

/** Apple MakerNote: "Apple iOS\0", version, byte order, IFD at +14. */
const appleMakerNote = (
  identifier: string,
  order: "MM" | "II" = "MM",
  tag = 0x0011,
) => {
  const le = order === "II";
  const w16 = (v: number) => (le ? u8(v & 255, (v >>> 8) & 255) : u16(v));
  const w32 = (v: number) =>
    le
      ? u8(v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255)
      : u32(v);
  const value = concat(ascii(identifier), u8(0));
  return concat(
    ascii("Apple iOS\0"),
    u16(1),
    ascii(order),
    w16(1),
    w16(tag),
    w16(2),
    w32(value.length),
    w32(32),
    w32(0),
    value,
  );
};

/** Big-endian TIFF: IFD0 (Orientation, ExifIFD) → Exif IFD (MakerNote). */
const exifTiff = (
  makerNote: Uint8Array | null,
  options: {
    orientation?: number;
    exifPointer?: number;
    makerNoteOffset?: number;
  } = {},
) => {
  const ifd0Entries: Uint8Array[] = [];
  if (options.orientation !== undefined) {
    ifd0Entries.push(
      concat(u16(0x0112), u16(3), u32(1), u16(options.orientation), u16(0)),
    );
  }
  const ifd0Size = 2 + 12 * (ifd0Entries.length + 1) + 4;
  const exifOffset = 8 + ifd0Size;
  ifd0Entries.push(
    concat(u16(0x8769), u16(4), u32(1), u32(options.exifPointer ?? exifOffset)),
  );
  const ifd0 = concat(u16(ifd0Entries.length), ...ifd0Entries, u32(0));
  const exif = makerNote
    ? concat(
        u16(1),
        u16(0x927c),
        u16(7),
        u32(makerNote.length),
        u32(options.makerNoteOffset ?? exifOffset + 18),
        u32(0),
      )
    : concat(u16(0), u32(0));
  return concat(
    ascii("MM"),
    u16(42),
    u32(8),
    ifd0,
    exif,
    makerNote ?? zeros(0),
  );
};

const segment = (marker: number, payload: Uint8Array) =>
  concat(u8(0xff, marker), u16(payload.length + 2), payload);
const jpeg = (...segments: Uint8Array[]) =>
  concat(
    u8(0xff, 0xd8),
    ...segments,
    u8(0xff, 0xda),
    u16(8),
    u8(1, 1, 0, 0, 0x3f, 0),
    u8(0x12, 0x34),
    u8(0xff, 0xd9),
  );
const exifSegment = (tiff: Uint8Array) =>
  segment(0xe1, concat(ascii("Exif\0\0"), tiff));

describe("publishing media signature sniffing", () => {
  const ftyp = (major: string, ...compatible: string[]) =>
    box("ftyp", ascii(major), u32(0), ...compatible.map(ascii));
  const webp = (flags: number | null) =>
    concat(
      ascii("RIFF"),
      u32(0),
      ascii("WEBP"),
      flags === null
        ? concat(ascii("VP8 "), zeros(10))
        : concat(ascii("VP8X"), u32(10), u8(flags), zeros(9)),
    );

  it.each([
    ["jpeg", u8(0xff, 0xd8, 0xff, 0xe0), "image/jpeg", false],
    ["png", concat(u8(0x89), ascii("PNG\r\n\x1a\n")), "image/png", false],
    ["static webp", webp(null), "image/webp", false],
    ["animated webp", webp(0x02), "image/webp", true],
    ["gif", ascii("GIF89a\0\0\0\0"), "image/gif", false],
    ["iPhone heic", ftyp("heic", "mif1", "heic"), "image/heic", false],
    ["generic heif", ftyp("mif1", "mif1"), "image/heif", false],
    ["heif sequence", ftyp("msf1", "msf1", "hevc"), "image/heif", true],
    [
      "heif sequence listing still brands",
      ftyp("msf1", "mif1", "heic", "msf1"),
      "image/heic",
      true,
    ],
    [
      "heic with a sequence brand",
      ftyp("heic", "mif1", "heic", "hevc"),
      "image/heic",
      true,
    ],
    ["avif", ftyp("avif", "mif1", "avif"), "image/avif", false],
    ["avif sequence", ftyp("avis", "avis", "msf1"), "image/avif", true],
    ["quicktime", ftyp("qt  ", "qt  "), "video/quicktime", false],
    ["mp4", ftyp("isom", "isom", "avc1"), "video/mp4", false],
    ["tiff little-endian", ascii("II*\0\x08\0\0\0"), "image/tiff", false],
    [
      "tiff big-endian (DNG/NEF/CR2)",
      ascii("MM\0*\0\0\0\x08"),
      "image/tiff",
      false,
    ],
    ["canon cr3", ftyp("crx ", "crx "), "image/x-raw", false],
    ["olympus orf", ascii("IIRO\x08\0\0\0"), "image/x-raw", false],
    ["random", u8(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12), "unknown", false],
    ["truncated jpeg", u8(0xff, 0xd8), "unknown", false],
  ])("detects %s", (_name, bytes, type, animated) => {
    expect(sniffSignature(bytes)).toEqual({ type, animated });
  });

  it("never trusts declared types across families", () => {
    expect(declaredTypeMatches("image/heif", "image/heic")).toBe(true);
    expect(declaredTypeMatches("video/mp4", "video/quicktime")).toBe(true);
    expect(declaredTypeMatches("image/jpeg", "image/png")).toBe(false);
    expect(declaredTypeMatches("image/heic", "image/avif")).toBe(false);
    expect(declaredTypeMatches("image/jpeg", "image/tiff")).toBe(false);
  });

  const gif = (frames: number) => {
    const header = concat(ascii("GIF89a"), u16(1), u16(1), u8(0, 0, 0));
    const frame = concat(
      u8(0x21, 0xf9, 4, 0, 0, 0, 0, 0),
      u8(0x2c),
      zeros(8),
      u8(0),
      u8(2, 2, 0x4c, 0x01, 0),
    );
    return concat(
      header,
      ...Array.from({ length: frames }, () => frame),
      u8(0x3b),
    );
  };

  it("detects APNG animation control before the first image data", async () => {
    const chunk = (type: string, data = zeros(0)) =>
      concat(u32(data.length), ascii(type), data, zeros(4));
    const png = (...chunks: Uint8Array[]) =>
      concat(
        u8(0x89),
        ascii("PNG\r\n\x1a\n"),
        chunk("IHDR", zeros(13)),
        ...chunks,
      );
    const animated = (bytes: Uint8Array) =>
      pngHasAnimationControl(bufferByteReader(bytes));
    expect(await animated(png(chunk("IDAT", zeros(4)), chunk("IEND")))).toBe(
      false,
    );
    expect(
      await animated(
        png(
          chunk("tEXt", zeros(20)),
          chunk("acTL", zeros(8)),
          chunk("IDAT", zeros(4)),
        ),
      ),
    ).toBe(true);
    // Decoders ignore an acTL after image data; it is not an animation.
    expect(
      await animated(png(chunk("IDAT", zeros(4)), chunk("acTL", zeros(8)))),
    ).toBe(false);
    expect(
      await parseCodeAsync(() =>
        animated(png(chunk("tEXt", zeros(20))).subarray(0, 40)),
      ),
    ).toBe("truncated");
    expect(
      await parseCodeAsync(() =>
        animated(
          concat(u8(0x89), ascii("PNG\r\n\x1a\n"), chunk("IDAT", zeros(4))),
        ),
      ),
    ).toBe("structure_invalid");
    expect(
      await parseCodeAsync(() => animated(png(chunk("IEND"), chunk("IDAT")))),
    ).toBe("structure_invalid");
    expect(
      await parseCodeAsync(() => animated(png(chunk("a1b2"), chunk("IDAT")))),
    ).toBe("structure_invalid");
    expect(
      await parseCodeAsync(() =>
        animated(
          png(
            ...Array.from({ length: PNG_MAX_CHUNKS_BEFORE_IMAGE_DATA }, () =>
              chunk("tEXt"),
            ),
            chunk("IDAT"),
          ),
        ),
      ),
    ).toBe("limit_exceeded");
  });

  it("counts GIF frames with bounded block walking", () => {
    expect(countGifFrames(gif(1))).toBe(1);
    expect(countGifFrames(gif(3))).toBe(2);
    expect(parseCode(() => countGifFrames(gif(1).subarray(0, 20)))).toBe(
      "truncated",
    );
    expect(
      parseCode(() => countGifFrames(concat(gif(1).subarray(0, 13), u8(0x99)))),
    ).toBe("structure_invalid");
  });
});

describe("publishing ISO BMFF box walker", () => {
  it("lists sibling boxes that tile the region exactly", () => {
    const bytes = concat(box("free", u8(1, 2)), box("skip"));
    expect(
      listBoxes(bytes, 0, bytes.length).map((b) => [b.type, b.size]),
    ).toEqual([
      ["free", 10],
      ["skip", 8],
    ]);
  });

  it.each([
    ["a truncated header", u8(0, 0, 0, 16, 0x66), "truncated"],
    [
      "a size smaller than its header",
      concat(u32(4), ascii("free")),
      "box_invalid",
    ],
    [
      "a size beyond the parent",
      concat(u32(64), ascii("free"), zeros(8)),
      "box_invalid",
    ],
    [
      "size 0 inside a container",
      concat(u32(0), ascii("free"), zeros(8)),
      "box_invalid",
    ],
    [
      "an unsafe 64-bit largesize",
      concat(u32(1), ascii("mdat"), u32(0xffffffff), u32(0), zeros(8)),
      "offset_invalid",
    ],
    [
      "a largesize beyond the parent",
      concat(u32(1), ascii("mdat"), u32(0), u32(4096), zeros(8)),
      "box_invalid",
    ],
  ])("rejects %s", (_name, bytes, code) => {
    expect(parseCode(() => listBoxes(bytes, 0, bytes.length))).toBe(code);
  });

  it("bounds the number of boxes per level", () => {
    const many = concat(
      ...Array.from({ length: ISOBMFF_LIMITS.maxBoxesPerLevel + 1 }, () =>
        box("free"),
      ),
    );
    expect(parseCode(() => listBoxes(many, 0, many.length))).toBe(
      "limit_exceeded",
    );
  });

  it("walks top-level boxes by header reads and only lets trailing payload boxes run to EOF", async () => {
    const tail = concat(u32(0), ascii("mdat"), zeros(32));
    const ok = concat(box("ftyp", ascii("isom"), u32(0)), tail);
    expect(
      (await readTopLevelBoxes(bufferByteReader(ok))).map((b) => [
        b.type,
        b.size,
      ]),
    ).toEqual([
      ["ftyp", 16],
      ["mdat", 40],
    ]);
    const bad = concat(
      box("ftyp", ascii("isom"), u32(0)),
      u32(0),
      ascii("moov"),
      zeros(8),
    );
    expect(
      await parseCodeAsync(() => readTopLevelBoxes(bufferByteReader(bad))),
    ).toBe("box_invalid");
    const truncated = concat(
      box("ftyp", ascii("isom"), u32(0)),
      u32(4096),
      ascii("moov"),
    );
    expect(
      await parseCodeAsync(() =>
        readTopLevelBoxes(bufferByteReader(truncated)),
      ),
    ).toBe("box_invalid");
  });
});

describe("publishing TIFF/Exif and Apple MakerNote reader", () => {
  it("reads orientation and the Apple ContentIdentifier in either maker note byte order", () => {
    const tiff = exifTiff(appleMakerNote(IDENTIFIER.toLowerCase()), {
      orientation: 6,
    });
    const summary = readExifSummary(tiff);
    expect(summary.orientation).toBe(6);
    expect(summary.makerNote).not.toBeNull();
    expect(readJpegContentIdentifier(jpeg(exifSegment(tiff)))).toBe(IDENTIFIER);
    expect(
      readJpegContentIdentifier(
        jpeg(exifSegment(exifTiff(appleMakerNote(IDENTIFIER, "II")))),
      ),
    ).toBe(IDENTIFIER);
  });

  it.each([
    ["no maker note", exifTiff(null)],
    [
      "a different maker note tag",
      exifTiff(appleMakerNote(IDENTIFIER, "MM", 0x0017)),
    ],
    [
      "an identifier that is not a UUID",
      exifTiff(appleMakerNote("IMG_1234-not-a-uuid")),
    ],
    [
      "a non-Apple maker note",
      exifTiff(concat(ascii("Nikon\0\x02\x10\0\0"), zeros(24))),
    ],
  ])("returns no identifier for %s", (_name, tiff) => {
    expect(readJpegContentIdentifier(jpeg(exifSegment(tiff)))).toBeNull();
  });

  it("rejects IFD pointer loops, oversized counts and out-of-range values", () => {
    expect(
      parseCode(() => readExifSummary(exifTiff(null, { exifPointer: 8 }))),
    ).toBe("offset_invalid");
    expect(
      parseCode(() =>
        readExifSummary(exifTiff(null, { exifPointer: 0x7fffffff })),
      ),
    ).toBe("offset_invalid");
    const note = appleMakerNote(IDENTIFIER);
    expect(
      parseCode(() =>
        readExifSummary(exifTiff(note, { makerNoteOffset: 0xfffff })),
      ),
    ).toBe("offset_invalid");
    const huge = concat(ascii("MM"), u16(42), u32(8), u16(4096), zeros(32));
    expect(parseCode(() => readExifSummary(huge))).toBe("limit_exceeded");
    const short = concat(ascii("MM"), u16(42), u32(8), u16(3), zeros(12));
    expect(parseCode(() => readExifSummary(short))).toBe("truncated");
    expect(parseCode(() => readExifSummary(ascii("XX\0*\0\0\0\x08")))).toBe(
      "structure_invalid",
    );
  });

  it("walks JPEG segments with bounds and rejects truncated segment lengths", () => {
    const valid = jpeg(
      segment(0xe0, ascii("JFIF\0")),
      exifSegment(exifTiff(null)),
    );
    expect(listJpegSegments(valid).map((s) => s.marker)).toEqual([0xe0, 0xe1]);
    const truncated = concat(
      u8(0xff, 0xd8, 0xff, 0xe1),
      u16(4096),
      ascii("Exif\0\0"),
    );
    expect(parseCode(() => readJpegContentIdentifier(truncated))).toBe(
      "truncated",
    );
    expect(parseCode(() => listJpegSegments(u8(0xff, 0xd8, 0x00, 0x00)))).toBe(
      "structure_invalid",
    );
  });
});

/** HEIF with a coded item (1), an Exif item (2, cdsc → 1) and optional XMP item (3). */
const heifFile = (
  exifPayload: Uint8Array,
  options: {
    method?: 0 | 1;
    exifLength?: number;
    exifOffsetDelta?: number;
    xmp?: string;
    trailing?: Uint8Array;
  } = {},
) => {
  const method = options.method ?? 0;
  const xmpBytes =
    options.xmp === undefined ? null : encoder.encode(options.xmp);
  const ftyp = box("ftyp", ascii("heic"), u32(0), ascii("mif1"), ascii("heic"));
  const coded = u8(0, 0, 0, 1, 0x26, 1);
  const build = (
    exifOffset: number,
    xmpOffset: number,
    codedOffset: number,
  ) => {
    const infes = [
      fullBox("infe", 2, u16(1), u16(0), ascii("hvc1"), u8(0)),
      fullBox("infe", 2, u16(2), u16(0), ascii("Exif"), u8(0)),
    ];
    if (xmpBytes) {
      infes.push(
        fullBox(
          "infe",
          2,
          u16(3),
          u16(0),
          ascii("mime"),
          u8(0),
          ascii("application/rdf+xml"),
          u8(0),
        ),
      );
    }
    const location = (
      id: number,
      construction: number,
      offset: number,
      length: number,
    ) =>
      concat(
        u16(id),
        u16(construction),
        u16(0),
        u16(1),
        u32(offset),
        u32(length),
      );
    const locations = [
      location(1, 0, codedOffset, coded.length),
      location(2, method, exifOffset, options.exifLength ?? exifPayload.length),
    ];
    if (xmpBytes) locations.push(location(3, 0, xmpOffset, xmpBytes.length));
    return fullBox(
      "meta",
      0,
      fullBox("hdlr", 0, u32(0), ascii("pict"), zeros(12), u8(0)),
      fullBox("pitm", 0, u16(1)),
      fullBox("iinf", 0, u16(infes.length), ...infes),
      fullBox("iref", 0, box("cdsc", u16(2), u16(1), u16(1))),
      fullBox("iloc", 1, u16(0x4400), u16(locations.length), ...locations),
      ...(method === 1 ? [box("idat", exifPayload)] : []),
    );
  };
  const metaLength = build(0, 0, 0).length;
  const mdatStart = ftyp.length + metaLength + 8;
  const exifInMdat = method === 0 ? exifPayload : zeros(0);
  const meta = build(
    method === 0
      ? mdatStart + (options.exifOffsetDelta ?? 0)
      : (options.exifOffsetDelta ?? 0),
    mdatStart + exifInMdat.length + coded.length,
    mdatStart + exifInMdat.length,
  );
  return concat(
    ftyp,
    meta,
    box("mdat", exifInMdat, coded, xmpBytes ?? zeros(0)),
    options.trailing ?? zeros(0),
  );
};

const exifItem = (tiff: Uint8Array) => concat(u32(6), ascii("Exif\0\0"), tiff);

describe("publishing HEIF meta/iinf/iloc Exif extraction", () => {
  const tiff = exifTiff(appleMakerNote(IDENTIFIER), { orientation: 6 });

  it("extracts the Apple ContentIdentifier from the primary image's Exif item", async () => {
    const file = heifFile(exifItem(tiff));
    expect(await readHeifContentIdentifier(bufferByteReader(file))).toBe(
      IDENTIFIER,
    );
    const meta = parseHeifMeta(
      file.subarray(
        24,
        24 +
          ((file[24]! << 24) |
            (file[25]! << 16) |
            (file[26]! << 8) |
            file[27]!),
      ),
    );
    expect(meta.primaryItemId).toBe(1);
    expect(meta.items.map((item) => item.type)).toEqual(["hvc1", "Exif"]);
    expect(meta.references).toEqual([{ type: "cdsc", from: 2, to: [1] }]);
  });

  it("supports idat construction", async () => {
    const file = heifFile(exifItem(tiff), { method: 1 });
    expect(await readHeifContentIdentifier(bufferByteReader(file))).toBe(
      IDENTIFIER,
    );
  });

  it("returns no identifier when the Exif item carries a wrong identifier", async () => {
    const file = heifFile(exifItem(exifTiff(appleMakerNote("00000000-ZZZZ"))));
    expect(await readHeifContentIdentifier(bufferByteReader(file))).toBeNull();
  });

  it("rejects extents outside the file, oversized items and bad Exif offsets", async () => {
    expect(
      await parseCodeAsync(() =>
        readHeifContentIdentifier(
          bufferByteReader(
            heifFile(exifItem(tiff), { exifOffsetDelta: 1 << 20 }),
          ),
        ),
      ),
    ).toBe("truncated");
    expect(
      await parseCodeAsync(() =>
        readHeifContentIdentifier(
          bufferByteReader(
            heifFile(exifItem(tiff), {
              exifLength: ISOBMFF_LIMITS.maxItemBytes + 1,
            }),
          ),
        ),
      ),
    ).toBe("limit_exceeded");
    expect(
      await parseCodeAsync(() =>
        readHeifContentIdentifier(
          bufferByteReader(
            heifFile(concat(u32(0xffff), ascii("Exif\0\0"), tiff)),
          ),
        ),
      ),
    ).toBe("offset_invalid");
    expect(
      await parseCodeAsync(() =>
        readHeifContentIdentifier(
          bufferByteReader(
            heifFile(exifItem(tiff), { method: 1, exifOffsetDelta: 4096 }),
          ),
        ),
      ),
    ).toBe("offset_invalid");
  });

  it("rejects an iloc with invalid field sizes and a missing meta box", async () => {
    const meta = fullBox("meta", 0, fullBox("iloc", 1, u16(0x3300), u16(0)));
    expect(parseCode(() => parseHeifMeta(meta))).toBe("structure_invalid");
    expect(
      await parseCodeAsync(() =>
        readHeifContentIdentifier(
          bufferByteReader(box("ftyp", ascii("heic"), u32(0))),
        ),
      ),
    ).toBe("structure_invalid");
  });
});

const matrix = (a: number, b: number, c: number, d: number) =>
  concat(
    u32(a),
    u32(b),
    u32(0),
    u32(c),
    u32(d),
    u32(0),
    u32(0),
    u32(0),
    u32(0x40000000),
  );
const ONE = 0x10000;
const mvhd = (m = matrix(ONE, 0, 0, ONE)) =>
  fullBox(
    "mvhd",
    0,
    u32(0),
    u32(0),
    u32(600),
    u32(1800),
    u32(ONE),
    u16(0x100),
    zeros(10),
    m,
    zeros(24),
    u32(2),
  );
const tkhd = (m: Uint8Array, version: 0 | 1 = 0) =>
  version === 0
    ? fullBox(
        "tkhd",
        0,
        u32(0),
        u32(0),
        u32(1),
        u32(0),
        u32(1800),
        zeros(8),
        zeros(8),
        m,
        u32(1920 << 16),
        u32(1440 << 16),
      )
    : fullBox(
        "tkhd",
        1,
        zeros(8),
        zeros(8),
        u32(1),
        u32(0),
        zeros(8),
        zeros(8),
        zeros(8),
        m,
        u32(1920 << 16),
        u32(1440 << 16),
      );
const handler = (type: string) =>
  fullBox("hdlr", 0, u32(0), ascii(type), zeros(12), u8(0));
const trak = (handlerType: string, m: Uint8Array, version: 0 | 1 = 0) =>
  box("trak", tkhd(m, version), box("mdia", handler(handlerType)));
const keyedMeta = (
  entries: readonly { key: string; value: string; type?: number }[],
  style: "quicktime" | "iso" = "quicktime",
) => {
  const keys = fullBox(
    "keys",
    0,
    u32(entries.length),
    ...entries.map((e) =>
      concat(u32(8 + e.key.length), ascii("mdta"), ascii(e.key)),
    ),
  );
  const ilst = box(
    "ilst",
    ...entries.map((e, index) => {
      const data = box(
        "data",
        u32(e.type ?? 1),
        u32(0),
        encoder.encode(e.value),
      );
      return concat(u32(8 + data.length), u32(index + 1), data);
    }),
  );
  const children = [handler("mdta"), keys, ilst];
  return style === "quicktime"
    ? box("meta", ...children)
    : fullBox("meta", 0, ...children);
};
const CONTENT_KEY = "com.apple.quicktime.content.identifier";

describe("publishing QuickTime keys/ilst and track matrix reader", () => {
  it("reads the content identifier from moov/meta and from moov/udta/meta", () => {
    const moov = box(
      "moov",
      mvhd(),
      trak("vide", matrix(0, ONE, -ONE, 0)),
      keyedMeta([
        { key: "com.apple.quicktime.location.accuracy.horizontal", value: "1" },
        { key: CONTENT_KEY, value: IDENTIFIER.toLowerCase() },
      ]),
    );
    expect(readQuickTimeContentIdentifier(moov)).toBe(IDENTIFIER);
    const udta = box(
      "moov",
      mvhd(),
      box("udta", keyedMeta([{ key: CONTENT_KEY, value: IDENTIFIER }], "iso")),
    );
    expect(readQuickTimeContentIdentifier(udta)).toBe(IDENTIFIER);
  });

  it.each([
    [
      "a different key",
      [{ key: "com.apple.quicktime.content.identifiez", value: IDENTIFIER }],
    ],
    [
      "a non-UTF-8 data type",
      [{ key: CONTENT_KEY, value: IDENTIFIER, type: 21 }],
    ],
    ["a value that is not a UUID", [{ key: CONTENT_KEY, value: "IMG_0001" }]],
  ])("returns no identifier for %s", (_name, entries) => {
    expect(
      readQuickTimeContentIdentifier(box("moov", mvhd(), keyedMeta(entries))),
    ).toBeNull();
  });

  it("rejects oversized key tables and key sizes beyond the box", () => {
    const tooMany = box(
      "moov",
      mvhd(),
      box("meta", fullBox("keys", 0, u32(4096)), box("ilst")),
    );
    expect(parseCode(() => readQuickTimeContentIdentifier(tooMany))).toBe(
      "limit_exceeded",
    );
    const broken = box(
      "moov",
      mvhd(),
      box(
        "meta",
        handler("mdta"),
        fullBox("keys", 0, u32(1), u32(4096), ascii("mdta")),
        box("ilst"),
      ),
    );
    expect(parseCode(() => readQuickTimeContentIdentifier(broken))).toBe(
      "box_invalid",
    );
  });

  it("derives clockwise rotation from the video track matrix composed with the movie matrix", () => {
    const moov = (track: Uint8Array, movie = matrix(ONE, 0, 0, ONE)) =>
      box("moov", mvhd(movie), trak("soun", matrix(ONE, 0, 0, ONE)), track);
    expect(
      readVideoTrackRotation(moov(trak("vide", matrix(ONE, 0, 0, ONE)))),
    ).toBe(0);
    expect(
      readVideoTrackRotation(moov(trak("vide", matrix(0, ONE, -ONE, 0)))),
    ).toBe(90);
    expect(
      readVideoTrackRotation(moov(trak("vide", matrix(-ONE, 0, 0, -ONE)))),
    ).toBe(180);
    expect(
      readVideoTrackRotation(moov(trak("vide", matrix(0, -ONE, ONE, 0), 1))),
    ).toBe(270);
    expect(
      readVideoTrackRotation(
        moov(trak("vide", matrix(0, ONE, -ONE, 0)), matrix(-ONE, 0, 0, -ONE)),
      ),
    ).toBe(270);
    expect(
      readVideoTrackRotation(moov(trak("vide", matrix(-ONE, 0, 0, ONE)))),
    ).toBeNull();
    expect(matrixRotation(matrix(2 * ONE, 0, 0, ONE), 0)).toBeNull();
    const truncated = box(
      "moov",
      mvhd(),
      box("trak", fullBox("tkhd", 0, zeros(8)), box("mdia", handler("vide"))),
    );
    expect(parseCode(() => readVideoTrackRotation(truncated))).toBe(
      "truncated",
    );
  });
});

const CONTAINER = "http://ns.google.com/photos/1.0/container/";
const ITEM = "http://ns.google.com/photos/1.0/container/item/";

const directoryXmp = (
  items: readonly {
    mime: string;
    semantic: string;
    length?: number;
    padding?: number;
  }[],
  prefixes = { container: "GContainer", item: "Item" },
  form: "attributes" | "elements" = "attributes",
) => {
  const c = prefixes.container;
  const i = prefixes.item;
  const entries = items
    .map((item) => {
      const fields: [string, string | number | undefined][] = [
        ["Mime", item.mime],
        ["Semantic", item.semantic],
        ["Length", item.length],
        ["Padding", item.padding],
      ];
      const present = fields.filter(([, v]) => v !== undefined);
      return form === "attributes"
        ? `<rdf:li rdf:parseType="Resource"><${c}:Item ${present.map(([k, v]) => `${i}:${k}="${v}"`).join(" ")}/></rdf:li>`
        : `<rdf:li rdf:parseType="Resource"><${c}:Item rdf:parseType="Resource">${present.map(([k, v]) => `<${i}:${k}>${v}</${i}:${k}>`).join("")}</${c}:Item></rdf:li>`;
    })
    .join("");
  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?><x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description rdf:about="" xmlns:GCamera="http://ns.google.com/photos/1.0/camera/" xmlns:${c}="${CONTAINER}" xmlns:${i}="${ITEM}" GCamera:MotionPhoto="1"><${c}:Directory><rdf:Seq>${entries}</rdf:Seq></${c}:Directory></rdf:Description></rdf:RDF></x:xmpmeta><?xpacket end="w"?>`;
};

const embeddedMp4 = () =>
  concat(
    box("ftyp", ascii("isom"), u32(0), ascii("isom")),
    box("moov", mvhd()),
    box("mdat", u8(1, 2, 3, 4)),
  );
const xmpSegment = (xmp: string) =>
  segment(
    0xe1,
    concat(ascii("http://ns.adobe.com/xap/1.0/\0"), encoder.encode(xmp)),
  );

describe("publishing Google Motion Photo container detection", () => {
  it("locates the embedded video of a JPEG motion photo and validates ftyp at the offset", async () => {
    const video = embeddedMp4();
    const primary = jpeg(
      xmpSegment(
        directoryXmp([
          { mime: "image/jpeg", semantic: "Primary", length: 0, padding: 0 },
          {
            mime: "video/mp4",
            semantic: "MotionPhoto",
            length: video.length,
            padding: 0,
          },
        ]),
      ),
    );
    const file = concat(primary, video);
    const packets = readJpegXmpPackets(file);
    const directory = readMotionPhotoDirectory(packets[0]!);
    expect(directory).toEqual([
      { mime: "image/jpeg", semantic: "Primary", length: 0, padding: 0 },
      {
        mime: "video/mp4",
        semantic: "MotionPhoto",
        length: video.length,
        padding: 0,
      },
    ]);
    expect(
      await locateMotionPhotoVideo(
        bufferByteReader(file),
        "image/jpeg",
        directory!,
      ),
    ).toEqual({
      primaryLength: primary.length,
      videoType: "video/mp4",
      videoStart: primary.length,
      videoLength: video.length,
    });
  });

  it("resolves namespaces by URI and accepts element-form items and a gain map", async () => {
    const video = embeddedMp4();
    const gainMap = jpeg();
    const xmp = directoryXmp(
      [
        { mime: "image/jpeg", semantic: "Primary" },
        { mime: "image/jpeg", semantic: "GainMap", length: gainMap.length },
        { mime: "video/mp4", semantic: "MotionPhoto", length: video.length },
      ],
      { container: "Container", item: "Foo" },
      "elements",
    );
    const primary = jpeg(xmpSegment(xmp));
    const file = concat(primary, gainMap, video);
    const directory = readMotionPhotoDirectory(readJpegXmpPackets(file)[0]!)!;
    expect(directory.map((item) => item.semantic)).toEqual([
      "Primary",
      "GainMap",
      "MotionPhoto",
    ]);
    const layout = await locateMotionPhotoVideo(
      bufferByteReader(file),
      "image/jpeg",
      directory,
    );
    expect(layout.videoStart).toBe(primary.length + gainMap.length);
    expect(
      readMotionPhotoDirectory(
        xmp.replaceAll(CONTAINER, "http://example.invalid/"),
      ),
    ).toBeNull();
  });

  it.each([
    [
      "an inconsistent video length",
      (v: number) => [
        { mime: "image/jpeg", semantic: "Primary" },
        { mime: "video/mp4", semantic: "MotionPhoto", length: v + 1 },
      ],
    ],
    [
      "a primary length that disagrees with the sums",
      (v: number) => [
        { mime: "image/jpeg", semantic: "Primary", length: 7 },
        { mime: "video/mp4", semantic: "MotionPhoto", length: v },
      ],
    ],
    [
      "a video length beyond the file",
      () => [
        { mime: "image/jpeg", semantic: "Primary" },
        { mime: "video/mp4", semantic: "MotionPhoto", length: 1 << 30 },
      ],
    ],
    [
      "a video that is not the last item",
      (v: number) => [
        { mime: "image/jpeg", semantic: "Primary" },
        { mime: "video/mp4", semantic: "MotionPhoto", length: v },
        { mime: "image/jpeg", semantic: "GainMap", length: 4 },
      ],
    ],
    [
      "a missing primary",
      (v: number) => [
        { mime: "image/jpeg", semantic: "GainMap" },
        { mime: "video/mp4", semantic: "MotionPhoto", length: v },
      ],
    ],
    [
      "a secondary item without length",
      () => [
        { mime: "image/jpeg", semantic: "Primary" },
        { mime: "video/mp4", semantic: "MotionPhoto" },
      ],
    ],
    [
      "a primary type mismatch",
      (v: number) => [
        { mime: "image/heic", semantic: "Primary", padding: 8 },
        { mime: "video/mp4", semantic: "MotionPhoto", length: v },
      ],
    ],
  ])("rejects %s", async (_name, itemsFor) => {
    const video = embeddedMp4();
    const items = itemsFor(video.length);
    const file = concat(jpeg(xmpSegment(directoryXmp(items))), video);
    const directory = readMotionPhotoDirectory(readJpegXmpPackets(file)[0]!)!;
    expect(
      await parseCodeAsync(() =>
        locateMotionPhotoVideo(bufferByteReader(file), "image/jpeg", directory),
      ),
    ).toBe("structure_invalid");
  });

  it("rejects a directory whose offset does not land on an ftyp box", async () => {
    const notVideo = concat(box("free", zeros(24)), box("moov", mvhd()));
    const file = concat(
      jpeg(
        xmpSegment(
          directoryXmp([
            { mime: "image/jpeg", semantic: "Primary" },
            {
              mime: "video/mp4",
              semantic: "MotionPhoto",
              length: notVideo.length,
            },
          ]),
        ),
      ),
      notVideo,
    );
    const directory = readMotionPhotoDirectory(readJpegXmpPackets(file)[0]!)!;
    expect(
      await parseCodeAsync(() =>
        locateMotionPhotoVideo(bufferByteReader(file), "image/jpeg", directory),
      ),
    ).toBe("structure_invalid");
  });

  it("validates HEIF primaries through the XMP item, padding 8 and the mpvd header", async () => {
    const video = embeddedMp4();
    const items = (padding: number, length = video.length) => [
      { mime: "image/heic", semantic: "Primary", padding },
      { mime: "video/mp4", semantic: "MotionPhoto", length },
    ];
    const build = (padding: number, headerType = "mpvd") =>
      heifFile(exifItem(exifTiff(null)), {
        xmp: directoryXmp(items(padding)),
        trailing: concat(u32(video.length + 8), ascii(headerType), video),
      });
    const file = build(8);
    const packets = await readHeifXmpPackets(bufferByteReader(file));
    const directory = readMotionPhotoDirectory(packets[0]!)!;
    const layout = await locateMotionPhotoVideo(
      bufferByteReader(file),
      "image/heic",
      directory,
    );
    expect(layout.videoLength).toBe(video.length);
    expect(layout.videoStart).toBe(file.length - video.length);
    expect(layout.primaryLength).toBe(file.length - video.length - 8);
    const wrongSize = build(8, "free");
    expect(
      await parseCodeAsync(async () =>
        locateMotionPhotoVideo(
          bufferByteReader(wrongSize),
          "image/heic",
          readMotionPhotoDirectory(
            (await readHeifXmpPackets(bufferByteReader(wrongSize)))[0]!,
          )!,
        ),
      ),
    ).toBe("structure_invalid");
    const wrongPadding = build(0);
    expect(
      await parseCodeAsync(async () =>
        locateMotionPhotoVideo(
          bufferByteReader(wrongPadding),
          "image/heic",
          readMotionPhotoDirectory(
            (await readHeifXmpPackets(bufferByteReader(wrongPadding)))[0]!,
          )!,
        ),
      ),
    ).toBe("structure_invalid");
  });

  it("bounds XMP parsing and rejects malformed directories", () => {
    const tooMany = directoryXmp(
      Array.from({ length: 17 }, (_, index) => ({
        mime: "image/jpeg",
        semantic: index === 0 ? "Primary" : "GainMap",
        length: 1,
      })),
    );
    expect(parseCode(() => readMotionPhotoDirectory(tooMany))).toBe(
      "limit_exceeded",
    );
    const badLength = directoryXmp([
      { mime: "image/jpeg", semantic: "Primary" },
      { mime: "video/mp4", semantic: "MotionPhoto", length: 12 },
    ]).replace('Length="12"', 'Length="-12"');
    expect(parseCode(() => readMotionPhotoDirectory(badLength))).toBe(
      "structure_invalid",
    );
    const hugeLength = badLength.replace(
      'Length="-12"',
      'Length="1234567890123456"',
    );
    expect(parseCode(() => readMotionPhotoDirectory(hugeLength))).toBe(
      "structure_invalid",
    );
    expect(
      parseCode(() => readMotionPhotoDirectory("<x:a><!DOCTYPE x></x:a>")),
    ).toBe("structure_invalid");
    expect(
      parseCode(() =>
        readMotionPhotoDirectory(`<a>${"x".repeat(1024 * 1024 + 1)}</a>`),
      ),
    ).toBe("limit_exceeded");
    const rebound = `<r xmlns:C="${CONTAINER}"><s xmlns:C="http://example.invalid/"/></r>`;
    expect(parseCode(() => readMotionPhotoDirectory(rebound))).toBe(
      "structure_invalid",
    );
  });

  it("reassembles complete Extended XMP only", () => {
    const main = '<x:xmpmeta xmlns:x="adobe:ns:meta/"/>';
    const extended = encoder.encode(
      directoryXmp([{ mime: "image/jpeg", semantic: "Primary" }]),
    );
    const guid = ascii("0123456789ABCDEF0123456789ABCDEF");
    const chunk = (offset: number, data: Uint8Array) =>
      segment(
        0xe1,
        concat(
          ascii("http://ns.adobe.com/xmp/extension/\0"),
          guid,
          u32(extended.length),
          u32(offset),
          data,
        ),
      );
    const half = Math.floor(extended.length / 2);
    const complete = jpeg(
      xmpSegment(main),
      chunk(0, extended.subarray(0, half)),
      chunk(half, extended.subarray(half)),
    );
    expect(readJpegXmpPackets(complete)).toHaveLength(2);
    const partial = jpeg(
      xmpSegment(main),
      chunk(0, extended.subarray(0, half)),
    );
    expect(readJpegXmpPackets(partial)).toHaveLength(1);
    // A byte-identical repeat is ignored and never counts as coverage.
    const padded =
      extended.length % 2 === 0 ? extended : concat(extended, ascii(" "));
    const evenChunk = (offset: number, data: Uint8Array) =>
      segment(
        0xe1,
        concat(
          ascii("http://ns.adobe.com/xmp/extension/\0"),
          guid,
          u32(padded.length),
          u32(offset),
          data,
        ),
      );
    const halfPadded = padded.length / 2;
    const firstHalf = padded.subarray(0, halfPadded);
    expect(
      readJpegXmpPackets(
        jpeg(
          xmpSegment(main),
          evenChunk(0, firstHalf),
          evenChunk(0, firstHalf),
        ),
      ),
    ).toHaveLength(1);
    expect(
      readJpegXmpPackets(
        jpeg(
          xmpSegment(main),
          evenChunk(0, firstHalf),
          evenChunk(0, firstHalf),
          evenChunk(halfPadded, padded.subarray(halfPadded)),
        ),
      ),
    ).toHaveLength(2);
    const altered = Uint8Array.from(firstHalf);
    altered[0] = 0x20;
    expect(
      parseCode(() =>
        readJpegXmpPackets(
          jpeg(
            xmpSegment(main),
            evenChunk(0, firstHalf),
            evenChunk(0, altered),
          ),
        ),
      ),
    ).toBe("structure_invalid");
    expect(
      parseCode(() =>
        readJpegXmpPackets(
          jpeg(
            xmpSegment(main),
            evenChunk(0, firstHalf),
            evenChunk(halfPadded - 1, padded.subarray(halfPadded - 1)),
          ),
        ),
      ),
    ).toBe("structure_invalid");
  });

  it("hashes identifiers for storage instead of keeping the UUID", () => {
    expect(contentIdentifierSha256(IDENTIFIER)).toMatch(/^[0-9a-f]{64}$/);
    expect(contentIdentifierSha256(IDENTIFIER)).not.toContain(IDENTIFIER);
  });
});
