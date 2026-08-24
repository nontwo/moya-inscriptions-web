import { describe, expect, it } from "vitest";

import { loadHomeCatalogState } from "../features/home/load-home-catalog";
import {
  createSmallPopulatedHomeCatalogSource,
  createVisualCatalogItems,
  createVisualHomeCatalogSource,
  homeCatalogScenarioSources,
  visualCatalogBrokenMediaPath,
} from "./home-catalog-scenarios";

const visualOrigin = "http://127.0.0.1:3100";

const validVisualAssetNames = new Set([
  "calligraphy-sheet.svg",
  "cliff-gate.svg",
  "discovery-stone.svg",
  "ink-album.svg",
  "inscription-rubbing.svg",
  "qa-visual-square.svg",
  "qa-visual-ultrawide.svg",
  "rubbing-fragment.svg",
  "stele-shadow.svg",
  "stone-detail.svg",
  "valley-wall.svg",
]);

describe("Home Catalog QA scenarios", () => {
  it("keeps the Visual scenario bounded, typed, and obviously synthetic", () => {
    const items = createVisualCatalogItems(visualOrigin);
    const inscriptionItems = items.filter(({ kind }) => kind === "inscription");
    const calligraphyItems = items.filter(({ kind }) => kind === "calligraphy");
    const noMediaItems = items.filter(
      ({ representativeMedia }) => representativeMedia === undefined,
    );
    const brokenMediaItems = items.filter(
      ({ representativeMedia }) =>
        representativeMedia !== undefined &&
        new URL(representativeMedia.src).pathname ===
          visualCatalogBrokenMediaPath,
    );
    const validMediaItems = items.filter(
      ({ representativeMedia }) =>
        representativeMedia !== undefined &&
        new URL(representativeMedia.src).pathname !==
          visualCatalogBrokenMediaPath,
    );

    expect(items).toHaveLength(24);
    expect(inscriptionItems).toHaveLength(12);
    expect(calligraphyItems).toHaveLength(12);
    expect(validMediaItems).toHaveLength(17);
    expect(noMediaItems).toHaveLength(6);
    expect(brokenMediaItems).toHaveLength(1);
    expect(items.every(({ id }) => id.startsWith("qa-visual-"))).toBe(true);
    expect(new Set(items.map(({ id }) => id)).size).toBe(items.length);
    expect(
      items.every(
        ({ representativeMedia }) =>
          representativeMedia === undefined ||
          representativeMedia.id.startsWith("qa-visual-"),
      ),
    ).toBe(true);
    expect(items.map(({ kind }) => kind)).toEqual(
      Array.from({ length: 12 }, () => ["inscription", "calligraphy"]).flat(),
    );
  });

  it("uses only same-origin checked-in assets for successful Visual media", () => {
    const items = createVisualCatalogItems(visualOrigin);
    const successfulMedia = items.flatMap(({ representativeMedia }) => {
      if (representativeMedia === undefined) return [];
      const url = new URL(representativeMedia.src);
      return url.pathname === visualCatalogBrokenMediaPath
        ? []
        : [{ media: representativeMedia, url }];
    });

    expect(successfulMedia).toHaveLength(17);
    for (const { media, url } of successfulMedia) {
      expect(url.origin).toBe(visualOrigin);
      expect(url.pathname).toMatch(
        /^\/docs\/design-system\/assets\/demo\/[^/]+\.svg$/,
      );
      expect(validVisualAssetNames.has(url.pathname.split("/").at(-1)!)).toBe(
        true,
      );
      expect(media.width).toBeGreaterThan(0);
      expect(media.height).toBeGreaterThan(0);
    }
  });

  it("rejects non-HTTP Visual media origins", () => {
    expect(() => createVisualCatalogItems("file:///tmp/qa")).toThrow(
      "Visual media origin must use HTTP or HTTPS",
    );
  });

  it("maps and paginates the Visual source through the existing state contract", async () => {
    const source = createVisualHomeCatalogSource(visualOrigin);
    const home = await loadHomeCatalogState(
      { page: "1", pageSize: "24" },
      source,
    );
    const inscriptions = await loadHomeCatalogState(
      { kind: "inscription", page: "2", pageSize: "5" },
      source,
    );
    const calligraphy = await loadHomeCatalogState(
      { kind: "calligraphy", page: "1", pageSize: "24" },
      source,
    );

    expect(home.state).toBe("populated");
    if (home.state === "populated") {
      expect(home.page).toMatchObject({
        page: 1,
        pageSize: 24,
        total: 24,
        totalPages: 1,
      });
      expect(home.page.items).toHaveLength(24);
    }

    expect(inscriptions.state).toBe("populated");
    if (inscriptions.state === "populated") {
      expect(inscriptions.page).toMatchObject({
        page: 2,
        pageSize: 5,
        total: 12,
        totalPages: 3,
      });
      expect(inscriptions.page.items).toHaveLength(5);
      expect(
        inscriptions.page.items.every(({ kind }) => kind === "inscription"),
      ).toBe(true);
    }

    expect(calligraphy.state).toBe("populated");
    if (calligraphy.state === "populated") {
      expect(calligraphy.page).toMatchObject({
        page: 1,
        pageSize: 24,
        total: 12,
        totalPages: 1,
      });
      expect(
        calligraphy.page.items.every(({ kind }) => kind === "calligraphy"),
      ).toBe(true);
    }
  });

  it("maps the populated scenario through the existing state contract", async () => {
    const state = await loadHomeCatalogState(
      undefined,
      homeCatalogScenarioSources.populated,
    );

    expect(state.state).toBe("populated");
    if (state.state !== "populated") return;

    expect(state.page.items).toHaveLength(2);
    expect(state.page.items.map(({ kind }) => kind)).toEqual([
      "inscription",
      "calligraphy",
    ]);
    expect(
      state.page.items.every(({ id }) => id.startsWith("qa-scenario-")),
    ).toBe(true);
  });

  it("uses same-origin checked-in media for Development Small populated", async () => {
    const state = await loadHomeCatalogState(
      undefined,
      createSmallPopulatedHomeCatalogSource(visualOrigin),
    );

    expect(state.state).toBe("populated");
    if (state.state !== "populated") return;

    expect(state.page.items).toHaveLength(2);
    const [withMedia, withoutMedia] = state.page.items;
    expect(withMedia?.representativeMedia).toMatchObject({
      height: 480,
      src: `${visualOrigin}/docs/design-system/assets/demo/rubbing-fragment.svg`,
      width: 360,
    });
    expect(withoutMedia).not.toHaveProperty("representativeMedia");
  });

  it("represents representative-media and no-media records truthfully", async () => {
    const state = await loadHomeCatalogState(
      undefined,
      homeCatalogScenarioSources.populated,
    );

    expect(state.state).toBe("populated");
    if (state.state !== "populated") return;

    const [withMedia, withoutMedia] = state.page.items;
    expect(withMedia?.representativeMedia).toMatchObject({
      id: "qa-scenario-inscription-media",
      src: "https://qa.invalid/scenarios/inscription.jpg",
    });
    expect(withoutMedia).not.toHaveProperty("representativeMedia");
  });

  it.each(["inscription", "calligraphy"] as const)(
    "honors the existing %s Catalog query",
    async (kind) => {
      const state = await loadHomeCatalogState(
        { kind, page: "1", pageSize: "1" },
        homeCatalogScenarioSources.populated,
      );

      expect(state.state).toBe("populated");
      if (state.state !== "populated") return;

      expect(state.page).toMatchObject({
        page: 1,
        pageSize: 1,
        total: 1,
        totalPages: 1,
      });
      expect(state.page.items.map((item) => item.kind)).toEqual([kind]);
    },
  );

  it("maps the empty scenario to an empty Catalog page", async () => {
    await expect(
      loadHomeCatalogState(undefined, homeCatalogScenarioSources.empty),
    ).resolves.toEqual({
      page: {
        items: [],
        page: 1,
        pageSize: 20,
        total: 0,
        totalPages: 0,
      },
      state: "empty",
    });
  });

  it.each([
    ["unavailable", "unavailable", homeCatalogScenarioSources.unavailable],
    [
      "unexpected-error",
      "unexpected-error",
      homeCatalogScenarioSources.unexpectedError,
    ],
  ] as const)(
    "maps the %s scenario to %s state",
    async (_, expected, source) => {
      await expect(loadHomeCatalogState(undefined, source)).resolves.toEqual({
        state: expected,
      });
    },
  );
});
