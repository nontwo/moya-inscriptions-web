import type { ReactNode } from "react";

import type { PresentationPlatform } from "./device-platform";

export type PrimaryDestination = "home" | "discussion" | "user";

export interface PrimaryShellProps {
  readonly activeDestination: PrimaryDestination;
  readonly platform: PresentationPlatform;
  readonly home: ReactNode;
  readonly discussion: ReactNode;
  readonly user: ReactNode;
}

export const PrimaryShell = ({
  activeDestination,
  platform,
  home,
  discussion,
  user,
}: PrimaryShellProps) => (
  <div
    data-primary-shell=""
    data-active-destination={activeDestination}
    data-platform={platform}
  >
    <section
      data-primary-destination="home"
      data-active={activeDestination === "home" ? "true" : "false"}
      hidden={activeDestination !== "home"}
    >
      {home}
    </section>
    <section
      data-primary-destination="discussion"
      data-active={activeDestination === "discussion" ? "true" : "false"}
      hidden={activeDestination !== "discussion"}
    >
      {discussion}
    </section>
    <section
      data-primary-destination="user"
      data-active={activeDestination === "user" ? "true" : "false"}
      hidden={activeDestination !== "user"}
    >
      {user}
    </section>
  </div>
);
