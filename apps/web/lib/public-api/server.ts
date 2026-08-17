import "server-only";

import { fetchCatalogPage } from "./catalog-list.js";

import type { CatalogListTransportQuery } from "@moya/contracts";
import type { CatalogPageTransportResult } from "./catalog-list.js";

const publicApiBaseUrlVariable = "MOYA_PUBLIC_API_BASE_URL" as const;

export const parsePublicApiBaseUrl = (value: string | undefined): URL => {
  if (value === undefined || value === "" || value !== value.trim()) {
    throw new Error(`${publicApiBaseUrlVariable} is required`);
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${publicApiBaseUrlVariable} must be an absolute URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${publicApiBaseUrlVariable} must use HTTP(S)`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new Error(`${publicApiBaseUrlVariable} must not contain credentials`);
  }
  if (url.search !== "") {
    throw new Error(`${publicApiBaseUrlVariable} must not contain a query`);
  }
  if (url.hash !== "") {
    throw new Error(`${publicApiBaseUrlVariable} must not contain a hash`);
  }

  url.pathname = `${url.pathname.replace(/\/+$/, "")}/`;
  return url;
};

export const fetchServerCatalogPage = async (
  query: CatalogListTransportQuery = {},
): Promise<CatalogPageTransportResult> => {
  try {
    const baseUrl = parsePublicApiBaseUrl(process.env.MOYA_PUBLIC_API_BASE_URL);
    return await fetchCatalogPage({ baseUrl, fetch: globalThis.fetch }, query);
  } catch {
    return { state: "unexpected-error" };
  }
};
