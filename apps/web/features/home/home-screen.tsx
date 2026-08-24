import {
  CatalogCollectionScreen,
  type CatalogFeedLayout,
} from "./catalog-screen";

import type { HomeCatalogState } from "./catalog-state";

export interface HomeScreenProps {
  readonly feedLayout: CatalogFeedLayout;
  readonly onOpenCatalog?:
    ((catalogId: string, opener: HTMLElement) => void) | undefined;
  readonly openableCatalogIds?: readonly string[] | undefined;
  readonly state: HomeCatalogState;
}

export const HomeScreen = ({
  feedLayout,
  onOpenCatalog,
  openableCatalogIds,
  state,
}: HomeScreenProps) => (
  <CatalogCollectionScreen
    feedLayout={feedLayout}
    onOpenCatalog={onOpenCatalog}
    openableCatalogIds={openableCatalogIds}
    presentation="home"
    state={state}
  />
);
