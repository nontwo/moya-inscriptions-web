"use client";
import { useEffect } from "react";

/** Native Development sign-in/out uses a document navigation. Notify other
 * tabs without storing an identity or a credential; they recheck the Backend. */
export const CommunitySessionNotification = ({
  change,
}: {
  change: string;
}) => {
  useEffect(() => {
    try {
      window.localStorage.setItem(
        "yoyi-community-session-change",
        crypto.randomUUID(),
      );
    } catch {
      // Storage may be disabled; the existing focus refresh remains available.
    }
  }, [change]);
  return null;
};
