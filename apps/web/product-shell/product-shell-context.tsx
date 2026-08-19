"use client";

import { createContext, useContext } from "react";

import type { CatalogSummary } from "@moya/contracts";

export interface ProductShellActions {
  readonly openRealCatalogSummary: (summary: CatalogSummary) => void;
}

const ProductShellContext = createContext<ProductShellActions | undefined>(
  undefined,
);

export const ProductShellActionsProvider = ProductShellContext.Provider;

export const useProductShellActions = (): ProductShellActions => {
  const value = useContext(ProductShellContext);
  if (value === undefined) {
    throw new Error("ProductShell actions require ProductShell context");
  }
  return value;
};
