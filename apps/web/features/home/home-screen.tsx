import {
  CatalogCollectionScreen,
  type CatalogFeedLayout,
} from "./catalog-screen";

import type { HomeCatalogState } from "./catalog-state";

export interface HomeScreenProps {
  readonly feedLayout: CatalogFeedLayout;
  state: HomeCatalogState;
}

export const HomeScreen = ({ feedLayout, state }: HomeScreenProps) => (
  <CatalogCollectionScreen
    feedLayout={feedLayout}
    presentation="home"
    state={state}
  />
);
