import { describe, expect, it } from "vitest";
import { parseCatalogSearchQuery } from "@moya/api";
import {
  catalogSearchPageSchema,
  catalogSearchTransportQuerySchema,
} from "@moya/contracts/schemas";

describe("Search V1 transport contract", () => {
  it("normalizes transport defaults and preserves literal text", () => {
    expect(parseCatalogSearchQuery({ q: "  合成書譜  " })).toEqual({
      q: "合成書譜",
      page: 1,
      pageSize: 20,
    });
    expect(
      parseCatalogSearchQuery({
        q: "100%_\\\t合成",
        kind: "calligraphy",
        page: "2",
        pageSize: "100",
      }),
    ).toEqual({
      q: "100%_\\\t合成",
      kind: "calligraphy",
      page: 2,
      pageSize: 100,
    });
  });
  it.each([
    {},
    { q: "" },
    { q: " \n\t " },
    { q: ["合成"] },
    { q: "合成", page: "0" },
    { q: "合成", page: "9007199254740992" },
    { q: "合成", pageSize: "101" },
    { q: "合成", kind: "cliff_inscription" },
    { q: "合成", author: "虚构" },
    { q: "字".repeat(201) },
    { q: "合成\u0000文字" },
  ])("rejects invalid request shape %#", (query) => {
    expect(catalogSearchTransportQuerySchema.safeParse(query).success).toBe(
      false,
    );
  });
  it("retains strict pagination invariants and requires a truthful match kind", () => {
    const empty = { items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 };
    expect(catalogSearchPageSchema.parse(empty)).toEqual(empty);
    expect(
      catalogSearchPageSchema.safeParse({ ...empty, totalPages: 1 }).success,
    ).toBe(false);
    const item = {
      id: "synthetic-search",
      kind: "calligraphy",
      title: "合成标题",
      aliases: [],
    };
    const full = {
      items: [{ ...item, matchKind: "body" }],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    };
    expect(catalogSearchPageSchema.safeParse(full).success).toBe(true);
    expect(
      catalogSearchPageSchema.safeParse({ ...full, items: [item] }).success,
    ).toBe(false);
    expect(
      catalogSearchPageSchema.safeParse({
        ...full,
        items: [{ ...item, matchKind: "near" }],
      }).success,
    ).toBe(false);
    expect(
      catalogSearchPageSchema.safeParse({ ...full, q: "unexpected echo" })
        .success,
    ).toBe(false);
  });
});
