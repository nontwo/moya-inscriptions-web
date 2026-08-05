import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("sites sample fixture", () => {
  it("contains a readable non-empty array with fixture identifiers", async () => {
    const fixtureUrl = new URL(
      "../fixtures/sites.sample.json",
      import.meta.url,
    );
    const contents = await readFile(fixtureUrl, "utf8");
    const parsed: unknown = JSON.parse(contents);

    expect(Array.isArray(parsed)).toBe(true);

    if (!Array.isArray(parsed)) {
      throw new TypeError("The sites fixture must be an array.");
    }

    expect(parsed.length).toBeGreaterThan(0);

    for (const item of parsed) {
      expect(item).toBeTypeOf("object");
      expect(item).not.toBeNull();

      const record = item as Record<string, unknown>;
      expect(record.fixtureId).toBeTypeOf("string");
      expect(record.fixtureId).not.toBe("");
    }
  });
});
