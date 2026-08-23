"use client";

import { useRef, useState } from "react";

import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactElement,
} from "react";

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
  readonly "--primary-navigation-bubble-index": number;
  readonly "--primary-navigation-item-count": number;
};

interface PrimaryNavigationPointerGesture {
  readonly committedDestination: PrimaryDestination;
  readonly entryCenters: readonly number[];
  readonly initiatingButton: HTMLButtonElement;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly startIndex: number;
  readonly startX: number;
  readonly startY: number;
  dragging: boolean;
  explicitlyCaptured: boolean;
}

export const PRIMARY_NAVIGATION_DRAG_THRESHOLD_PX = 8;

export const canArmPrimaryNavigationPointer = (
  isPrimary: boolean,
  pointerType: string,
  button: number,
) => isPrimary && (pointerType !== "mouse" || button === 0);

const clampNavigationIndex = (index: number, itemCount: number) =>
  Math.min(Math.max(index, 0), Math.max(itemCount - 1, 0));

export const hasPrimaryNavigationHorizontalDragIntent = (
  horizontalDisplacement: number,
  verticalDisplacement: number,
) =>
  Math.abs(horizontalDisplacement) > PRIMARY_NAVIGATION_DRAG_THRESHOLD_PX &&
  Math.abs(horizontalDisplacement) > Math.abs(verticalDisplacement);

export const resolvePrimaryNavigationBubbleIndex = (
  entryCenters: readonly number[],
  startIndex: number,
  horizontalDisplacement: number,
) => {
  if (entryCenters.length === 0) return 0;

  const clampedStartIndex = clampNavigationIndex(
    startIndex,
    entryCenters.length,
  );
  const startCenter = entryCenters[clampedStartIndex] ?? entryCenters[0] ?? 0;
  const previewCenter = startCenter + horizontalDisplacement;

  if (previewCenter <= (entryCenters[0] ?? previewCenter)) return 0;

  const lastIndex = entryCenters.length - 1;
  if (previewCenter >= (entryCenters[lastIndex] ?? previewCenter)) {
    return lastIndex;
  }

  for (let index = 0; index < lastIndex; index += 1) {
    const leftCenter = entryCenters[index];
    const rightCenter = entryCenters[index + 1];
    if (
      leftCenter === undefined ||
      rightCenter === undefined ||
      previewCenter > rightCenter
    ) {
      continue;
    }

    const centerDistance = Math.max(rightCenter - leftCenter, 1);
    return index + (previewCenter - leftCenter) / centerDistance;
  }

  return lastIndex;
};

export const resolvePrimaryNavigationReleaseIndex = (
  previewIndex: number,
  itemCount: number,
) => clampNavigationIndex(Math.round(previewIndex), itemCount);

export interface PrimaryBottomNavigationProps {
  readonly activeDestination: PrimaryDestination;
  readonly platform: PresentationPlatform;
  readonly onDestinationChange: (destination: PrimaryDestination) => void;
}

export const createPrimaryNavigationEntryElements = (
  activeDestination: PrimaryDestination,
  onDestinationChange: (destination: PrimaryDestination) => void,
): ReactElement[] =>
  primaryNavigationItems.map(({ id, icon, label, labelMark }) => {
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
  });

export const commitPrimaryNavigationDragRelease = (
  committedDestination: PrimaryDestination,
  previewIndex: number,
  onDestinationChange: (destination: PrimaryDestination) => void,
) => {
  const releaseIndex = resolvePrimaryNavigationReleaseIndex(
    previewIndex,
    primaryNavigationItems.length,
  );
  const releaseDestination = primaryNavigationItems[releaseIndex]?.id;

  if (
    releaseDestination !== undefined &&
    releaseDestination !== committedDestination
  ) {
    onDestinationChange(releaseDestination);
  }

  return releaseDestination ?? committedDestination;
};

const readPrimaryNavigationEntryCenters = (navigation: HTMLElement) =>
  Array.from(
    navigation.querySelectorAll<HTMLElement>(
      "[data-primary-navigation-destination]",
    ),
    (entry) => {
      const rect = entry.getBoundingClientRect();
      return rect.left + rect.width / 2;
    },
  );

const releasePrimaryNavigationPointer = (
  initiatingButton: HTMLButtonElement,
  pointerId: number,
) => {
  try {
    if (initiatingButton.hasPointerCapture(pointerId)) {
      initiatingButton.releasePointerCapture(pointerId);
    }
  } catch {
    // Pointer capture may already be released by the browser.
  }
};

export const PrimaryBottomNavigation = ({
  activeDestination,
  platform,
  onDestinationChange,
}: PrimaryBottomNavigationProps) => {
  const gestureRef = useRef<PrimaryNavigationPointerGesture | null>(null);
  const suppressClickRef = useRef(false);
  const [dragPreviewIndex, setDragPreviewIndex] = useState<number | null>(null);
  const activeIndex = primaryNavigationItems.findIndex(
    ({ id }) => id === activeDestination,
  );
  const bubbleIndex = dragPreviewIndex ?? activeIndex;
  const navigationStyle: PrimaryNavigationStyle = {
    "--primary-navigation-active-index": activeIndex,
    "--primary-navigation-bubble-index": bubbleIndex,
    "--primary-navigation-item-count": primaryNavigationItems.length,
  };

  const clearPointerGesture = (
    gesture: PrimaryNavigationPointerGesture,
    releasePointer = true,
  ) => {
    gestureRef.current = null;
    if (releasePointer && gesture.explicitlyCaptured) {
      releasePrimaryNavigationPointer(
        gesture.initiatingButton,
        gesture.pointerId,
      );
    }
    setDragPreviewIndex(null);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (
      !canArmPrimaryNavigationPointer(
        event.isPrimary,
        event.pointerType,
        event.button,
      ) ||
      gestureRef.current !== null
    ) {
      return;
    }

    const pointerTarget = event.target;
    if (!(pointerTarget instanceof Element)) return;

    const initiatingButton = pointerTarget.closest<HTMLButtonElement>(
      "[data-primary-navigation-destination]",
    );
    if (
      initiatingButton === null ||
      !event.currentTarget.contains(initiatingButton)
    )
      return;

    const entryCenters = readPrimaryNavigationEntryCenters(event.currentTarget);
    if (entryCenters.length !== primaryNavigationItems.length) return;

    gestureRef.current = {
      committedDestination: activeDestination,
      dragging: false,
      entryCenters,
      explicitlyCaptured: false,
      initiatingButton,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startIndex: activeIndex,
      startX: event.clientX,
      startY: event.clientY,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;

    const horizontalDisplacement = event.clientX - gesture.startX;
    const verticalDisplacement = event.clientY - gesture.startY;

    if (!gesture.dragging) {
      if (
        !hasPrimaryNavigationHorizontalDragIntent(
          horizontalDisplacement,
          verticalDisplacement,
        )
      ) {
        return;
      }

      gesture.dragging = true;
      if (gesture.pointerType === "mouse") {
        try {
          gesture.initiatingButton.setPointerCapture(event.pointerId);
          gesture.explicitlyCaptured = true;
        } catch {
          // Synthetic and embedded mouse events may not support capture.
        }
      }
    }

    event.preventDefault();
    setDragPreviewIndex(
      resolvePrimaryNavigationBubbleIndex(
        gesture.entryCenters,
        gesture.startIndex,
        horizontalDisplacement,
      ),
    );
  };

  const suppressCompletedDragClick = () => {
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;

    if (!gesture.dragging) {
      clearPointerGesture(gesture);
      return;
    }

    event.preventDefault();
    const previewIndex = resolvePrimaryNavigationBubbleIndex(
      gesture.entryCenters,
      gesture.startIndex,
      event.clientX - gesture.startX,
    );

    clearPointerGesture(gesture);
    suppressCompletedDragClick();
    commitPrimaryNavigationDragRelease(
      gesture.committedDestination,
      previewIndex,
      onDestinationChange,
    );
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;

    clearPointerGesture(gesture);
  };

  const handleLostPointerCapture = (event: ReactPointerEvent<HTMLElement>) => {
    const gesture = gestureRef.current;
    if (
      gesture === null ||
      gesture.pointerId !== event.pointerId ||
      !gesture.explicitlyCaptured ||
      event.target !== gesture.initiatingButton
    )
      return;

    clearPointerGesture(gesture, false);
  };

  const handleClickCapture = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClickRef.current || event.detail === 0) return;

    suppressClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <nav
      aria-label="主要内容"
      className={`${styles.navigation} yoyi-functional-glass`}
      data-active-index={activeIndex}
      data-bubble-preview-index={dragPreviewIndex ?? undefined}
      data-dragging={dragPreviewIndex === null ? undefined : "true"}
      data-item-count={primaryNavigationItems.length}
      data-platform={platform}
      data-primary-navigation=""
      onClickCapture={handleClickCapture}
      onLostPointerCapture={handleLostPointerCapture}
      onPointerCancel={handlePointerCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      style={navigationStyle}
    >
      <span
        aria-hidden="true"
        className={`${styles.bubble} yoyi-nav-bubble`}
        data-primary-navigation-bubble=""
      />
      {createPrimaryNavigationEntryElements(
        activeDestination,
        onDestinationChange,
      )}
    </nav>
  );
};
