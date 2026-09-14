import { describe, expect, it, vi } from "vitest";

import {
  EXIFR_READ_OPTIONS,
  buildMediaMetadata,
  extractMediaMetadata,
  gpsDecimal,
} from "./metadata";

const facts = {
  appleMakerNote: true,
  livePhotoIdentifier: true,
  exifOrientation: 6,
};

describe("bounded private metadata", () => {
  it("keeps allowlisted camera facts with provenance and reads bounded chunks", async () => {
    const parse = vi.fn(async () => ({
      Make: "Apple",
      Model: "iPhone 17 Pro Max",
      DateTimeOriginal: "2026:09:13 10:11:12",
      ExposureTime: 0.01,
      FNumber: 1.78,
      ISO: 64,
      Orientation: 6,
      BodySerialNumber: "SERIAL-123",
      LensSerialNumber: "LENS-456",
      MakerNote: new Uint8Array([1, 2, 3]),
      thumbnail: new Uint8Array([4, 5]),
    }));
    const metadata = await extractMediaMetadata(new Blob(["x"]), facts, parse);
    expect(parse).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({
        ...EXIFR_READ_OPTIONS,
        makerNote: false,
        xmp: false,
        icc: false,
      }),
    );
    expect(metadata.provenance).toEqual({
      source: "client",
      parser: "exifr@7.1.3",
      status: "parsed",
    });
    expect(metadata.values).toMatchObject({
      "exif:Make": "Apple",
      "exif:Model": "iPhone 17 Pro Max",
      "exif:ISO": 64,
      "apple:MakerNote": true,
      "apple:LivePhotoIdentifier": true,
    });
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain("SERIAL");
    expect(serialized).not.toContain("LENS-456");
    expect(
      Object.keys(metadata.values).every((key) =>
        /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/u.test(key),
      ),
    ).toBe(true);
  });

  it("converts GPS to bounded decimals and drops altitude without coordinates", () => {
    expect(gpsDecimal([40, 30, 36], "N")).toBe(40.51);
    expect(gpsDecimal([73, 58, 12], "W")).toBeCloseTo(-73.97, 6);
    expect(gpsDecimal([400, 0, 0], "N")).toBeNull();
    const withCoordinates = buildMediaMetadata(
      {
        GPSLatitude: [40, 30, 36],
        GPSLatitudeRef: "N",
        GPSLongitude: [73, 58, 12],
        GPSLongitudeRef: "W",
        GPSAltitude: 12.5,
      },
      false,
      null,
    );
    expect(withCoordinates.values).toMatchObject({
      "gps:Latitude": 40.51,
      "gps:Altitude": 12.5,
    });
    const altitudeOnly = buildMediaMetadata(
      { GPSAltitude: 12.5, Make: "X" },
      false,
      null,
    );
    expect(altitudeOnly.values["gps:Altitude"]).toBeUndefined();
  });

  it("reports partial when only the client parser found facts and absent when nothing was found", async () => {
    const failing = vi.fn(async () => {
      throw new Error("unreadable");
    });
    const partial = await extractMediaMetadata(new Blob(["x"]), facts, failing);
    expect(partial.provenance.status).toBe("partial");
    expect(partial.values).toEqual({
      "apple:MakerNote": true,
      "apple:LivePhotoIdentifier": true,
      "exif:Orientation": 6,
    });
    const absent = buildMediaMetadata(undefined, false, {
      appleMakerNote: false,
      livePhotoIdentifier: false,
      exifOrientation: null,
    });
    expect(absent).toEqual({
      provenance: { source: "client", parser: "exifr@7.1.3", status: "absent" },
      values: {},
    });
  });

  it("strips control characters and bounds string length", () => {
    const metadata = buildMediaMetadata(
      { Model: `A\u0000B\u0007${"x".repeat(500)}` },
      false,
      null,
    );
    const model = metadata.values["exif:Model"] as string;
    expect(model.startsWith("AB")).toBe(true);
    expect([...model]).toHaveLength(128);
    expect(
      new TextEncoder().encode(JSON.stringify(metadata)).byteLength,
    ).toBeLessThanOrEqual(16 * 1024);
  });
});
