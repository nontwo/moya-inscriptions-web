import type { ReactNode } from "react";

import type { PresentationPlatform } from "./device-platform";

export type PrimaryDestination = "home" | "inscriptions" | "calligraphy";

export interface PrimaryShellProps {
  readonly activeDestination: PrimaryDestination;
  readonly platform: PresentationPlatform;
  readonly home: ReactNode;
  readonly inscriptions: ReactNode;
  readonly calligraphy: ReactNode;
}

export const PrimaryShell = ({
  activeDestination,
  platform,
  home,
  inscriptions,
  calligraphy,
}: PrimaryShellProps) => (
  <div
    data-primary-shell=""
    data-active-destination={activeDestination}
    data-platform={platform}
  >
    <section
      data-primary-destination="home"
      data-active={activeDestination === "home" ? "true" : "false"}
    >
      {home}
    </section>
    <section
      data-primary-destination="inscriptions"
      data-active={activeDestination === "inscriptions" ? "true" : "false"}
    >
      {inscriptions}
    </section>
    <section
      data-primary-destination="calligraphy"
      data-active={activeDestination === "calligraphy" ? "true" : "false"}
    >
      {calligraphy}
    </section>
  </div>
);
