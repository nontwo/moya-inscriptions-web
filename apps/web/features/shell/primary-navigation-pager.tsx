"use client";

import type { ReactNode } from "react";

import { PrimaryShell } from "./primary-shell";

import type { PresentationPlatform } from "./device-platform";
import type { PrimaryDestination } from "./primary-shell";

const primaryDestinationItems = [
  { id: "home", label: "首页" },
  { id: "inscriptions", label: "碑刻" },
  { id: "calligraphy", label: "书帖" },
] as const satisfies readonly {
  readonly id: PrimaryDestination;
  readonly label: string;
}[];

export type PrimaryDestinationDirection = "previous" | "next";

export const resolveAdjacentPrimaryDestination = (
  activeDestination: PrimaryDestination,
  direction: PrimaryDestinationDirection,
): PrimaryDestination | null => {
  const activeIndex = primaryDestinationItems.findIndex(
    ({ id }) => id === activeDestination,
  );
  const targetIndex = activeIndex + (direction === "previous" ? -1 : 1);

  return primaryDestinationItems[targetIndex]?.id ?? null;
};

export interface PrimaryNavigationPagerProps {
  readonly activeDestination: PrimaryDestination;
  readonly platform: PresentationPlatform;
  readonly onDestinationChange: (destination: PrimaryDestination) => void;
  readonly home: ReactNode;
  readonly inscriptions: ReactNode;
  readonly calligraphy: ReactNode;
}

export const PrimaryNavigationPager = ({
  activeDestination,
  platform,
  onDestinationChange,
  home,
  inscriptions,
  calligraphy,
}: PrimaryNavigationPagerProps) => {
  const previousDestination = resolveAdjacentPrimaryDestination(
    activeDestination,
    "previous",
  );
  const nextDestination = resolveAdjacentPrimaryDestination(
    activeDestination,
    "next",
  );

  return (
    <div
      data-primary-navigation-pager=""
      data-active-destination={activeDestination}
    >
      <PrimaryShell
        activeDestination={activeDestination}
        platform={platform}
        home={home}
        inscriptions={inscriptions}
        calligraphy={calligraphy}
      />

      <nav aria-label="主要内容" data-primary-navigation="">
        {primaryDestinationItems.map(({ id, label }) => {
          const selected = id === activeDestination;

          return (
            <button
              key={id}
              type="button"
              aria-current={selected ? "page" : undefined}
              data-primary-navigation-destination={id}
              data-selected={selected ? "true" : "false"}
              onClick={() => onDestinationChange(id)}
            >
              {label}
            </button>
          );
        })}
      </nav>

      <div aria-label="主要内容分页" data-primary-pager="" role="group">
        <button
          type="button"
          data-primary-pager-action="previous"
          data-target-destination={previousDestination ?? undefined}
          disabled={previousDestination === null}
          onClick={() => {
            if (previousDestination !== null) {
              onDestinationChange(previousDestination);
            }
          }}
        >
          上一页
        </button>
        <button
          type="button"
          data-primary-pager-action="next"
          data-target-destination={nextDestination ?? undefined}
          disabled={nextDestination === null}
          onClick={() => {
            if (nextDestination !== null) {
              onDestinationChange(nextDestination);
            }
          }}
        >
          下一页
        </button>
      </div>
    </div>
  );
};
