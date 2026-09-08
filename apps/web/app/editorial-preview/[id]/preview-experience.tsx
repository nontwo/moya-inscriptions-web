"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CatalogDetail } from "@moya/contracts";
import { CatalogDetailExperience } from "../../../features/detail/catalog-detail-experience";
import { toCatalogDetailPresentation } from "../../../features/detail/catalog-detail-presentation";
import {
  resolvePresentationOrientation,
  resolveRuntimePresentationPlatform,
  type PresentationPlatform,
  type PresentationOrientation,
} from "../../../features/shell/device-platform";

/** The protected route supplies data; the accepted Detail and Viewer supply all content interaction. */
export function EditorialPreviewExperience({
  detail,
  initialPlatform,
}: {
  detail: CatalogDetail;
  initialPlatform: PresentationPlatform;
}) {
  const backButtonRef = useRef<HTMLButtonElement>(null);
  const scrollTop = useRef(0);
  const [activeViewerMediaId, setActiveViewerMediaId] = useState<string | null>(
    null,
  );
  const [platform, setPlatform] = useState(initialPlatform);
  const [orientation, setOrientation] =
    useState<PresentationOrientation>("portrait");
  useEffect(() => {
    const resize = () => {
      setPlatform(
        resolveRuntimePresentationPlatform(navigator, window.innerWidth),
      );
      setOrientation(
        resolvePresentationOrientation(window.innerWidth, window.innerHeight),
      );
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  const saveScroll = useCallback((value: number) => {
    scrollTop.current = value;
  }, []);
  const closeViewer = useCallback(() => setActiveViewerMediaId(null), []);
  return (
    <section aria-label="受保护内容预览" data-editorial-preview="">
      <CatalogDetailExperience
        activeViewerMediaId={activeViewerMediaId}
        backButtonRef={backButtonRef}
        catalogId={detail.id}
        initialScrollTop={scrollTop.current}
        onBack={() => {
          if (window.history.length > 1) window.history.back();
          else window.location.assign("/");
        }}
        onCloseViewer={closeViewer}
        onOpenViewer={setActiveViewerMediaId}
        onScrollTopChange={saveScroll}
        onViewerMediaChange={setActiveViewerMediaId}
        orientation={orientation}
        platform={platform}
        state={{
          state: "loaded",
          detail: toCatalogDetailPresentation(detail, "runtime"),
        }}
      />
    </section>
  );
}
