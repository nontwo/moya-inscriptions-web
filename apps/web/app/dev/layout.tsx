import type { ReactNode } from "react";

import { AgentationPilot } from "../../features/dev-pilot/agentation-pilot";
import { resolveAgentationPilotSurface } from "../../features/dev-pilot/agentation-pilot-surface";

/**
 * Every `/dev/*` route keeps its own Development gate and markup. This layout
 * adds nothing unless the opt-in Agentation pilot resolves; a Production build
 * renders the children alone.
 */
export default function DevelopmentLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const pilot = resolveAgentationPilotSurface();
  return (
    <>
      {children}
      {pilot === null ? null : <AgentationPilot endpoint={pilot.endpoint} />}
    </>
  );
}
