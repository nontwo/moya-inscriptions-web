"use client";

import { createContext, useContext } from "react";

import type { ReactNode } from "react";
import type { ContentQuickActionEnvironment } from "./quick-action-types";

const Context = createContext<ContentQuickActionEnvironment | null>(null);

export const ContentQuickActionsProvider = ({
  environment,
  children,
}: {
  readonly environment: ContentQuickActionEnvironment | undefined;
  readonly children: ReactNode;
}) => <Context value={environment ?? null}>{children}</Context>;

export const useContentQuickActions = () => useContext(Context);
