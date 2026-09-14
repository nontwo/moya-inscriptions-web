"use client";

import { createContext, useContext } from "react";

/** What the Detail says once its content is no longer offered here. */
export interface CatalogDetailWithdrawalNotice {
  readonly title: string;
  readonly description: string;
}

/**
 * Replaces the open Detail's media, actions and discussion with a neutral
 * notice (e.g. after the author moved the work to the recycle bin). Scoped to
 * the given content id, so a later Detail is never affected.
 */
export type WithdrawCatalogDetail = (
  id: string,
  notice: CatalogDetailWithdrawalNotice,
) => void;

export const CatalogDetailWithdrawalContext =
  createContext<WithdrawCatalogDetail | null>(null);

/** Null outside a Detail experience (e.g. a static preview). */
export const useCatalogDetailWithdrawal = (): WithdrawCatalogDetail | null =>
  useContext(CatalogDetailWithdrawalContext);
