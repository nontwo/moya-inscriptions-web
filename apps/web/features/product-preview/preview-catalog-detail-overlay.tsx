"use client";

import { useEffect, useRef, useState } from "react";

import { CatalogDetailExperience } from "../detail/catalog-detail-experience";
import { useProductShell } from "../product-shell/product-shell";

import type { ReactNode, RefObject } from "react";
import type { CatalogDetailPresentationLoader } from "../detail/load-catalog-detail";
import type {
  CatalogDetailPresentation,
  CatalogDetailPresentationState,
} from "../detail/catalog-detail-presentation";

export interface PreviewCatalogDetailOverlayProps {
  readonly backButtonRef: RefObject<HTMLButtonElement | null>;
  readonly catalogId: string;
  readonly commentSection?: ReactNode;
  readonly renderActions?: (
    detail: CatalogDetailPresentation,
    refresh: () => void,
  ) => ReactNode;
  readonly initialScrollTop: number;
  readonly loader: CatalogDetailPresentationLoader;
  readonly onClose: () => void;
  readonly onScrollTopChange: (top: number) => void;
}

export const PreviewCatalogDetailOverlay = ({
  backButtonRef,
  catalogId,
  commentSection,
  renderActions,
  initialScrollTop,
  loader,
  onClose,
  onScrollTopChange,
}: PreviewCatalogDetailOverlayProps) => {
  const {
    activeViewerMediaId,
    changeViewerMedia,
    closeViewer,
    openViewer,
    orientation,
    platform,
  } = useProductShell();
  const generationRef = useRef(0);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<CatalogDetailPresentationState>({
    state: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    const generation = ++generationRef.current;
    setState({ state: "loading" });
    void loader(catalogId, controller.signal)
      .then((nextState) => {
        if (
          !controller.signal.aborted &&
          generationRef.current === generation
        ) {
          setState(nextState);
        }
      })
      .catch(() => {
        if (
          !controller.signal.aborted &&
          generationRef.current === generation
        ) {
          setState({ state: "unexpected-error" });
        }
      });
    return () => controller.abort();
  }, [catalogId, loader, revision]);

  return (
    <CatalogDetailExperience
      activeViewerMediaId={activeViewerMediaId}
      backButtonRef={backButtonRef}
      catalogId={catalogId}
      commentSection={commentSection}
      detailActions={
        state.state === "loaded"
          ? renderActions?.(state.detail, () => setRevision((v) => v + 1))
          : undefined
      }
      initialScrollTop={initialScrollTop}
      onBack={onClose}
      onCloseViewer={closeViewer}
      onOpenViewer={openViewer}
      onScrollTopChange={onScrollTopChange}
      onViewerMediaChange={changeViewerMedia}
      orientation={orientation}
      platform={platform}
      state={state}
    />
  );
};
