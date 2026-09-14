import { describe, expect, it } from "vitest";

import { sha256HexOfText } from "../hashing";
import {
  contentIdentifierSha256,
  normalizeContentIdentifier,
  readStillFacts,
} from "./apple-live-photo";
import { MediaParseError, blobByteReader, bufferByteReader } from "./bytes";
import { readMotionPhotoContainer } from "./motion-photo";
import { readMotionFacts } from "./quicktime";
import {
  detectAnimation,
  readImageHeader,
  readSignature,
  sniffSignature,
} from "./signature";
import {
  IDENTIFIER,
  animatedGif,
  animatedWebp,
  avif,
  box,
  bytes,
  fileOf,
  heic,
  jpeg,
  motion,
  motionPhotoJpeg,
  png,
  tiff,
  u32,
} from "./synthetic-media.test-support";

import type { StillImageTimeTrack } from "./synthetic-media.test-support";

const reader = (data: Uint8Array) => bufferByteReader(data);

describe("signature identification (bytes only)", () => {
  it("identifies containers from leading bytes, never names", async () => {
    expect(sniffSignature(jpeg({})).type).toBe("image/jpeg");
    expect(sniffSignature(png()).type).toBe("image/png");
    expect(sniffSignature(heic({})).type).toBe("image/heic");
    expect(sniffSignature(motion({})).type).toBe("video/quicktime");
    expect(sniffSignature(motion({ brand: "isom" })).type).toBe("video/mp4");
    expect(sniffSignature(tiff()).type).toBe("image/tiff");
    expect(sniffSignature(avif()).type).toBe("image/avif");
    expect(sniffSignature(bytes("not an image at all")).type).toBe("unknown");
    // A JPEG named like a video is still a JPEG.
    const file = fileOf(jpeg({}), "clip.mov", "video/quicktime");
    expect((await readSignature(blobByteReader(file))).type).toBe("image/jpeg");
  });

  it("detects animated GIF, APNG and animated WebP", async () => {
    const gif = animatedGif();
    expect(await detectAnimation(reader(gif), sniffSignature(gif))).toBe(true);
    const apng = png({ animated: true });
    expect(await detectAnimation(reader(apng), sniffSignature(apng))).toBe(
      true,
    );
    expect(await detectAnimation(reader(png()), sniffSignature(png()))).toBe(
      false,
    );
    const webp = animatedWebp();
    expect(sniffSignature(webp)).toEqual({
      type: "image/webp",
      animated: true,
    });
  });

  it("reads PNG alpha possibility from the header", async () => {
    expect(
      (await readImageHeader(reader(png()), "image/png")).mayHaveAlpha,
    ).toBe(false);
    expect(
      (await readImageHeader(reader(png({ colorType: 6 })), "image/png"))
        .mayHaveAlpha,
    ).toBe(true);
    expect(
      (await readImageHeader(reader(png({ transparent: true })), "image/png"))
        .mayHaveAlpha,
    ).toBe(true);
    expect(
      (await readImageHeader(reader(png()), "image/png")).dimensions,
    ).toEqual({
      width: 4,
      height: 3,
    });
  });
});

describe("Apple Live Photo identifiers", () => {
  it("reads the MakerNote ContentIdentifier from JPEG APP1 and HEIC Exif items", async () => {
    const jpegFacts = await readStillFacts(
      reader(jpeg({ identifier: IDENTIFIER.toLowerCase(), orientation: 6 })),
      "image/jpeg",
    );
    expect(jpegFacts).toEqual({
      orientation: 6,
      contentIdentifier: IDENTIFIER,
      appleMakerNote: true,
    });
    const heicFacts = await readStillFacts(
      reader(heic({ identifier: IDENTIFIER })),
      "image/heic",
    );
    expect(heicFacts.contentIdentifier).toBe(IDENTIFIER);
    const plain = await readStillFacts(
      reader(jpeg({ orientation: 1 })),
      "image/jpeg",
    );
    expect(plain).toEqual({
      orientation: 1,
      contentIdentifier: null,
      appleMakerNote: false,
    });
  });

  it("reads the QuickTime identifier from moov/meta and moov/udta/meta", async () => {
    for (const layout of ["moov/meta", "moov/udta/meta"] as const) {
      const facts = await readMotionFacts(
        reader(motion({ identifier: IDENTIFIER, layout, audio: true })),
      );
      expect(facts).toEqual({
        contentIdentifier: IDENTIFIER,
        videoTracks: 1,
        audioTracks: 1,
        stillTimeMs: null,
      });
    }
    expect(
      (await readMotionFacts(reader(motion({})))).contentIdentifier,
    ).toBeNull();
  });

  it("reads the Apple still-image-time from its timed-metadata track (empty edit or empty sample)", async () => {
    const stillTime = async (stillImageTime: StillImageTimeTrack) =>
      (
        await readMotionFacts(
          reader(motion({ identifier: IDENTIFIER, stillImageTime })),
        )
      ).stillTimeMs;
    expect(await stillTime({ movieMs: 3000, emptyEditMs: 1500 })).toBe(1500);
    expect(await stillTime({ movieMs: 2800, emptySampleMs: 1250 })).toBe(1250);
    expect(await stillTime({ movieMs: 3000 })).toBe(0);
    // Outside the movie, or a track declaring other keys too: no claim.
    expect(await stillTime({ movieMs: 1000, emptySampleMs: 1500 })).toBeNull();
    expect(
      await stillTime({
        movieMs: 3000,
        emptyEditMs: 1500,
        extraKeys: ["com.apple.quicktime.live-photo-info"],
      }),
    ).toBeNull();
  });

  it("sends only the SHA-256 of the canonical identifier", async () => {
    expect(normalizeContentIdentifier(` ${IDENTIFIER.toLowerCase()} `)).toBe(
      IDENTIFIER,
    );
    expect(normalizeContentIdentifier("not-a-uuid")).toBeNull();
    const digest = contentIdentifierSha256(IDENTIFIER);
    const expected = Array.from(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(IDENTIFIER),
        ),
      ),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("");
    expect(digest).toBe(expected);
    expect(digest).toBe(sha256HexOfText(IDENTIFIER));
    expect(digest).not.toContain(IDENTIFIER);
  });
});

describe("Motion Photo containers", () => {
  it("locates the embedded video and the still presentation time", async () => {
    const data = motionPhotoJpeg({ presentationUs: 1_500_000 });
    const container = await readMotionPhotoContainer(
      reader(data),
      "image/jpeg",
    );
    expect(container).not.toBeNull();
    expect(container!.videoType).toBe("video/mp4");
    expect(container!.primaryLength + container!.videoLength).toBe(
      data.byteLength,
    );
    expect(container!.stillTimeMs).toBe(1500);
    expect(sniffSignature(data.subarray(container!.videoStart)).type).toBe(
      "video/mp4",
    );
  });

  it("refuses a directory that contradicts the file layout", async () => {
    await expect(
      readMotionPhotoContainer(
        reader(motionPhotoJpeg({ valid: false })),
        "image/jpeg",
      ),
    ).rejects.toBeInstanceOf(MediaParseError);
    expect(
      await readMotionPhotoContainer(reader(jpeg({})), "image/jpeg"),
    ).toBeNull();
  });
});

describe("bounded parsing of hostile structures", () => {
  it("rejects boxes that overrun their parent and reads within budget", async () => {
    const hostile = bytes(
      box("ftyp", "qt  ", u32(0), "qt  "),
      u32(0x7fffffff),
      "moov",
    );
    await expect(readMotionFacts(reader(hostile))).rejects.toBeInstanceOf(
      MediaParseError,
    );
    const budgeted = bufferByteReader(motion({ identifier: IDENTIFIER }), 16);
    await expect(readMotionFacts(budgeted)).rejects.toMatchObject({
      code: "limit_exceeded",
    });
  });

  it("rejects a truncated JPEG header without throwing anything else", async () => {
    const truncated = jpeg({ identifier: IDENTIFIER }).subarray(0, 40);
    await expect(
      readStillFacts(reader(truncated), "image/jpeg"),
    ).rejects.toBeInstanceOf(MediaParseError);
  });
});
