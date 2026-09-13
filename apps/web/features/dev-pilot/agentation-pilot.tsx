"use client";

import dynamic from "next/dynamic";

/**
 * Development-only visual feedback toolbar. Loaded lazily on the client so the
 * dependency never enters a server bundle, and rendered only when the server
 * layout resolved a loopback endpoint. Clipboard writing stays off: the
 * `agentation-mcp` server is the single sink, and an agent reads from it.
 */
const Agentation = dynamic(
  () => import("agentation").then((module) => module.Agentation),
  { ssr: false },
);

export function AgentationPilot({ endpoint }: { readonly endpoint: string }) {
  return <Agentation copyToClipboard={false} endpoint={endpoint} />;
}
