import { describe, expect, it } from "vitest";

import {
  createDetailQaScenarios,
  detailQaScenarioForCatalogId,
  detailQaScenarioKeys,
} from "./detail-catalog-scenarios";
import { isUltraWideCatalogMedia } from "../features/catalog/media-layout";

describe("Detail Catalog QA scenarios", () => {
  const scenarios = createDetailQaScenarios("http://192.0.2.44:3102");

  it("defines exactly the eight Owner-approved Development scenarios", () => {
    expect(scenarios.map(({ key }) => key)).toEqual(detailQaScenarioKeys);
    expect(scenarios).toHaveLength(8);
    expect(new Set(scenarios.map(({ catalogId }) => catalogId)).size).toBe(8);
    expect(new Set(scenarios.map(({ detail }) => detail.id)).size).toBe(8);
  });

  it("keeps every scenario visibly QA-owned with same-origin media", () => {
    for (const scenario of scenarios) {
      expect(scenario.detail.source).toBe("qa");
      expect(scenario.detail.id).toMatch(/^qa-detail-/);
      for (const media of scenario.detail.media) {
        expect(new URL(media.src).origin).toBe("http://192.0.2.44:3102");
        expect(media.id).toMatch(/^qa-detail-/);
      }
    }
  });

  it("covers single media, no media, mixed media, and inclusive ultra-wide media", () => {
    expect(
      scenarios.slice(0, 3).map(({ detail }) => detail.media.length),
    ).toEqual([1, 1, 1]);
    expect(
      scenarios.find(({ key }) => key === "no-media")?.detail.media,
    ).toEqual([]);
    const boundary = scenarios.find(({ key }) => key === "single-ultrawide")
      ?.detail.media[0];
    expect(boundary && boundary.width / boundary.height).toBe(2.4);
    expect(isUltraWideCatalogMedia(boundary)).toBe(true);
    const tablet = scenarios.find(({ key }) => key === "tablet-ultrawide-grid");
    expect(tablet?.detail.media.some(isUltraWideCatalogMedia)).toBe(true);
  });

  it("keeps the four required textual sections separate", () => {
    const complete = scenarios.find(
      ({ key }) => key === "inscription-complete",
    );
    expect(complete?.detail.sections.map(({ id }) => id)).toEqual([
      "introduction",
      "transcription",
      "historical-context",
      "scholarly-research",
      "explanation",
    ]);
  });

  it("maps Browse identities only to their own QA Detail", () => {
    for (const scenario of scenarios) {
      expect(
        detailQaScenarioForCatalogId(scenarios, scenario.catalogId)?.detail,
      ).toBe(scenario.detail);
    }
    expect(detailQaScenarioForCatalogId(scenarios, "runtime-catalog-id")).toBe(
      undefined,
    );
  });
});
