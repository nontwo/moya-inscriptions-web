import "server-only";

import { cookies } from "next/headers";
import { catalogDetailSchema } from "@moya/contracts/schemas";
import type { CatalogDetail } from "@moya/contracts";

export type EditorialPreviewResult =
  | { state: "success"; detail: CatalogDetail }
  | { state: "unauthorized" | "incomplete" | "not-found" | "unavailable" };

function cmsOrigin(value: string | undefined): URL {
  const url = new URL(value ?? "");
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new Error("PREVIEW_CONFIGURATION_INVALID");
  return url;
}

export async function fetchEditorialPreview(
  id: string,
  context: {
    baseURL?: string;
    session?: string;
    fetch: typeof globalThis.fetch;
  },
): Promise<EditorialPreviewResult> {
  if (!/^[1-9]\d{0,15}$/.test(id) || !Number.isSafeInteger(Number(id)))
    return { state: "not-found" };
  if (
    !context.session ||
    context.session.length > 16384 ||
    /[;\r\n]/.test(context.session)
  )
    return { state: "unauthorized" };
  try {
    const endpoint = new URL(
      `/api/editorial/preview/${id}`,
      cmsOrigin(context.baseURL),
    );
    const response = await context.fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Cookie: `payload-token=${context.session}`,
      },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 401 || response.status === 403)
      return { state: "unauthorized" };
    if (response.status === 404) return { state: "not-found" };
    if (response.status === 422) return { state: "incomplete" };
    if (response.status !== 200) return { state: "unavailable" };
    const parsed = catalogDetailSchema.safeParse(await response.json());
    return parsed.success
      ? { state: "success", detail: parsed.data }
      : { state: "unavailable" };
  } catch {
    return { state: "unavailable" };
  }
}

export async function fetchServerEditorialPreview(
  id: string,
): Promise<EditorialPreviewResult> {
  const session = (await cookies()).get("payload-token")?.value;
  return fetchEditorialPreview(id, {
    ...(process.env.CMS_INTERNAL_URL === undefined
      ? {}
      : { baseURL: process.env.CMS_INTERNAL_URL }),
    ...(session === undefined ? {} : { session }),
    fetch: globalThis.fetch,
  });
}
