import { describe, expect, expectTypeOf, it } from "vitest";

import type { ArchiveItemId, CatalogId, CatalogKind } from "@moya/contracts";
import {
  archiveItemIdJsonSchema,
  catalogIdJsonSchema,
  catalogKindJsonSchema,
} from "@moya/contracts/json-schema";
import {
  archiveItemIdSchema,
  catalogIdSchema,
  catalogKindSchema,
} from "@moya/contracts/schemas";

describe("canonical Catalog identity", () => {
  it("keeps ArchiveItemId as the same TypeScript identity", () => {
    expectTypeOf<ArchiveItemId>().toEqualTypeOf<CatalogId>();
    expectTypeOf<CatalogId>().toEqualTypeOf<ArchiveItemId>();
  });

  it("keeps Catalog and Archive validation semantics equivalent", () => {
    const valid = [
      "catalog-001",
      "platform-item-any-format",
      "碑刻-甲",
      "x".repeat(128),
    ];
    const invalid = ["", " ", "catalog item", "catalog\nitem", "x".repeat(129)];

    for (const candidate of [...valid, ...invalid]) {
      const catalogResult = catalogIdSchema.safeParse(candidate);
      const archiveResult = archiveItemIdSchema.safeParse(candidate);

      expect(archiveResult.success).toBe(catalogResult.success);
      if (catalogResult.success && archiveResult.success) {
        expect(archiveResult.data).toBe(catalogResult.data);
      }
    }

    for (const candidate of valid) {
      expect(catalogIdSchema.safeParse(candidate).success).toBe(true);
    }
    for (const candidate of invalid) {
      expect(catalogIdSchema.safeParse(candidate).success).toBe(false);
    }
  });

  it("generates both JSON Schema exports without requiring metadata identity", () => {
    expect(catalogIdJsonSchema).toMatchObject({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^\\S+$",
    });
    expect(archiveItemIdJsonSchema).toMatchObject({
      type: "string",
      minLength: 1,
      maxLength: 128,
      pattern: "^\\S+$",
    });
  });
});

describe("CatalogKind", () => {
  it("accepts exactly the three frozen values", () => {
    const kinds: CatalogKind[] = [
      "inscription",
      "cliff_inscription",
      "calligraphy",
    ];

    for (const kind of kinds) {
      expect(catalogKindSchema.parse(kind)).toBe(kind);
    }
    for (const kind of ["seal", "painting", "sculpture", "video"]) {
      expect(catalogKindSchema.safeParse(kind).success).toBe(false);
    }

    expect(catalogKindSchema.options).toEqual(kinds);
    expect(catalogKindJsonSchema).toMatchObject({
      enum: kinds,
      type: "string",
    });
  });
});
