import { notFound } from "next/navigation";

import { T02pDevelopmentAcceptanceSurface } from "../../../features/shell/t02p-development-acceptance-surface";

export default function T02pDevelopmentPage() {
  if (process.env.NODE_ENV !== "development") {
    notFound();
  }

  return <T02pDevelopmentAcceptanceSurface />;
}
