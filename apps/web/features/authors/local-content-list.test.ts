import { describe, expect, it } from "vitest";
import type { ContentCard, ContentIdentity } from "@moya/contracts";
import { AuthorRequestError } from "./author-data";
import { resolveLocalContent } from "./local-content-list";
const targets: ContentIdentity[] = Array.from({ length: 14 }, (_, n) => ({
  type: "catalog",
  id: `catalog-${n}`,
}));
const card = (target: ContentIdentity): ContentCard => ({
  target,
  title: "合成正文",
  aliases: target.id === "catalog-13" ? ["独立别名"] : [],
  kind:
    target.type === "work"
      ? null
      : target.id === "catalog-1"
        ? "calligraphy"
        : "inscription",
  authorId: null,
  media: null,
  firstPublishedAt: null,
});
describe("device-local eligible collection search", () => {
  it("finds an alias beyond page one without exceeding twelve concurrent metadata reads", async () => {
    let active = 0,
      maximum = 0,
      total = 0;
    const items = await resolveLocalContent(
      targets,
      async (target) => {
        active++;
        total++;
        maximum = Math.max(active, maximum);
        await Promise.resolve();
        active--;
        return card(target);
      },
      "独立别名",
      "all",
    );
    expect(items.map((item) => item.target.id)).toEqual(["catalog-13"]);
    expect(total).toBe(14);
    expect(maximum).toBeLessThanOrEqual(12);
  });
  it("filters the entire eligible sequence before pagination and keeps works under All", async () => {
    const input: ContentIdentity[] = [
      { type: "work", id: "work-example" },
      ...targets,
    ];
    const read = async (target: ContentIdentity) => {
      if (target.id === "catalog-0")
        throw new AuthorRequestError(404, "unavailable");
      return card(target);
    };
    const all = await resolveLocalContent(input, read, "", "all");
    expect(all).toHaveLength(14);
    expect(all[0]?.target.type).toBe("work");
    expect(
      (await resolveLocalContent(input, read, "", "calligraphy")).map(
        (item) => item.target.id,
      ),
    ).toEqual(["catalog-1"]);
    expect(
      await resolveLocalContent(input, read, "", "inscription"),
    ).toHaveLength(12);
    expect(input).toHaveLength(15);
  });
  it("does not turn transient metadata failure into a partial collection or consume local identities", async () => {
    const original = structuredClone(targets);
    await expect(
      resolveLocalContent(
        targets,
        async (target) => {
          if (target.id === "catalog-13")
            throw new AuthorRequestError(503, "retry");
          return card(target);
        },
        "",
        "all",
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(targets).toEqual(original);
  });
});
