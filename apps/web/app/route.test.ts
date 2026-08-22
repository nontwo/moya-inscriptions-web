import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogPage } from "@moya/contracts";
import type { HomeCatalogState } from "../features/home/catalog-state";

const { connectionMock } = vi.hoisted(() => ({
  connectionMock: vi.fn(),
}));

const { loadHomeCatalogStateMock } = vi.hoisted(() => ({
  loadHomeCatalogStateMock: vi.fn(),
}));

const { readT02DocumentMock } = vi.hoisted(() => ({
  readT02DocumentMock: vi.fn(),
}));

vi.mock("next/server", () => ({
  connection: connectionMock,
}));

vi.mock("../features/home/load-home-catalog", () => ({
  loadHomeCatalogState: loadHomeCatalogStateMock,
}));

vi.mock("../lib/t02-static-files", () => ({
  methodNotAllowed: vi.fn(),
  readT02Document: readT02DocumentMock,
}));

import { GET, HEAD } from "./route";

type QueryKey = "discover" | "inscription" | "calligraphy";

const page = (title: string) =>
  ({
    items: [
      {
        id: title.toLowerCase(),
        kind: "inscription",
        title,
        aliases: [],
        summary: `${title}摘要`,
        periodLabel: "唐",
      } as unknown as CatalogPage["items"][number],
    ],
    page: 1,
    pageSize: 20,
    total: 1,
    totalPages: 1,
  }) as CatalogPage;

const populated = (title: string): HomeCatalogState => ({
  state: "populated",
  page: page(title),
});

const empty = (title = "Demo"): HomeCatalogState => ({
  state: "empty",
  page: page(title),
});

const unavailable: HomeCatalogState = { state: "unavailable" };
const unexpectedError: HomeCatalogState = { state: "unexpected-error" };

const resolveItems = (state: HomeCatalogState) =>
  state.state === "populated"
    ? state.page.items.map(
        ({ id, kind, title, periodLabel, representativeMedia }) => ({
          id,
          kind,
          title,
          ...(periodLabel === undefined ? {} : { periodLabel }),
          ...(representativeMedia === undefined ? {} : { representativeMedia }),
        }),
      )
    : [];

const toBrowseArgs = (states: Record<QueryKey, HomeCatalogState>) => ({
  calligraphy: resolveItems(states.calligraphy),
  discover: resolveItems(states.discover),
  inscriptions: resolveItems(states.inscription),
});

const createDeferred = () => {
  let resolve!: (value: HomeCatalogState) => void;
  const promise = new Promise<HomeCatalogState>((resolver) => {
    resolve = resolver;
  });
  return { promise, resolve };
};

beforeEach(() => {
  connectionMock.mockReset();
  loadHomeCatalogStateMock.mockReset();
  readT02DocumentMock.mockReset();
  connectionMock.mockResolvedValue(undefined);
  readT02DocumentMock.mockResolvedValue(new Response("ok"));
});

describe("T07 browse runtime composition", () => {
  it("loads discover, inscription, and calligraphy in parallel after connection", async () => {
    const deferreds: Record<QueryKey, ReturnType<typeof createDeferred>> = {
      calligraphy: createDeferred(),
      discover: createDeferred(),
      inscription: createDeferred(),
    };

    loadHomeCatalogStateMock.mockImplementation(
      (query?: { kind?: "inscription" | "calligraphy" }) => {
        const key: QueryKey =
          query?.kind === "inscription"
            ? "inscription"
            : query?.kind === "calligraphy"
              ? "calligraphy"
              : "discover";
        return deferreds[key].promise;
      },
    );

    const responsePromise = GET();
    await Promise.resolve();

    expect(connectionMock).toHaveBeenCalledOnce();
    expect(loadHomeCatalogStateMock).toHaveBeenCalledTimes(3);
    expect(loadHomeCatalogStateMock.mock.calls[0]).toEqual([]);
    expect(loadHomeCatalogStateMock.mock.calls[1]).toEqual([
      { kind: "inscription" },
    ]);
    expect(loadHomeCatalogStateMock.mock.calls[2]).toEqual([
      { kind: "calligraphy" },
    ]);
    expect(readT02DocumentMock).not.toHaveBeenCalled();

    deferreds.calligraphy.resolve(populated("书帖真实"));
    deferreds.inscription.resolve(populated("碑刻真实"));
    deferreds.discover.resolve(populated("发现真实"));

    await responsePromise;

    expect(readT02DocumentMock).toHaveBeenCalledOnce();
    expect(readT02DocumentMock).toHaveBeenCalledWith(
      "GET",
      toBrowseArgs({
        discover: populated("发现真实"),
        inscription: populated("碑刻真实"),
        calligraphy: populated("书帖真实"),
      }),
      "formal-root",
    );
    const browseItems = readT02DocumentMock.mock.calls[0]?.[1];
    for (const item of Object.values(browseItems ?? {}).flat()) {
      expect(item).not.toHaveProperty("aliases");
      expect(item).not.toHaveProperty("summary");
    }
  });

  it.each([unavailable, unexpectedError, empty()])(
    "keeps inscription QA records untouched when inscription browse load is %s",
    async (inscriptionState) => {
      loadHomeCatalogStateMock.mockImplementation(
        (query?: { kind?: "inscription" | "calligraphy" }) => {
          if (query?.kind === "inscription")
            return Promise.resolve(inscriptionState);
          if (query?.kind === "calligraphy")
            return Promise.resolve(populated("书帖真实"));
          return Promise.resolve(populated("发现真实"));
        },
      );

      await GET();

      expect(readT02DocumentMock).toHaveBeenCalledWith(
        "GET",
        toBrowseArgs({
          discover: populated("发现真实"),
          inscription: inscriptionState,
          calligraphy: populated("书帖真实"),
        }),
        "formal-root",
      );
    },
  );

  it.each([unavailable, unexpectedError, empty()])(
    "keeps calligraphy QA records untouched when calligraphy browse load is %s",
    async (calligraphyState) => {
      loadHomeCatalogStateMock.mockImplementation(
        (query?: { kind?: "inscription" | "calligraphy" }) => {
          if (query?.kind === "inscription")
            return Promise.resolve(populated("碑刻真实"));
          if (query?.kind === "calligraphy")
            return Promise.resolve(calligraphyState);
          return Promise.resolve(populated("发现真实"));
        },
      );

      await GET();

      expect(readT02DocumentMock).toHaveBeenCalledWith(
        "GET",
        toBrowseArgs({
          discover: populated("发现真实"),
          inscription: populated("碑刻真实"),
          calligraphy: calligraphyState,
        }),
        "formal-root",
      );
    },
  );

  it("keeps both browse QA surfaces canonical when both browse loads fail", async () => {
    loadHomeCatalogStateMock.mockImplementation(
      (query?: { kind?: "inscription" | "calligraphy" }) => {
        if (query?.kind === "inscription") return Promise.resolve(unavailable);
        if (query?.kind === "calligraphy")
          return Promise.resolve(unexpectedError);
        return Promise.resolve(populated("发现真实"));
      },
    );

    await GET();

    expect(readT02DocumentMock).toHaveBeenCalledWith(
      "GET",
      toBrowseArgs({
        discover: populated("发现真实"),
        inscription: unavailable,
        calligraphy: unexpectedError,
      }),
      "formal-root",
    );
  });

  it("uses formal-root composition for HEAD", async () => {
    await HEAD();

    expect(readT02DocumentMock).toHaveBeenCalledWith("HEAD", {}, "formal-root");
  });
});
