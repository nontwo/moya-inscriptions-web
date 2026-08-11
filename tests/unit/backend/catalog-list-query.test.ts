import { describe, expect, expectTypeOf, it } from "vitest";

import { parseCatalogListQuery } from "@moya/api";

import type { CatalogListQuery } from "@moya/api";
import type { CatalogListTransportQuery } from "@moya/contracts";

describe("Catalog list transport boundary", () => {
  it("normalizes validated transport strings into application numbers", () => {
    const transport: CatalogListTransportQuery = {
      kind: "calligraphy",
      page: "2",
      pageSize: "25",
    };

    const query = parseCatalogListQuery(transport);

    expect(query).toEqual({ kind: "calligraphy", page: 2, pageSize: 25 });
    expectTypeOf(query).toEqualTypeOf<CatalogListQuery>();
    expectTypeOf(query.page).toEqualTypeOf<number>();
    expectTypeOf(query.pageSize).toEqualTypeOf<number>();
  });

  it("applies application defaults only after transport validation", () => {
    expect(parseCatalogListQuery({})).toEqual({ page: 1, pageSize: 20 });
  });

  it("rejects invalid and out-of-scope transport input", () => {
    for (const invalid of [
      { page: "0" },
      { page: "01" },
      { page: "1.5" },
      { page: "9007199254740992" },
      { pageSize: "101" },
      { kind: "cliff_inscription" },
      { page: 2 },
      { keyword: "碑" },
    ]) {
      expect(() => parseCatalogListQuery(invalid)).toThrow();
    }
  });
});
