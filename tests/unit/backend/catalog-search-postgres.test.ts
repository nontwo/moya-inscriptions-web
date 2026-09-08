import { describe, expect, it } from "vitest";

const { buildCatalogSearchSql, escapeSearchLike } = await import(
  new URL(
    "../../../services/catalog-postgres/src/search-queries.ts",
    import.meta.url,
  ).href
);

describe("Catalog Search SQL parameter boundary", () => {
  it("treats percent, underscore and backslash literally", () => {
    expect(escapeSearchLike("100%_\\")).toBe("100\\%\\_\\\\");
    const q = "100%_\\ ' OR true --";
    const query = buildCatalogSearchSql({ q, page: 2, pageSize: 20 });
    expect(query.listSql).not.toContain(q);
    expect(query.countSql).not.toContain(q);
    expect(query.listValues.slice(0, 4)).toEqual([
      null,
      "opencc-1.4.1-t2s-v1",
      q,
      q,
    ]);
    expect(query.listValues.at(-1)).toBe("20");
    expect(query.countValues[4]).toBe("%100\\%\\_\\\\%");
  });

  it("rejects blank input and retains same-record AND without a candidate cap", () => {
    expect(() =>
      buildCatalogSearchSql({ q: " \t\n", page: 1, pageSize: 20 }),
    ).toThrow("Invalid Catalog search query");
    const query = buildCatalogSearchSql({
      q: "作者 书谱",
      kind: "calligraphy",
      page: 1,
      pageSize: 100,
    });
    expect(query.countValues[0]).toBe("calligraphy");
    expect(query.countValues.slice(4)).toEqual(["%作者%", "%书谱%"]);
    expect(query.listSql.match(/LIMIT/g)).toHaveLength(1);
    expect(query.listSql).toContain(
      'ORDER BY ranked.search_rank ASC, entry.catalog_id COLLATE "C" ASC',
    );
  });
});
