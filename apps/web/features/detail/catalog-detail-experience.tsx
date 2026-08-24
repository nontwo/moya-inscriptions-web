"use client";

import { useEffect, useRef, useState } from "react";

import { CatalogDetailScreen } from "./catalog-detail-screen";
import { CatalogViewer } from "./catalog-viewer";
import styles from "./catalog-detail.module.css";

import type { CatalogDetailPresentationState } from "./catalog-detail-presentation";
import type { PresentationPlatform } from "../shell/device-platform";

export interface CatalogDetailExperienceProps {
  readonly initialImageId?: string | undefined;
  readonly onBack: () => void;
  readonly onRetry?: (() => void) | undefined;
  readonly onViewerStateChange: (imageId: string | null) => void;
  readonly orientation: "landscape" | "portrait";
  readonly platform: PresentationPlatform;
  readonly state: CatalogDetailPresentationState;
}

export const CatalogDetailExperience = ({
  initialImageId,
  onBack,
  onRetry,
  onViewerStateChange,
  orientation,
  platform,
  state,
}: CatalogDetailExperienceProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const savedScrollRef = useRef(0);
  const [activeMediaIndex, setActiveMediaIndex] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const media = state.state === "loaded" ? state.detail.media : [];

  useEffect(() => {
    const requestedIndex = media.findIndex(({ id }) => id === initialImageId);
    if (requestedIndex >= 0) {
      setActiveMediaIndex(requestedIndex);
      setViewerOpen(true);
    } else {
      setActiveMediaIndex(0);
      setViewerOpen(false);
    }
  }, [initialImageId, media]);

  const openViewer = (index: number, opener: HTMLElement) => {
    const item = media[index];
    if (item === undefined) return;
    savedScrollRef.current = scrollRef.current?.scrollTop ?? 0;
    openerRef.current = opener;
    setActiveMediaIndex(index);
    setViewerOpen(true);
    onViewerStateChange(item.id);
  };

  const closeViewer = () => {
    setViewerOpen(false);
    onViewerStateChange(null);
    requestAnimationFrame(() => {
      if (scrollRef.current !== null) {
        scrollRef.current.scrollTop = savedScrollRef.current;
      }
      openerRef.current?.focus();
    });
  };

  return (
    <div className={styles.experience} data-detail-experience="">
      <div
        className={styles.detailScroller}
        data-detail-scroll=""
        ref={scrollRef}
      >
        <CatalogDetailScreen
          activeMediaIndex={activeMediaIndex}
          onActiveMediaIndexChange={setActiveMediaIndex}
          onBack={() => {
            if (viewerOpen) closeViewer();
            else onBack();
          }}
          onOpenViewer={openViewer}
          onRetry={onRetry}
          orientation={orientation}
          platform={platform}
          state={state}
        />
      </div>
      <CatalogViewer
        index={activeMediaIndex}
        media={media}
        onClose={closeViewer}
        onIndexChange={(index) => {
          setActiveMediaIndex(index);
          const item = media[index];
          if (item !== undefined) onViewerStateChange(item.id);
        }}
        open={viewerOpen}
        platform={platform}
      />
    </div>
  );
};
