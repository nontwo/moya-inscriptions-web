import { useCallback, useEffect, useRef, useState } from "react";

import {
  fetchSameOriginCatalogPage,
  parseCatalogPage,
} from "../../lib/public-api/catalog-list-client";

import type {
  CatalogKind,
  CatalogListTransportQuery,
  CatalogPage,
  CatalogSummary,
} from "@moya/contracts";
import type { HomeCatalogState } from "../home/catalog-state";
import type { CatalogPageTransportResult } from "../../lib/public-api/catalog-list";

export type CatalogPagingRequestState =
  "idle" | "loading" | "next-page-error" | "complete";

export type CatalogPagingLoader = (
  query: CatalogListTransportQuery,
  signal: AbortSignal,
) => Promise<CatalogPageTransportResult>;

interface CatalogPagingSnapshot {
  readonly items: readonly CatalogSummary[];
  readonly latestPage: CatalogPage | null;
  readonly requestState: CatalogPagingRequestState;
}

export interface CatalogPagingResult extends CatalogPagingSnapshot {
  readonly initialState: HomeCatalogState;
  readonly loadNextPage: () => Promise<void>;
}

export interface CatalogPagingOptions {
  readonly initialState: HomeCatalogState;
  readonly kind: CatalogKind;
  readonly loadPage?: CatalogPagingLoader;
}

const uniqueItems = (
  items: readonly CatalogSummary[],
): readonly CatalogSummary[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
};

const initialSnapshot = (state: HomeCatalogState): CatalogPagingSnapshot => {
  if (state.state !== "populated") {
    return {
      items: [],
      latestPage: state.state === "empty" ? state.page : null,
      requestState: "complete",
    };
  }

  return {
    items: uniqueItems(state.page.items),
    latestPage: state.page,
    requestState: state.page.page < state.page.totalPages ? "idle" : "complete",
  };
};

const appendUniqueItems = (
  current: readonly CatalogSummary[],
  next: readonly CatalogSummary[],
): readonly CatalogSummary[] => {
  const seen = new Set(current.map(({ id }) => id));
  const appended = [...current];
  for (const item of next) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    appended.push(item);
  }
  return appended;
};

const validNextPage = (
  result: CatalogPageTransportResult,
  requestedPage: number,
  kind: CatalogKind,
): CatalogPage | null => {
  if (result.state !== "success") return null;
  const page = parseCatalogPage(result.page);
  if (page === null) return null;
  if (
    page.page !== requestedPage ||
    page.pageSize !== 24 ||
    page.items.some((item) => item.kind !== kind)
  ) {
    return null;
  }
  return page;
};

export const useCatalogPaging = ({
  initialState,
  kind,
  loadPage = fetchSameOriginCatalogPage,
}: CatalogPagingOptions): CatalogPagingResult => {
  const initialStateRef = useRef(initialState);
  const kindRef = useRef(kind);
  const generationRef = useRef(0);
  const activeControllerRef = useRef<AbortController | null>(null);
  const [snapshot, setSnapshotState] = useState(() =>
    initialSnapshot(initialState),
  );
  const snapshotRef = useRef(snapshot);

  const setSnapshot = useCallback((next: CatalogPagingSnapshot) => {
    snapshotRef.current = next;
    setSnapshotState(next);
  }, []);

  useEffect(() => {
    if (initialStateRef.current === initialState && kindRef.current === kind) {
      return;
    }
    generationRef.current += 1;
    activeControllerRef.current?.abort();
    activeControllerRef.current = null;
    initialStateRef.current = initialState;
    kindRef.current = kind;
    setSnapshot(initialSnapshot(initialState));
  }, [initialState, kind, setSnapshot]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      activeControllerRef.current?.abort();
      activeControllerRef.current = null;
    },
    [],
  );

  const loadNextPage = useCallback(async () => {
    if (activeControllerRef.current !== null) return;
    const current = snapshotRef.current;
    const latestPage = current.latestPage;
    if (
      latestPage === null ||
      (current.requestState !== "idle" &&
        current.requestState !== "next-page-error") ||
      latestPage.page >= latestPage.totalPages
    ) {
      return;
    }

    const requestedPage = latestPage.page + 1;
    const controller = new AbortController();
    const generation = generationRef.current;
    activeControllerRef.current = controller;
    setSnapshot({ ...current, requestState: "loading" });

    let result: CatalogPageTransportResult;
    try {
      result = await loadPage(
        {
          kind: kindRef.current,
          page: String(requestedPage),
          pageSize: "24",
        },
        controller.signal,
      );
    } catch {
      if (controller.signal.aborted) return;
      result = { state: "unexpected-error" };
    }

    if (
      controller.signal.aborted ||
      generation !== generationRef.current ||
      activeControllerRef.current !== controller
    ) {
      return;
    }
    activeControllerRef.current = null;

    const nextPage = validNextPage(result, requestedPage, kindRef.current);
    if (nextPage === null) {
      setSnapshot({ ...current, requestState: "next-page-error" });
      return;
    }

    setSnapshot({
      items: appendUniqueItems(current.items, nextPage.items),
      latestPage: nextPage,
      requestState: nextPage.page >= nextPage.totalPages ? "complete" : "idle",
    });
  }, [loadPage, setSnapshot]);

  return {
    ...snapshot,
    initialState,
    loadNextPage,
  };
};
