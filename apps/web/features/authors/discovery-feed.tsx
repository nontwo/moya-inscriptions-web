"use client";
import { useEffect, useRef, useState } from "react";
import type {
  ContentCard as Card,
  DiscoveryPage,
  InscriptionFilters,
  InscriptionFilterOptions,
} from "@moya/contracts";
import { authorClient, AuthorRequestError } from "./author-data";
import { useAuthors } from "./author-context";
import { ContentCard } from "./content-card";
import { useProductShell } from "../product-shell/product-shell";
import { HomeScreen } from "../home/home-screen";
import type { HomeSurfaceData, HomeFeed } from "../home/home-feed";
import { CatalogMasonry } from "../home/catalog-masonry";
import { CatalogSearchNavigationAction } from "../search/catalog-search";
const emptyFilters: InscriptionFilters = {
  dynasty: [],
  textAuthor: [],
  calligrapher: [],
  originalRegion: [],
  script: [],
};
interface Snapshot {
  items: Card[];
  cursor: DiscoveryPage | null;
  filters: InscriptionFilters;
  search: string;
}
export const AuthorTrigger = () => {
  const author = useAuthors(),
    shell = useProductShell();
  return (
    <button
      type="button"
      className="phase4-avatar"
      aria-label="打开个人主页"
      disabled={author.checking}
      onClick={(e) => shell.openProfile(null, e.currentTarget)}
    >
      {author.avatarSrc ? (
        <img src={author.avatarSrc} alt="" />
      ) : (
        (author.viewer?.displayName.slice(0, 1) ?? "访")
      )}
    </button>
  );
};
export const DiscoveryHome = ({
  data,
  initialFeed,
}: {
  data: HomeSurfaceData;
  initialFeed: HomeFeed;
}) => (
  <HomeScreen
    data={data}
    initialFeed={initialFeed}
    headerStart={<CatalogSearchNavigationAction />}
    headerEnd={<AuthorTrigger />}
    renderDiscover={(active) => <DiscoveryFeed kind="all" active={active} />}
  />
);
export const FilteredInscriptions = () => {
  const shell = useProductShell();
  return (
    <div>
      <header className="phase4-topbar">
        <CatalogSearchNavigationAction />
        <strong>碑刻</strong>
        <AuthorTrigger />
      </header>
      <div className="phase4-page">
        <DiscoveryFeed
          kind="inscription"
          active={shell.activeDestination === "inscriptions"}
        />
      </div>
    </div>
  );
};
const ScopedDiscoveryFeed = ({
  kind,
  active,
}: {
  kind: "all" | "inscription";
  active: boolean;
}) => {
  const author = useAuthors(),
    shell = useProductShell(),
    key = `discovery:${author.viewer?.id ?? "guest"}:${kind}`;
  const [snapshot, setSnapshot] = useState<Snapshot>(
      () =>
        (author.cache.get(key) as Snapshot | undefined) ?? {
          items: [],
          cursor: null,
          filters: emptyFilters,
          search: "",
        },
    ),
    [draftFilters, setDraftFilters] = useState(snapshot.filters),
    [search, setSearch] = useState(snapshot.search),
    [options, setOptions] = useState<InscriptionFilterOptions | null>(null),
    [optionsError, setOptionsError] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [restart, setRestart] = useState(false);
  const state = useRef(snapshot),
    loading = useRef(false),
    epoch = useRef(0),
    sentinel = useRef<HTMLDivElement>(null),
    failed = useRef<{ reset: boolean } | null>(null);
  state.current = snapshot;
  useEffect(() => {
    author.cache.set(key, snapshot);
  }, [key, snapshot, author.cache]);
  const load = async (reset = false) => {
    if (loading.current) return;
    loading.current = true;
    const run = ++epoch.current;
    setBusy(true);
    setError("");
    const current = state.current;
    try {
      const result = await authorClient.discovery({
        kind,
        pageSize: 12,
        filters: current.filters,
        search: current.search,
        after: reset ? 0 : (current.cursor?.nextAfter ?? 0),
        ...(!reset && current.cursor
          ? { sequence: current.cursor.sequence }
          : {}),
      });
      if (run !== epoch.current) return;
      setSnapshot((old) => ({
        ...old,
        items: reset ? result.items : [...old.items, ...result.items],
        cursor: result,
      }));
      failed.current = null;
      setRestart(false);
    } catch (e) {
      if (run === epoch.current) {
        setRestart(e instanceof AuthorRequestError && e.status === 409);
        setError(e instanceof Error ? e.message : "内容加载失败");
        failed.current = { reset };
      }
    } finally {
      if (run === epoch.current) {
        loading.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    setSnapshot(
      (author.cache.get(key) as Snapshot | undefined) ?? {
        items: [],
        cursor: null,
        filters: emptyFilters,
        search: "",
      },
    );
    return () => {
      epoch.current++;
      loading.current = false;
    };
  }, [key]);
  useEffect(() => {
    if (
      !author.checking &&
      active &&
      !state.current.cursor &&
      !loading.current &&
      !error
    )
      void load();
  }, [active, author.checking, key, error]);
  const readFilters = () =>
    authorClient
      .filters()
      .then((value) => {
        setOptions(value);
        setOptionsError(false);
      })
      .catch(() => setOptionsError(true));
  useEffect(() => {
    if (kind === "inscription") void readFilters();
  }, [kind]);
  useEffect(() => {
    if (
      !sentinel.current ||
      !active ||
      shell.activeContent ||
      shell.activeProfile ||
      busy ||
      error ||
      !snapshot.cursor?.hasMore
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((i) => i.isIntersecting)) void load();
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [
    active,
    shell.activeContent,
    shell.activeProfile,
    busy,
    error,
    snapshot.cursor,
  ]);
  useEffect(() => {
    if (
      !active ||
      author.checking ||
      shell.activeContent ||
      shell.activeProfile ||
      loading.current ||
      !state.current.items.length
    )
      return;
    const run = epoch.current;
    let cancelled = false;
    const revalidate = async () => {
      const original = state.current.items;
      const cards = new Map<string, Card>();
      try {
        for (let offset = 0; offset < original.length; offset += 12) {
          if (cancelled || run !== epoch.current) return;
          const batch = await Promise.all(
            original.slice(offset, offset + 12).map((i) =>
              authorClient.card(i.target).catch((e) => {
                if (e instanceof AuthorRequestError && e.status === 404)
                  return null;
                throw e;
              }),
            ),
          );
          for (const item of batch)
            if (item) cards.set(`${item.target.type}:${item.target.id}`, item);
        }
        if (!cancelled && run === epoch.current)
          setSnapshot((old) => ({
            ...old,
            items: old.items.flatMap((item) => {
              const key = `${item.target.type}:${item.target.id}`;
              return original.some(
                (i) =>
                  i.target.type === item.target.type &&
                  i.target.id === item.target.id,
              )
                ? cards.has(key)
                  ? [cards.get(key)!]
                  : []
                : [item];
            }),
          }));
      } catch {
        /* Uncertain network state never withdraws cached content. */
      }
    };
    void revalidate();
    return () => {
      cancelled = true;
    };
  }, [
    active,
    author.checking,
    author.revision,
    shell.activeContent,
    shell.activeProfile,
  ]);
  const labels = {
    dynasty: "朝代",
    textAuthor: "撰文者",
    calligrapher: "书者",
    originalRegion: "原刻地区",
    script: "书体",
  } as const;
  return (
    <section aria-label={kind === "all" ? "发现内容" : "碑刻筛选结果"}>
      {kind === "inscription" && (
        <details data-inscription-filter="">
          <summary className="phase4-button">筛选碑刻</summary>
          {optionsError && (
            <p role="alert">
              筛选数据暂时无法读取{" "}
              <button
                className="phase4-button"
                onClick={() => void readFilters()}
              >
                重试读取筛选项
              </button>
            </p>
          )}
          {options &&
            Object.values(options).every(
              (d) =>
                d.values.length === 0 && d.unknown === 0 && d.unsupplied === 0,
            ) && <p>暂无可供筛选的碑刻数据</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (busy) return;
              state.current = {
                ...state.current,
                filters: draftFilters,
                search: search.trim(),
              };
              setSnapshot(state.current);
              void load(true);
            }}
          >
            <div className="phase4-filters">
              {(Object.keys(labels) as (keyof InscriptionFilters)[]).map(
                (dimension) => (
                  <fieldset key={dimension}>
                    <legend>{labels[dimension]}</legend>
                    {[
                      ...(options?.[dimension].values ?? []),
                      "@unknown",
                      "@unsupplied",
                    ].map((value) => (
                      <label key={value}>
                        <input
                          type="checkbox"
                          checked={draftFilters[dimension].includes(value)}
                          onChange={(e) =>
                            setDraftFilters((old) => ({
                              ...old,
                              [dimension]: e.target.checked
                                ? [...old[dimension], value]
                                : old[dimension].filter((v) => v !== value),
                            }))
                          }
                        />
                        {value === "@unknown"
                          ? "未知"
                          : value === "@unsupplied"
                            ? "未提供"
                            : value}
                      </label>
                    ))}
                  </fieldset>
                ),
              )}
            </div>
            <label>
              标题或别名
              <input
                value={search}
                maxLength={200}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="phase4-actions">
              <button type="submit" disabled={busy}>
                应用筛选
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setDraftFilters(emptyFilters);
                  setSearch("");
                  state.current = {
                    ...state.current,
                    filters: emptyFilters,
                    search: "",
                  };
                  setSnapshot(state.current);
                  void load(true);
                }}
              >
                清除筛选
              </button>
            </div>
            <p className="phase4-muted">
              同一项可多选，不同项同时满足；原刻地区与现藏地不同。
            </p>
          </form>
        </details>
      )}
      <CatalogMasonry
        items={snapshot.items}
        getKey={(i) => `${i.target.type}:${i.target.id}`}
        isFullSpan={(i) => !!i.media && i.media.width / i.media.height >= 2.4}
        feedLayout={shell.feedLayout}
        platform={shell.platform}
        renderItem={(item, onMediaSettled) => (
          <ContentCard item={item} onMediaSettled={onMediaSettled} />
        )}
      />
      {!busy && !error && snapshot.cursor && !snapshot.items.length && (
        <p role="status">没有符合条件的内容</p>
      )}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button
            className="phase4-button"
            onClick={() => void load(restart || failed.current?.reset || false)}
          >
            {restart ? "重新加载内容（顺序将更新）" : "重试"}
          </button>
        </div>
      )}
      <div ref={sentinel} className="phase4-load">
        {busy ? (
          <span role="status">正在加载…</span>
        ) : snapshot.cursor?.hasMore ? (
          <button className="phase4-button" onClick={() => void load()}>
            加载更多
          </button>
        ) : null}
      </div>
    </section>
  );
};

export const DiscoveryFeed = ({
  kind,
  active,
}: {
  kind: "all" | "inscription";
  active: boolean;
}) => {
  const author = useAuthors();
  return (
    <ScopedDiscoveryFeed
      key={`${author.viewer?.id ?? "guest"}:${kind}`}
      kind={kind}
      active={active}
    />
  );
};
