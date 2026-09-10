"use client";

import { createContext, useContext } from "react";

import type { ReactNode } from "react";

const CommentComposerPortalContext = createContext<HTMLElement | null>(null);

export const CommentComposerPortalProvider = ({
  children,
  target,
}: {
  readonly children: ReactNode;
  readonly target: HTMLElement | null;
}) => (
  <CommentComposerPortalContext.Provider value={target}>
    {children}
  </CommentComposerPortalContext.Provider>
);

export const useCommentComposerPortalTarget = () =>
  useContext(CommentComposerPortalContext);
