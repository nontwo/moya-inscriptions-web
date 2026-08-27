"use client";

import { useEffect, useRef, useState } from "react";

import { CatalogDetailExperience } from "../detail/catalog-detail-experience";
import { useProductShell } from "../product-shell/product-shell";

import type { RefObject } from "react";
import type { CatalogDetailPresentationLoader } from "../detail/load-catalog-detail";
import type { CatalogDetailPresentationState } from "../detail/catalog-detail-presentation";

export interface PreviewCatalogDetailOverlayProps {
  readonly backButtonRef: RefObject<HTMLButtonElement | null>;
  readonly catalogId: string;
  readonly initialScrollTop: number;
  readonly loader: CatalogDetailPresentationLoader;
  readonly onClose: () => void;
  readonly onScrollTopChange: (top: number) => void;
}

export const PreviewCatalogDetailOverlay = ({
  backButtonRef,
  catalogId,
  initialScrollTop,
  loader,
  onClose,
  onScrollTopChange,
}: PreviewCatalogDetailOverlayProps) => {
  const { orientation, platform } = useProductShell();
  const generationRef = useRef(0);
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
  }, [catalogId, loader]);

  return (
    <CatalogDetailExperience
      backButtonRef={backButtonRef}
      catalogId={catalogId}
      initialScrollTop={initialScrollTop}
      onBack={onClose}
      onScrollTopChange={onScrollTopChange}
      orientation={orientation}
      platform={platform}
      state={state}
    />
  );
};
