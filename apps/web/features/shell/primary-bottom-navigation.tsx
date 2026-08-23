"use client";

import type { CSSProperties } from "react";

import { FixedLabelMark, Icon } from "@moya/ui";

import "@moya/design-tokens/theme.css";
import "@moya/ui/styles.css";

import styles from "./primary-bottom-navigation.module.css";

import type { PresentationPlatform } from "./device-platform";
import type { PrimaryDestination } from "./primary-shell";
import type { FixedLabelName, IconName } from "@moya/ui";

interface PrimaryNavigationItem {
  readonly id: PrimaryDestination;
  readonly label: string;
  readonly icon: IconName;
  readonly labelMark: FixedLabelName;
}

const primaryNavigationItems = [
  {
    id: "home",
    label: "首页",
    icon: "home",
    labelMark: "nav-home",
  },
  {
    id: "inscriptions",
    label: "碑刻",
    icon: "inscriptions",
    labelMark: "nav-inscriptions",
  },
  {
    id: "calligraphy",
    label: "书帖",
    icon: "calligraphy",
    labelMark: "nav-calligraphy",
  },
] as const satisfies readonly PrimaryNavigationItem[];

type PrimaryNavigationStyle = CSSProperties & {
  readonly "--primary-navigation-active-index": number;
  readonly "--primary-navigation-item-count": number;
};

export interface PrimaryBottomNavigationProps {
  readonly activeDestination: PrimaryDestination;
  readonly platform: PresentationPlatform;
  readonly onDestinationChange: (destination: PrimaryDestination) => void;
}

export const PrimaryBottomNavigation = ({
  activeDestination,
  platform,
  onDestinationChange,
}: PrimaryBottomNavigationProps) => {
  const activeIndex = primaryNavigationItems.findIndex(
    ({ id }) => id === activeDestination,
  );
  const navigationStyle: PrimaryNavigationStyle = {
    "--primary-navigation-active-index": activeIndex,
    "--primary-navigation-item-count": primaryNavigationItems.length,
  };

  return (
    <nav
      aria-label="主要内容"
      className={`${styles.navigation} yoyi-functional-glass`}
      data-active-index={activeIndex}
      data-item-count={primaryNavigationItems.length}
      data-platform={platform}
      data-primary-navigation=""
      style={navigationStyle}
    >
      <span
        aria-hidden="true"
        className={`${styles.bubble} yoyi-nav-bubble`}
        data-primary-navigation-bubble=""
      />
      {primaryNavigationItems.map(({ id, icon, label, labelMark }) => {
        const selected = id === activeDestination;

        return (
          <button
            key={id}
            type="button"
            aria-current={selected ? "page" : undefined}
            aria-label={label}
            className={`${styles.entry} yoyi-navigation-entry${
              selected ? " is-active" : ""
            }`}
            data-primary-navigation-destination={id}
            data-selected={selected ? "true" : "false"}
            onClick={() => onDestinationChange(id)}
          >
            <span aria-hidden="true" className={styles.iconWrap}>
              <Icon name={icon} />
            </span>
            <FixedLabelMark decorative label={label} name={labelMark} />
          </button>
        );
      })}
    </nav>
  );
};
