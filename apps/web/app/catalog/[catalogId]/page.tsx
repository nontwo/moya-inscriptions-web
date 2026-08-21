import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  CatalogDetailScreen,
  CatalogDetailStatus,
} from "../../../features/catalog-detail/catalog-detail-screen";
import { fetchServerCatalogDetail } from "../../../lib/public-api/server";

export const runtime = "nodejs";

interface CatalogDetailPageProps {
  params: Promise<{ catalogId: string }>;
}

export default async function CatalogDetailPage({
  params,
}: CatalogDetailPageProps) {
  await connection();
  const { catalogId } = await params;
  const result = await fetchServerCatalogDetail(catalogId);

  switch (result.state) {
    case "success":
      return <CatalogDetailScreen detail={result.detail} />;
    case "not-found":
      return notFound();
    case "unavailable":
      return <CatalogDetailStatus state="unavailable" />;
    case "unexpected-error":
      return <CatalogDetailStatus state="unexpected-error" />;
  }
}
