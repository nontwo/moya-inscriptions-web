"use client";

import { CatalogBrowseScreen } from "../home/catalog-screen";
import { HomeScreen } from "../home/home-screen";
import { ProductShell, useProductShell } from "../product-shell/product-shell";

import type { T02pDevelopmentCatalogDestinationStates } from "./catalog-scenarios";
import type { HomeCatalogState } from "../home/catalog-state";
import type { PresentationPlatform } from "../shell/device-platform";

const PreviewHome = ({ state }: { readonly state: HomeCatalogState }) => {
  const { feedLayout } = useProductShell();
  return (
    <div data-product-panel="home">
      <HomeScreen feedLayout={feedLayout} state={state} />
    </div>
  );
};

const PreviewBrowse = ({
  kind,
  state,
}: {
  readonly kind: "inscription" | "calligraphy";
  readonly state: HomeCatalogState;
}) => {
  const { feedLayout } = useProductShell();
  return (
    <div
      data-product-panel={
        kind === "inscription" ? "inscriptions" : "calligraphy"
      }
    >
      <CatalogBrowseScreen feedLayout={feedLayout} kind={kind} state={state} />
    </div>
  );
};

export interface T02pProductPreviewProps {
  readonly developmentPlatformOverride?: PresentationPlatform | null;
  readonly initialPlatform: PresentationPlatform;
  readonly showDevelopmentPagerControls?: boolean;
  readonly states: T02pDevelopmentCatalogDestinationStates;
}

export const T02pProductPreview = ({
  developmentPlatformOverride = null,
  initialPlatform,
  showDevelopmentPagerControls = false,
  states,
}: T02pProductPreviewProps) => (
  <div data-clean-product-preview="">
    <ProductShell
      calligraphy={
        <PreviewBrowse kind="calligraphy" state={states.calligraphy} />
      }
      developmentPlatformOverride={developmentPlatformOverride}
      home={<PreviewHome state={states.home} />}
      initialPlatform={initialPlatform}
      inscriptions={
        <PreviewBrowse kind="inscription" state={states.inscriptions} />
      }
      showDevelopmentPagerControls={showDevelopmentPagerControls}
    />
  </div>
);
