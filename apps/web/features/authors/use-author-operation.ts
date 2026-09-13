"use client";
import { useEffect, useRef } from "react";
import { authorClient } from "./author-data";
import { useAuthors } from "./author-context";

/** Multi-step private edits must never continue under a later signed-in account. */
export const useAuthorOperation = () => {
  const { viewer } = useAuthors();
  const identity = viewer?.id ?? null;
  const latest = useRef(identity);
  latest.current = identity;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const current = () =>
    mounted.current &&
    identity !== null &&
    latest.current === identity &&
    authorClient.account() === identity;
  const run = async <T>(operation: () => Promise<T>): Promise<T> => {
    if (!current()) throw Error("账户状态已变化，请重新打开编辑器");
    const result = await operation();
    if (!current()) throw Error("账户状态已变化，请重新打开编辑器");
    return result;
  };
  return { run, current };
};
