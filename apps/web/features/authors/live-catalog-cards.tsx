"use client";
import type { ReactNode } from "react";
import {
  CatalogCardPresentation,
  CatalogCardRendererProvider,
} from "../home/catalog-card";
import type { CatalogCardProps } from "../home/catalog-card";
import { ContentQuickActionsProvider } from "../quick-actions/content-quick-actions";
import { ContentActionsView, useContentActions } from "./content-actions";
const LiveCatalogCard = (props: CatalogCardProps) => {
  const target = { type: "catalog", id: props.item.id } as const;
  const actions = useContentActions(target, props.item.title);
  return (
    <div>
      <ContentQuickActionsProvider environment={actions.environment}>
        <CatalogCardPresentation {...props} />
      </ContentQuickActionsProvider>
      <details className="phase4-card-options">
        <summary aria-label={`${props.item.title}的操作`}>操作</summary>
        <ContentActionsView
          target={target}
          title={props.item.title}
          actions={actions}
        />
      </details>
    </div>
  );
};
export const LiveCatalogCards = ({ children }: { children: ReactNode }) => (
  <CatalogCardRendererProvider component={LiveCatalogCard}>
    {children}
  </CatalogCardRendererProvider>
);
