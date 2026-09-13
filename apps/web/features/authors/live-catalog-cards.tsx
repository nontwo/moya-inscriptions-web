"use client";
import type { ReactNode } from "react";
import {
  CatalogCardPresentation,
  CatalogCardRendererProvider,
} from "../home/catalog-card";
import type { CatalogCardProps } from "../home/catalog-card";
import { ContentQuickActionsProvider } from "../quick-actions/content-quick-actions";
import { useContentActions } from "./content-actions";
const LiveCatalogCard = (props: CatalogCardProps) => {
  const target = { type: "catalog", id: props.item.id } as const;
  const actions = useContentActions(target, props.item.title);
  return (
    <ContentQuickActionsProvider environment={actions.environment}>
      <CatalogCardPresentation {...props} />
    </ContentQuickActionsProvider>
  );
};
export const LiveCatalogCards = ({ children }: { children: ReactNode }) => (
  <CatalogCardRendererProvider component={LiveCatalogCard}>
    {children}
  </CatalogCardRendererProvider>
);
