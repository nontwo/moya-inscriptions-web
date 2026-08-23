import { describe, expect, it } from "vitest";

import { loadHomeCatalogState } from "../features/home/load-home-catalog";
import { homeCatalogScenarioSources } from "./home-catalog-scenarios";

describe("Home Catalog QA scenarios", () => {
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
