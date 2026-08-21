import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import CatalogDetailLoading from "./loading";

describe("CatalogDetailLoading", () => {
  it("retains the Detail shell and three-line T02 skeleton", () => {
    const markup = renderToStaticMarkup(<CatalogDetailLoading />);

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('aria-hidden="true"');
    expect((markup.match(/_loadingLine_/g) ?? []).length).toBe(3);
  });
});
