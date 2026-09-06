import { createHash, createHmac } from "node:crypto";

/** COS XML request signing, not Tencent's unrelated TC3 API signing.
 * https://cloud.tencent.com/document/product/436/7778
 */
export const cosUrlEncode = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const canonicalFields = (fields: Readonly<Record<string, string>>) => {
  const entries = Object.entries(fields)
    .map(
      ([key, value]) =>
        [cosUrlEncode(key).toLowerCase(), cosUrlEncode(value)] as const,
    )
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  if (new Set(entries.map(([key]) => key)).size !== entries.length) {
    throw new Error("COS duplicate canonical field");
  }
  return {
    list: entries.map(([key]) => key).join(";"),
    values: entries.map(([key, value]) => `${key}=${value}`).join("&"),
  };
};

export const canonicalCosRequest = (request: {
  readonly method: "GET" | "HEAD" | "PUT";
  /** Decoded absolute object path, as required by the COS signature algorithm. */
  readonly pathname: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, string>>;
}) => {
  const headers = canonicalFields(request.headers);
  const query = canonicalFields(request.query);
  const httpString = `${request.method.toLowerCase()}\n${request.pathname}\n${query.values}\n${headers.values}\n`;
  return {
    headerList: headers.list,
    parameterList: query.list,
    httpString,
    httpStringSha1: createHash("sha1").update(httpString).digest("hex"),
  };
};

export const signCosRequest = (
  request: Parameters<typeof canonicalCosRequest>[0] & {
    readonly secretId: string;
    readonly secretKey: string;
    readonly startsAt: number;
    readonly expiresAt: number;
  },
): string => {
  if (
    !Number.isSafeInteger(request.startsAt) ||
    !Number.isSafeInteger(request.expiresAt) ||
    request.startsAt < 0 ||
    request.expiresAt <= request.startsAt ||
    !/^[A-Za-z0-9_-]+$/.test(request.secretId) ||
    request.secretKey.length === 0
  ) {
    throw new Error("COS signing configuration invalid");
  }
  const canonical = canonicalCosRequest(request);
  const keyTime = `${request.startsAt};${request.expiresAt}`;
  const signKey = createHmac("sha1", request.secretKey)
    .update(keyTime)
    .digest("hex");
  const stringToSign = `sha1\n${keyTime}\n${canonical.httpStringSha1}\n`;
  const signature = createHmac("sha1", signKey)
    .update(stringToSign)
    .digest("hex");
  return `q-sign-algorithm=sha1&q-ak=${request.secretId}&q-sign-time=${keyTime}&q-key-time=${keyTime}&q-header-list=${canonical.headerList}&q-url-param-list=${canonical.parameterList}&q-signature=${signature}`;
};
