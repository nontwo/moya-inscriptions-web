"use client";

import { createContext, useContext } from "react";

import type { ContentQuickActionEnvironment } from "./quick-action-types";
import type { ReactNode } from "react";

const ContentQuickActionsContext =
  createContext<ContentQuickActionEnvironment | null>(null);

export const ContentQuickActionsProvider = ({
  children,
  environment,
}: {
  readonly children: ReactNode;
  readonly environment: ContentQuickActionEnvironment;
}) => (
  <ContentQuickActionsContext value={environment}>
    {children}
  </ContentQuickActionsContext>
);

export const useContentQuickActions = () =>
  useContext(ContentQuickActionsContext);
