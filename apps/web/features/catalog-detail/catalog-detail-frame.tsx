"use client";

import { useLayoutEffect, useState } from "react";

import {
  detectCatalogDetailDeviceClass,
  resolveCatalogDetailComposition,
  resolveCatalogDetailPlatform,
} from "./catalog-detail-platform";

import type { ReactNode } from "react";

const layoutForWindow = () => {
  const platform = resolveCatalogDetailPlatform(
    detectCatalogDetailDeviceClass(window.navigator),
    window.innerWidth,
  );
  return {
    composition: resolveCatalogDetailComposition(
      platform,
      window.innerWidth > window.innerHeight,
    ),
    platform,
  };
};

export const CatalogDetailFrame = ({
  children,
  className,
}: {
  children: ReactNode;
  className: string | undefined;
}) => {
  const [layout, setLayout] = useState({
    composition: "stacked",
    platform: "phone",
  });

  useLayoutEffect(() => {
    const update = () => setLayout(layoutForWindow());
    update();
    window.addEventListener("orientationchange", update);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("orientationchange", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <main
      className={className}
      data-detail-composition={layout.composition}
      data-detail-platform={layout.platform}
    >
      {children}
    </main>
  );
};
