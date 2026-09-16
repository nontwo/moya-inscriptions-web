"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const CommentCountContext = createContext<{
  count: number | null;
  publish: (count: number | null) => void;
} | null>(null);

export const formatCommentCount = (count: number) =>
  count > 99 ? "99+" : String(count);

/** One Detail pager owns its count; the existing discussion request supplies it. */
export const CommentCountProvider = ({ children }: { children: ReactNode }) => {
  const [count, publish] = useState<number | null>(null);
  const value = useMemo(() => ({ count, publish }), [count]);
  return (
    <CommentCountContext.Provider value={value}>
      {children}
    </CommentCountContext.Provider>
  );
};

export const usePublishCommentCount = (count: number | null) => {
  const publish = useContext(CommentCountContext)?.publish;
  useEffect(() => {
    publish?.(count);
    return () => publish?.(null);
  }, [count, publish]);
};

export const CommentCountLabel = () => {
  const count = useContext(CommentCountContext)?.count;
  return <>评论{count == null ? null : ` ${formatCommentCount(count)}`}</>;
};
