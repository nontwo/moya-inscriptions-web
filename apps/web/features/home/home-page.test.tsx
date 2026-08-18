import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectionMock, eventLog, loadHomeCatalogStateMock } = vi.hoisted(
  () => ({
    connectionMock: vi.fn(),
    eventLog: [] as string[],
    loadHomeCatalogStateMock: vi.fn(),
  }),
);

vi.mock("next/server", () => ({
  connection: connectionMock,
}));

vi.mock("./load-home-catalog", () => ({
  loadHomeCatalogState: loadHomeCatalogStateMock,
}));

import HomePage from "../../app/page";

import type { CatalogPage } from "@moya/contracts";
import type { HomeCatalogState } from "./catalog-state";

const emptyPage: CatalogPage = {
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  totalPages: 0,
};

beforeEach(() => {
  eventLog.length = 0;
  connectionMock.mockReset();
  loadHomeCatalogStateMock.mockReset();
  connectionMock.mockImplementation(async () => {
    eventLog.push("connection");
  });
  loadHomeCatalogStateMock.mockImplementation(async () => {
    eventLog.push("loader");
    return { state: "unexpected-error" };
  });
});

describe("formal Home page orchestration", () => {
  it.each([
    {
      state: {
        state: "populated",
        page: { ...emptyPage, total: 1, totalPages: 1 },
      },
      expectedText: "发现",
    },
    {
      state: { state: "empty", page: emptyPage },
      expectedText: "暂无公开档案",
    },
    { state: { state: "unavailable" }, expectedText: "档案服务暂时不可用" },
    {
      state: { state: "unexpected-error" },
      expectedText: "无法加载公开档案",
    },
  ] satisfies Array<{ state: HomeCatalogState; expectedText: string }>)(
    "defers the $state.state state to request time and reaches HomeScreen",
    async ({ state, expectedText }) => {
      loadHomeCatalogStateMock.mockImplementation(async () => {
        eventLog.push("loader");
        return state;
      });

      const markup = renderToStaticMarkup(await HomePage());

      expect(eventLog).toEqual(["connection", "loader"]);
      expect(connectionMock).toHaveBeenCalledOnce();
      expect(loadHomeCatalogStateMock).toHaveBeenCalledOnce();
      expect(markup).toContain(expectedText);
    },
  );
});
