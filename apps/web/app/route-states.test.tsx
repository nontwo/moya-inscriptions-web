import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import Loading from "./loading";

describe("formal route loading", () => {
  it("uses the exact approved T02 branded loading state", () => {
    const markup = renderToStaticMarkup(<Loading />);

    expect(markup).toContain('role="status"');
    expect(markup).toContain('aria-label="由艺正在加载"');
    expect(markup).toContain('class="yoyi-logo"');
    expect(markup).toContain("志于道，据于德，依于仁，游于艺");
    expect(markup).not.toMatch(/Hero|公开档案|营销/);
  });
});
