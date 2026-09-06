import { request } from "node:https";

export interface CosHttpRequest {
  readonly url: URL;
  readonly method: "HEAD" | "GET" | "PUT";
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: Buffer;
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
}

export interface CosHttpResponse {
  readonly statusCode: number;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: Buffer;
}

export type CosHttpSender = (input: CosHttpRequest) => Promise<CosHttpResponse>;

/** No redirects, decompression, retries, or logging of signed requests. */
export const requestCosHttps: CosHttpSender = async (input) => {
  if (
    input.url.protocol !== "https:" ||
    input.url.username ||
    input.url.password ||
    !Number.isSafeInteger(input.timeoutMs) ||
    input.timeoutMs < 1 ||
    !Number.isSafeInteger(input.maxResponseBytes) ||
    input.maxResponseBytes < 0
  ) {
    throw new Error("COS HTTPS request configuration invalid");
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error?: Error, response?: CosHttpResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      if (error) reject(error);
      else if (response) resolve(response);
    };
    // Absolute deadline includes DNS, TLS, request body, and response body.
    const deadline = setTimeout(() => {
      finish(new Error("COS request timed out"));
      outgoing.destroy();
    }, input.timeoutMs);
    let outgoing: ReturnType<typeof request>;
    try {
      outgoing = request(
        input.url,
        {
          method: input.method,
          headers: input.headers,
          rejectUnauthorized: true,
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          let length = 0;
          incoming.on("data", (chunk: Buffer) => {
            length += chunk.length;
            if (length > input.maxResponseBytes) {
              finish(new Error("COS response exceeds byte limit"));
              incoming.destroy();
              outgoing.destroy();
              return;
            }
            chunks.push(chunk);
          });
          incoming.on("error", () =>
            finish(new Error("COS response transport failed")),
          );
          incoming.on("aborted", () =>
            finish(new Error("COS response interrupted")),
          );
          incoming.on("end", () =>
            finish(undefined, {
              statusCode: incoming.statusCode ?? 0,
              headers: Object.fromEntries(
                Object.entries(incoming.headers).map(([key, value]) => [
                  key.toLowerCase(),
                  Array.isArray(value) ? value.join(",") : value,
                ]),
              ),
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      outgoing.on("error", () =>
        finish(new Error("COS request transport failed")),
      );
      outgoing.end(input.body);
    } catch {
      finish(new Error("COS request transport failed"));
    }
  });
};
