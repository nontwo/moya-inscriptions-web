import { describe, expect, it } from "vitest";

import type {
  ArchiveItemDetail,
  ArchiveItemRecord,
  ArchiveItemSummary,
} from "@moya/contracts";
import {
  archiveItemDetailJsonSchema,
  archiveItemRecordJsonSchema,
  archiveItemSummaryJsonSchema,
} from "@moya/contracts/json-schema";
import {
  archiveItemDetailSchema,
  archiveItemIdSchema,
  archiveItemPageSchema,
  archiveItemRecordSchema,
  archiveItemSummarySchema,
  imageAssetSchema,
} from "@moya/contracts/schemas";

const archiveItemId = archiveItemIdSchema.parse("archive-example-001");
const timestamp = "2026-08-08T12:00:00Z";

const minimalRecord: ArchiveItemRecord = {
  id: archiveItemId,
  title: "虚构档案甲",
  aliases: [],
  lifecycleStatus: "draft",
  categoryIds: [],
  imageIds: [],
  createdAt: timestamp,
  updatedAt: timestamp,
};

const minimalSummary: ArchiveItemSummary = {
  id: archiveItemId,
  title: "虚构档案甲",
  aliases: [],
  categoryIds: [],
};

const minimalDetail: ArchiveItemDetail = {
  ...minimalSummary,
  images: [],
  references: [],
  relatedItemIds: [],
};

describe("source-independent archive item contracts", () => {
  it("accepts a manually created record without source, location or media", () => {
    expect(archiveItemRecordSchema.parse(minimalRecord)).toEqual(minimalRecord);
    expect(archiveItemSummarySchema.parse(minimalSummary)).toEqual(
      minimalSummary,
    );
    expect(archiveItemDetailSchema.parse(minimalDetail)).toEqual(minimalDetail);
  });

  it("requires a trash timestamp and never models automatic purging", () => {
    expect(
      archiveItemRecordSchema.safeParse({
        ...minimalRecord,
        lifecycleStatus: "trashed",
      }).success,
    ).toBe(false);

    expect(
      archiveItemRecordSchema.safeParse({
        ...minimalRecord,
        lifecycleStatus: "trashed",
        trashedAt: timestamp,
      }).success,
    ).toBe(true);

    const purgeField = ["purge", "At"].join("");
    expect(
      archiveItemRecordSchema.safeParse({
        ...minimalRecord,
        [purgeField]: timestamp,
      }).success,
    ).toBe(false);
  });

  it("keeps lifecycle and internal legacy fields out of public DTOs", () => {
    expect(
      archiveItemSummarySchema.safeParse({
        ...minimalSummary,
        lifecycleStatus: "published",
      }).success,
    ).toBe(false);

    const internalFields = [
      ["raw", "Source"],
      ["source", "Index"],
      ["region", "Candidates"],
      ["review", "Evidence"],
    ].map((parts) => parts.join(""));

    for (const internalField of internalFields) {
      expect(
        archiveItemDetailSchema.safeParse({
          ...minimalDetail,
          [internalField]: {},
        }).success,
      ).toBe(false);
    }
  });

  it("uses object keys instead of image URLs or absolute paths", () => {
    const validImage = {
      id: "image-example-001",
      objectKey: "archive/example/image.webp",
      alt: "虚构档案图片",
      sortOrder: 0,
    };
    expect(imageAssetSchema.parse(validImage)).toEqual(validImage);
    expect(
      imageAssetSchema.safeParse({
        ...validImage,
        objectKey: "https://cdn.example.com/image.webp",
      }).success,
    ).toBe(false);
    expect(
      imageAssetSchema.safeParse({
        ...validImage,
        objectKey: "/absolute/image.webp",
      }).success,
    ).toBe(false);
  });

  it("exports strict JSON Schema projections", () => {
    for (const schema of [
      archiveItemRecordJsonSchema,
      archiveItemSummaryJsonSchema,
      archiveItemDetailJsonSchema,
    ]) {
      expect(schema).toMatchObject({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        additionalProperties: false,
      });
    }
  });

  it("keeps the package root types-only at runtime", async () => {
    expect(Object.keys(await import("@moya/contracts"))).toEqual([]);
  });

  it("enforces self-consistent page metadata", () => {
    const validPage = {
      items: [minimalSummary],
      total: 2,
      page: 1,
      pageSize: 1,
      totalPages: 2,
    };

    expect(archiveItemPageSchema.parse(validPage)).toEqual(validPage);
    expect(
      archiveItemPageSchema.safeParse({ ...validPage, totalPages: 1 }).success,
    ).toBe(false);
    expect(
      archiveItemPageSchema.safeParse({
        ...validPage,
        items: [minimalSummary, minimalSummary],
      }).success,
    ).toBe(false);
  });

  it("accepts empty totals and rejects items on an out-of-range page", () => {
    const emptyPage = {
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    };

    expect(archiveItemPageSchema.parse(emptyPage)).toEqual(emptyPage);
    expect(
      archiveItemPageSchema.safeParse({
        items: [minimalSummary],
        total: 1,
        page: 2,
        pageSize: 1,
        totalPages: 1,
      }).success,
    ).toBe(false);
  });
});
