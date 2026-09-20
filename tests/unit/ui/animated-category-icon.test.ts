import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AnimatedCategoryIcon } from "@moya/ui";

it.each(["nearby", "inscriptions", "calligraphy"] as const)(
  "keeps %s animated vector identical to its canonical artwork",
  async (name) => {
    const source = await readFile(
      new URL(
        `../../../packages/ui/src/assets/icons/${name}.svg`,
        import.meta.url,
      ),
      "utf8",
    );
    const attributes = (markup: string, tag: "svg" | "path") => {
      const element = markup.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0];
      if (!element) throw new Error(`Missing ${tag}`);
      return new Map(
        [...element.matchAll(/([\w-]+)="([^"]*)"/g)].map((match) => [
          match[1],
          match[2],
        ]),
      );
    };
    const rendered = renderToStaticMarkup(
      createElement(AnimatedCategoryIcon, { name }),
    );
    const svg = attributes(rendered, "svg");
    expect(svg.get("viewBox")).toBe(attributes(source, "svg").get("viewBox"));
    expect(svg.get("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(svg.get("aria-hidden")).toBe("true");
    expect(svg.get("focusable")).toBe("false");
    expect(svg.has("class")).toBe(false);
    const paths = (markup: string) =>
      [...markup.matchAll(/<path\b[^>]*>/g)].map((match) => match[0]);
    const expectedPaths = paths(source);
    const actualPaths = paths(rendered);
    expect(expectedPaths).toHaveLength(name === "calligraphy" ? 2 : 1);
    expect(actualPaths).toHaveLength(expectedPaths.length);
    for (const [index, path] of expectedPaths.entries()) {
      const actual = attributes(actualPaths[index]!, "path");
      const expected = attributes(path, "path");
      for (const attribute of [
        "d",
        "fill",
        "stroke",
        "stroke-width",
        "stroke-linecap",
        "stroke-linejoin",
      ])
        expect(actual.get(attribute), attribute).toBe(expected.get(attribute));
    }
    expect(attributes(actualPaths.at(-1)!, "path").get("stroke")).toBe(
      "currentColor",
    );
    if (name === "calligraphy")
      expect(attributes(actualPaths[0]!, "path").get("fill")).toBe(
        "currentColor",
      );
  },
);
