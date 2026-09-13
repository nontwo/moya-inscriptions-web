"use client";
import { useEffect, useRef, useState } from "react";
import { authorClient, AuthorRequestError } from "./author-data";
import { useProductShell } from "../product-shell/product-shell";
type Page = Awaited<ReturnType<typeof authorClient.people>>;
export const PeopleList = ({
  id,
  list,
  revision,
}: {
  id: string;
  list: "following" | "followers";
  revision: number;
}) => {
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const epoch = useRef(0),
    snapshot = useRef<Page | null>(null),
    loading = useRef(false);
  const identity = useRef(`${id}:${list}`);
  const failed = useRef<{ page: number; through: number } | null>(null);
  const shell = useProductShell();
  const load = async (n = 1, through = n) => {
    const run = ++epoch.current;
    loading.current = true;
    setBusy(true);
    setError("");
    try {
      const items: Page["items"][number][] = [];
      let result: Page | null = null;
      for (let current = n; current <= through; current++) {
        result = await authorClient.people(id, list, current);
        if (run !== epoch.current) return;
        items.push(...result.items);
      }
      if (!result) return;
      const next = {
        ...result,
        items: [
          ...new Map(
            [...(n === 1 ? [] : (snapshot.current?.items ?? [])), ...items].map(
              (p) => [p.id, p],
            ),
          ).values(),
        ],
      };
      snapshot.current = next;
      setPage(next);
      failed.current = null;
    } catch (e) {
      if (run !== epoch.current) return;
      if (
        e instanceof AuthorRequestError &&
        [401, 403, 404].includes(e.status)
      ) {
        snapshot.current = null;
        setPage(null);
      }
      failed.current = { page: n, through };
      setError(e instanceof Error ? e.message : "无法读取列表");
    } finally {
      if (run === epoch.current) {
        loading.current = false;
        setBusy(false);
      }
    }
  };
  useEffect(() => {
    if (identity.current !== `${id}:${list}`) {
      identity.current = `${id}:${list}`;
      snapshot.current = null;
      setPage(null);
    }
    void load(1, Math.max(1, snapshot.current?.page ?? 1));
    return () => {
      epoch.current++;
      loading.current = false;
    };
  }, [id, list, revision]);
  return (
    <div
      style={{ maxHeight: 160, overflow: "auto" }}
      aria-busy={busy}
      aria-label={list === "following" ? "关注列表" : "粉丝列表"}
    >
      {page?.items.map((p) => (
        <button
          className="phase4-button"
          type="button"
          key={p.id}
          onClick={(e) => shell.openProfile(p.id, e.currentTarget)}
        >
          {p.displayName} · @{p.handle}
        </button>
      ))}
      {page && page.items.length < page.total && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!loading.current) void load(page.page + 1);
          }}
        >
          加载更多
        </button>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const request = failed.current;
              if (request && !loading.current)
                void load(request.page, request.through);
            }}
          >
            重试
          </button>
        </p>
      )}
    </div>
  );
};
