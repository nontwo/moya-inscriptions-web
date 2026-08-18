import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import ErrorBoundary from "./error";
import Loading from "./loading";

describe("root route lifecycle states", () => {
  it("renders a branded loading state without technical details", () => {
    const markup = renderToStaticMarkup(<Loading />);

    expect(markup).toContain("摩崖碑刻数字档案");
    expect(markup).toContain("正在加载公开档案");
    expect(markup).not.toMatch(/stack|database|MOYA_PUBLIC_API_BASE_URL/i);
  });

  it("renders a reset action without exposing an exception", () => {
    const markup = renderToStaticMarkup(<ErrorBoundary reset={vi.fn()} />);

    expect(markup).toContain("页面暂时无法显示");
    expect(markup).toContain("重新加载");
    expect(markup).not.toMatch(/stack|database|exception|response body/i);
  });
});
