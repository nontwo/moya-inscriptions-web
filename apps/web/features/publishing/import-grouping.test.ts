import { describe, expect, it } from "vitest";

import {
  addToStagingBatch,
  attachStagedCounterpart,
  confirmStaging,
  countStaging,
  createStagingBatch,
  identifyFile,
  identifyFiles,
  keepStagedStillAsPhoto,
  pairingDigest,
  resolveStagedAmbiguity,
  setBatchOriginal,
} from "./import-grouping";
import { contentIdentifierSha256 } from "./parsers/apple-live-photo";
import {
  IDENTIFIER,
  OTHER_IDENTIFIER,
  animatedGif,
  animatedWebp,
  avif,
  bytes,
  fileOf,
  heic,
  jpeg,
  motion,
  motionPhotoJpeg,
  png,
  tiff,
} from "./parsers/synthetic-media.test-support";

import type {
  IdentifiedFile,
  IdentifiedStill,
  StagedEntry,
  StagingBatch,
} from "./import-grouping";

let counter = 0;
const keys = () => `k${(counter += 1)}`;

const identify = async (...files: File[]) => identifyFiles(files);

const statuses = (entries: readonly StagedEntry[]) =>
  entries.map((entry) => entry.status);

describe("file identification", () => {
  it("never trusts names or browser types", async () => {
    const disguised = await identifyFile(
      fileOf(jpeg({}), "live.mov", "video/quicktime"),
    );
    expect(disguised).toMatchObject({ kind: "still", type: "image/jpeg" });
    const renamedVideo = await identifyFile(
      fileOf(motion({}), "photo.jpg", "image/jpeg"),
    );
    expect(renamedVideo).toMatchObject({
      kind: "motion",
      type: "video/quicktime",
    });
  });

  it("refuses animated, RAW/TIFF, unknown and empty files with honest reasons", async () => {
    const results = await identify(
      fileOf(animatedGif()),
      fileOf(png({ animated: true })),
      fileOf(animatedWebp()),
      fileOf(tiff()),
      fileOf(avif()),
      fileOf(bytes("%PDF-1.7 not media")),
      fileOf(new Uint8Array(0)),
    );
    expect(
      results.map((result) =>
        result.kind === "unsupported" ? result.reason : result.kind,
      ),
    ).toEqual([
      "animated_image",
      "animated_image",
      "animated_image",
      "raw_or_tiff",
      "unsupported_type",
      "unsupported_type",
      "empty_file",
    ]);
  });
});

describe("grouping into logical items", () => {
  it("pairs a Live Photo by ContentIdentifier regardless of file names", async () => {
    const files = await identify(
      fileOf(heic({ identifier: IDENTIFIER }), "IMG_0001.HEIC"),
      fileOf(motion({ identifier: IDENTIFIER }), "unrelated-name.MOV"),
      fileOf(jpeg({}), "IMG_0001.MOV"),
    );
    const batch = createStagingBatch(files, "picker", keys);
    expect(statuses(batch.entries)).toEqual(["ready", "ready"]);
    const live = batch.entries[0]!;
    expect(live.status === "ready" && live.source.kind).toBe("live");
    expect(live.status === "ready" && pairingDigest(live.source)).toBe(
      contentIdentifierSha256(IDENTIFIER),
    );
  });

  it("does not pair files with the same name but different identifiers", async () => {
    const files = await identify(
      fileOf(jpeg({ identifier: IDENTIFIER }), "IMG_7.JPG"),
      fileOf(motion({ identifier: OTHER_IDENTIFIER }), "IMG_7.MOV"),
    );
    const batch = createStagingBatch(files, "picker", keys);
    expect(statuses(batch.entries)).toEqual([
      "needs_counterpart",
      "needs_still",
    ]);
  });

  it("asks for the counterpart of a Live still and accepts only a matching motion", async () => {
    const [still] = await identify(fileOf(jpeg({ identifier: IDENTIFIER })));
    const batch = createStagingBatch([still!], "picker", keys);
    const entry = batch.entries[0]!;
    expect(entry.status).toBe("needs_counterpart");
    const wrong = await identifyFile(
      fileOf(motion({ identifier: OTHER_IDENTIFIER })),
    );
    expect(attachStagedCounterpart(batch, entry.key, wrong)).toEqual({
      ok: false,
      error: "pairing_mismatch",
    });
    const right = await identifyFile(
      fileOf(motion({ identifier: IDENTIFIER })),
    );
    const attached = attachStagedCounterpart(batch, entry.key, right);
    expect(attached.ok && statuses(attached.batch.entries)).toEqual(["ready"]);
    const kept = keepStagedStillAsPhoto(batch, entry.key);
    expect(kept.ok && kept.batch.entries[0]).toMatchObject({
      status: "ready",
      source: { kind: "static" },
    });
  });

  it("pairs a still and its motion picked separately, keeping keys and never staging a file twice", async () => {
    const [still, plain] = await identify(
      fileOf(heic({ identifier: IDENTIFIER })),
      fileOf(jpeg({})),
    );
    const first = addToStagingBatch(null, [still!, plain!], "picker", keys);
    expect(statuses(first.entries)).toEqual(["needs_counterpart", "ready"]);
    const waitingKey = first.entries[0]!.key;
    const plainKey = first.entries[1]!.key;
    const [other] = await identify(
      fileOf(motion({ identifier: OTHER_IDENTIFIER })),
    );
    const second = addToStagingBatch(first, [other!, plain!], "picker", keys);
    expect(
      second.entries.map((entry) => [entry.status, entry.key === waitingKey]),
    ).toEqual([
      ["ready", false],
      ["needs_counterpart", true],
      ["needs_still", false],
    ]);
    const [counterpart] = await identify(
      fileOf(motion({ identifier: IDENTIFIER })),
    );
    const third = addToStagingBatch(second, [counterpart!], "picker", keys);
    expect(statuses(third.entries)).toEqual(["ready", "ready", "needs_still"]);
    const paired = third.entries[1]!;
    expect(paired.key).toBe(waitingKey);
    expect(paired.status === "ready" && paired.source.kind).toBe("live");
    expect(third.entries[0]!.key).toBe(plainKey);
  });

  it("asks when several stills or motions share one identifier", async () => {
    const files = await identify(
      fileOf(heic({ identifier: IDENTIFIER })),
      fileOf(jpeg({ identifier: IDENTIFIER })),
      fileOf(motion({ identifier: IDENTIFIER })),
    );
    const batch = createStagingBatch(files, "picker", keys);
    expect(statuses(batch.entries)).toEqual(["ambiguous"]);
    const resolved = resolveStagedAmbiguity(
      batch,
      batch.entries[0]!.key,
      1,
      0,
      keys,
    );
    expect(resolved.ok && statuses(resolved.batch.entries)).toEqual([
      "ready",
      "needs_counterpart",
    ]);
  });

  it("refuses an independent video and keeps a Motion Photo container as one live item", async () => {
    const files = await identify(
      fileOf(motion({ brand: "isom" })),
      fileOf(motionPhotoJpeg()),
    );
    const batch = createStagingBatch(files, "drop", keys);
    expect(batch.entries[0]).toMatchObject({
      status: "unsupported",
      reason: "independent_video",
    });
    expect(batch.entries[1]).toMatchObject({
      status: "ready",
      source: { kind: "live", layout: "container" },
    });
  });

  it("never flattens an unverifiable Motion Photo silently", async () => {
    const files = await identify(fileOf(motionPhotoJpeg({ valid: false })));
    const batch = createStagingBatch(files, "picker", keys);
    expect(statuses(batch.entries)).toEqual(["container_invalid"]);
    const kept = keepStagedStillAsPhoto(batch, batch.entries[0]!.key);
    expect(kept.ok && statuses(kept.batch.entries)).toEqual(["ready"]);
  });
});

const staticStill = (index: number): IdentifiedFile => ({
  kind: "still",
  file: fileOf(jpeg({}), `s${index}`),
  type: "image/jpeg",
  orientation: null,
  contentIdentifier: null,
  appleMakerNote: false,
  motionPhoto: null,
  motionPhotoInvalid: false,
});

const livePair = (identifier: string): IdentifiedFile[] => [
  { ...(staticStill(0) as IdentifiedStill), contentIdentifier: identifier },
  {
    kind: "motion",
    file: fileOf(motion({ identifier })),
    type: "video/quicktime",
    contentIdentifier: identifier,
    audioTracks: 1,
    stillTimeMs: null,
  },
];

describe("staging counts against the item limit", () => {
  const batchOf = (files: IdentifiedFile[]): StagingBatch =>
    createStagingBatch(files, "picker", keys);

  it("counts 0, 1, 50 and 51 logical items with a Live pair counting once", () => {
    expect(countStaging(batchOf([]), 0, 50)).toMatchObject({
      ready: 0,
      total: 0,
      withinLimit: true,
    });
    const pairOnly = batchOf(livePair(IDENTIFIER));
    expect(countStaging(pairOnly, 0, 50)).toMatchObject({
      ready: 1,
      total: 1,
      withinLimit: true,
    });
    const fifty = batchOf([
      ...livePair(IDENTIFIER),
      ...Array.from({ length: 49 }, (_, index) => staticStill(index)),
    ]);
    expect(countStaging(fifty, 0, 50)).toMatchObject({
      ready: 50,
      total: 50,
      withinLimit: true,
      overBy: 0,
    });
    expect(confirmStaging(fifty, 0, 50).ok).toBe(true);
    const fiftyOne = batchOf([
      ...livePair(IDENTIFIER),
      ...Array.from({ length: 50 }, (_, index) => staticStill(index)),
    ]);
    expect(countStaging(fiftyOne, 0, 50)).toMatchObject({
      ready: 51,
      withinLimit: false,
      overBy: 1,
    });
    expect(confirmStaging(fiftyOne, 0, 50)).toEqual({
      ok: false,
      error: "items_limit",
    });
    // Items already in the work count too.
    expect(confirmStaging(batchOf([staticStill(1)]), 50, 50)).toEqual({
      ok: false,
      error: "items_limit",
    });
  });

  it("confirms under the batch mode, resets Original and keeps unresolved choices staged", async () => {
    const [waiting] = await identify(fileOf(jpeg({ identifier: IDENTIFIER })));
    const batch = setBatchOriginal(batchOf([staticStill(1), waiting!]), true);
    const result = confirmStaging(batch, 3, 50);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.confirmed.map((entry) => entry.qualityMode)).toEqual([
      "original",
    ]);
    expect(result.remaining?.original).toBe(false);
    expect(statuses(result.remaining!.entries)).toEqual(["needs_counterpart"]);
    expect(createStagingBatch([], "picker").original).toBe(false);
  });

  it("labels pasted images as not camera originals", () => {
    const result = confirmStaging(
      createStagingBatch([staticStill(2)], "paste", keys),
      0,
      50,
    );
    expect(result.ok && result.confirmed[0]!.notCameraOriginal).toBe(true);
    // Mixed picks in one batch: only the pasted images are labelled.
    const mixed = addToStagingBatch(
      addToStagingBatch(
        createStagingBatch([staticStill(3)], "picker", keys),
        [staticStill(4)],
        "paste",
        keys,
      ),
      [staticStill(5)],
      "picker",
      keys,
    );
    const confirmed = confirmStaging(mixed, 0, 50);
    expect(
      confirmed.ok && confirmed.confirmed.map((c) => c.notCameraOriginal),
    ).toEqual([false, true, false]);
    const pasteFirst = addToStagingBatch(
      createStagingBatch([staticStill(6)], "paste", keys),
      [staticStill(7)],
      "drop",
      keys,
    );
    const second = confirmStaging(pasteFirst, 0, 50);
    expect(
      second.ok && second.confirmed.map((c) => c.notCameraOriginal),
    ).toEqual([true, false]);
  });
});
