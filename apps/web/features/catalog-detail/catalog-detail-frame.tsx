"use client";

import { useEffect, useState } from "react";

import {
  detectCatalogDetailDeviceClass,
  resolveCatalogDetailComposition,
  resolveCatalogDetailPlatform,
} from "./catalog-detail-platform";

import type { ReactNode } from "react";

const compositionForWindow = () =>
  resolveCatalogDetailComposition(
    resolveCatalogDetailPlatform(
      detectCatalogDetailDeviceClass(window.navigator),
      window.innerWidth,
    ),
    window.innerWidth > window.innerHeight,
  );

export const CatalogDetailFrame = ({
  children,
  className,
}: {
  children: ReactNode;
  className: string | undefined;
}) => {
  const [composition, setComposition] = useState("stacked");

  useEffect(() => {
    const update = () => setComposition(compositionForWindow());
    update();
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <main className={className} data-detail-composition={composition}>
      {children}
    </main>
  );
};
