"use client";

import { useCallback, useMemo, useReducer } from "react";

import type { CatalogSummary } from "@moya/contracts";
import type {
  ContentActionAdapter,
  ContentQuickActionEnvironment,
  QuickActionEvent,
} from "../quick-actions/quick-action-types";

export interface MockUserLibraryState {
  readonly favoriteItems: readonly CatalogSummary[];
  readonly likedItems: readonly CatalogSummary[];
  readonly qaLog: readonly string[];
}

type MockUserLibraryAction =
  | { readonly item: CatalogSummary; readonly type: "favorite" | "like" }
  | { readonly item: CatalogSummary; readonly type: "unfavorite" | "unlike" }
  | { readonly message: string; readonly type: "log" };

export const emptyMockUserLibraryState: MockUserLibraryState = {
  favoriteItems: [],
  likedItems: [],
  qaLog: [],
};

const addUnique = (
  items: readonly CatalogSummary[],
  item: CatalogSummary,
): readonly CatalogSummary[] =>
  items.some(({ id }) => id === item.id) ? items : [...items, item];

const removeById = (
  items: readonly CatalogSummary[],
  item: CatalogSummary,
): readonly CatalogSummary[] => items.filter(({ id }) => id !== item.id);

export const reduceMockUserLibrary = (
  state: MockUserLibraryState,
  action: MockUserLibraryAction,
): MockUserLibraryState => {
  switch (action.type) {
    case "favorite":
      return {
        ...state,
        favoriteItems: addUnique(state.favoriteItems, action.item),
      };
    case "like":
      return { ...state, likedItems: addUnique(state.likedItems, action.item) };
    case "unfavorite":
      return {
        ...state,
        favoriteItems: removeById(state.favoriteItems, action.item),
      };
    case "unlike":
      return {
        ...state,
        likedItems: removeById(state.likedItems, action.item),
      };
    case "log":
      return { ...state, qaLog: [action.message, ...state.qaLog].slice(0, 24) };
  }
};

export const formatQuickActionEvent = (event: QuickActionEvent): string => {
  const action = event.action === undefined ? "" : ` ${event.action}`;
  const eventName = event.type === "opened" ? "longpress open" : event.type;
  return `[quick-action] ${eventName}${action} ${event.contentId}`;
};

export const useMockContentActionStore = () => {
  const [state, dispatch] = useReducer(
    reduceMockUserLibrary,
    emptyMockUserLibraryState,
  );
  const adapter = useMemo<ContentActionAdapter>(
    () => ({
      favorite: (item) => dispatch({ item, type: "favorite" }),
      like: (item) => dispatch({ item, type: "like" }),
      share: () => undefined,
      unfavorite: (item) => dispatch({ item, type: "unfavorite" }),
      unlike: (item) => dispatch({ item, type: "unlike" }),
    }),
    [],
  );
  const onEvent = useCallback(
    (event: QuickActionEvent) =>
      dispatch({ message: formatQuickActionEvent(event), type: "log" }),
    [],
  );
  const environment = useMemo<ContentQuickActionEnvironment>(
    () => ({
      adapter,
      favoriteIds: state.favoriteItems.map(({ id }) => id),
      likedIds: state.likedItems.map(({ id }) => id),
      onEvent,
    }),
    [adapter, onEvent, state.favoriteItems, state.likedItems],
  );

  return { environment, onEvent, state } as const;
};
