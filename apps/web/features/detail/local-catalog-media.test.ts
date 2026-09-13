import { describe, expect, it } from "vitest";
import {
  localCatalogFileUrl,
  localCatalogMediaSrc,
} from "./local-catalog-media";
describe("native local Catalog media mapping", () => {
  const file = "a".repeat(64) + "-" + "b".repeat(64) + ".png";
  it("maps only bounded native loopback file sources and keeps identities separate", () => {
    expect(
      localCatalogMediaSrc(
        `http://127.0.0.1:3412/api/media/file/${file}`,
        "catalog:independent",
        "media:independent",
      ),
    ).toBe("/api/catalog/catalog%3Aindependent/media/media%3Aindependent");
    const remote = `https://example.invalid/api/media/file/${file}`;
    expect(localCatalogMediaSrc(remote, "catalog", "media")).toBe(remote);
  });
  it.each([
    "http://127.0.0.1:3412/api/users",
    "http://127.0.0.1:3412/api/media/file/arbitrary.png",
    `http://127.0.0.1:3412/api/media/file/${file}?token=synthetic-placeholder`,
    `http://localhost.example.invalid/api/media/file/${file}`,
  ])("rejects non-native source %s", (url) =>
    expect(localCatalogFileUrl(url)).toBeNull(),
  );
});
