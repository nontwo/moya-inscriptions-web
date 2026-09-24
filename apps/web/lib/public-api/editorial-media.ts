import "server-only";

const localFile = /^[a-f0-9]{64}-[a-f0-9]{64}\.(png|jpg|webp)$/u;
const mediaTypes: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

/** The Development CMS origin, loopback HTTP only: the relay reaches nothing else. */
const localCmsOrigin = (value: string | undefined): URL | null => {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
      ? url
      : null;
  } catch {
    return null;
  }
};

/**
 * Development-only caller: serves one native synthetic Payload file named by
 * its hashed file name through the Web origin, for a phone on the LAN. The read
 * is anonymous; Payload answers it only for files of published Catalog records.
 */
export const relayServerLocalEditorialMedia = async (
  file: string,
): Promise<Response> => {
  const headers = {
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  };
  const fail = (status: number) => new Response(null, { status, headers });
  const match = localFile.exec(file);
  if (!match) return fail(404);
  const origin = localCmsOrigin(process.env.CMS_INTERNAL_URL);
  if (!origin) return fail(503);
  const expected = mediaTypes[match[1]!]!;
  try {
    const response = await fetch(new URL(`api/media/file/${file}`, origin), {
      method: "GET",
      headers: { accept: expected },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return fail(
        response.status === 404 || response.status === 403 ? 404 : 503,
      );
    }
    if (response.headers.get("content-type")?.split(";")[0] !== expected) {
      await response.body?.cancel().catch(() => undefined);
      return fail(502);
    }
    const reader = response.body?.getReader();
    if (!reader) return fail(502);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > 12 * 1024 * 1024) {
        await reader.cancel();
        return fail(502);
      }
      chunks.push(next.value);
    }
    return new Response(new Uint8Array(Buffer.concat(chunks)), {
      status: 200,
      headers: { ...headers, "content-type": expected },
    });
  } catch {
    return fail(503);
  }
};
