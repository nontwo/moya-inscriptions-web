import { createHash } from "node:crypto";

import { requestCosHttps } from "./cos-https.js";
import { signCosRequest } from "./cos-signature.js";

import type { CosHttpResponse, CosHttpSender } from "./cos-https.js";

export interface PilotCosObject {
  readonly mediaId: string;
  readonly objectKey: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface CosCredentials {
  readonly secretId: string;
  readonly secretKey: string;
  readonly securityToken?: string;
  /** Unix seconds. Required when a temporary securityToken is supplied. */
  readonly expiresAt?: number;
}

export interface PilotCosOptions {
  readonly bucket: string;
  readonly region: string;
  /** An independently verified, bucket-bound HTTPS origin for browser images. */
  readonly mediaOrigin: string;
  readonly objects: readonly PilotCosObject[];
  readonly credentials: () => Promise<CosCredentials>;
  readonly signedUrlTtlSeconds?: number;
  readonly requestTimeoutMs?: number;
}

export interface VerifiedPilotCosObject {
  readonly objectKey: string;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly verifiedAt: string;
  readonly outcome: "uploaded" | "reused";
}

const MAX_OBJECT_BYTES = 32 * 1024 * 1024;
const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

const httpsOrigin = (value: string): URL => {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("COS media origin invalid");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(parsed.hostname)
  ) {
    throw new Error("COS media origin must be a verified HTTPS DNS origin");
  }
  return parsed;
};

/** Backend-only storage infrastructure. Calling ensureObject still requires the
 * operation/target approval guard owned by the Pilot application entry point.
 */
export class PilotCosStorage {
  private readonly objects: ReadonlyMap<string, PilotCosObject>;
  private readonly endpoint: URL;
  private readonly mediaOrigin: URL;
  private readonly ttl: number;
  private readonly timeout: number;
  private readonly sender: CosHttpSender;
  private readonly now: () => number;

  constructor(
    private readonly options: PilotCosOptions,
    dependencies: {
      readonly sender?: CosHttpSender;
      readonly now?: () => number;
    } = {},
  ) {
    if (
      !/^[a-z0-9][a-z0-9-]{1,49}-[0-9]{5,20}$/.test(options.bucket) ||
      !/^[a-z]{2}-[a-z]+(?:-[a-z]+)?$/.test(options.region)
    ) {
      throw new Error("COS bucket or region invalid");
    }
    this.endpoint = new URL(
      `https://${options.bucket}.cos.${options.region}.myqcloud.com`,
    );
    this.mediaOrigin = httpsOrigin(options.mediaOrigin);
    this.ttl = options.signedUrlTtlSeconds ?? 300;
    this.timeout = options.requestTimeoutMs ?? 30_000;
    if (
      !Number.isSafeInteger(this.ttl) ||
      this.ttl < 60 ||
      this.ttl > 600 ||
      !Number.isSafeInteger(this.timeout) ||
      this.timeout < 1 ||
      this.timeout > 120_000
    ) {
      throw new Error("COS time bounds invalid");
    }
    if (options.objects.length === 0 || options.objects.length > 20) {
      throw new Error("COS Pilot manifest must contain 1 to 20 objects");
    }
    const ids = new Set<string>();
    const objects = new Map<string, PilotCosObject>();
    for (const item of options.objects) {
      if (
        !/^media_[a-f0-9]{32}$/.test(item.mediaId) ||
        !/^[a-f0-9]{64}$/.test(item.sha256) ||
        item.objectKey !== `display/v1/${item.mediaId}/${item.sha256}.webp` ||
        !Number.isSafeInteger(item.sizeBytes) ||
        item.sizeBytes < 1 ||
        item.sizeBytes > MAX_OBJECT_BYTES ||
        objects.has(item.objectKey) ||
        ids.has(item.mediaId)
      ) {
        throw new Error("COS Pilot manifest invalid or duplicated");
      }
      ids.add(item.mediaId);
      objects.set(item.objectKey, Object.freeze({ ...item }));
    }
    this.objects = objects;
    this.sender = dependencies.sender ?? requestCosHttps;
    this.now = dependencies.now ?? Date.now;
  }

  private object(objectKey: string): PilotCosObject {
    const object = this.objects.get(objectKey);
    if (!object) throw new Error("COS object is outside the Pilot manifest");
    return object;
  }

  private async authorization(
    method: "GET" | "HEAD" | "PUT",
    pathname: string,
    headers: Record<string, string>,
    query: Record<string, string>,
    asUrl: boolean,
  ) {
    let credentials: CosCredentials;
    try {
      credentials = await this.options.credentials();
    } catch {
      throw new Error("COS credentials unavailable");
    }
    const now = Math.floor(this.now() / 1000);
    const expiresAt = Math.min(
      now + this.ttl,
      credentials.expiresAt ?? Infinity,
    );
    if (
      !Number.isSafeInteger(now) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt - now < 30 ||
      (credentials.securityToken !== undefined &&
        credentials.expiresAt === undefined)
    ) {
      throw new Error("COS credentials expired or insufficient validity");
    }
    if (credentials.securityToken !== undefined) {
      if (
        !credentials.securityToken ||
        /[\r\n]/.test(credentials.securityToken)
      ) {
        throw new Error("COS credentials invalid");
      }
      if (asUrl) query["x-cos-security-token"] = credentials.securityToken;
      else headers["x-cos-security-token"] = credentials.securityToken;
    }
    return signCosRequest({
      method,
      pathname,
      headers,
      query,
      ...credentials,
      startsAt: now,
      expiresAt,
    });
  }

  private async send(
    method: "GET" | "HEAD" | "PUT",
    pathname: string,
    maxResponseBytes: number,
    body?: Buffer,
    query: Record<string, string> = {},
  ): Promise<CosHttpResponse> {
    const url = new URL(pathname, this.endpoint);
    const headers: Record<string, string> = {
      host: url.host,
      "accept-encoding": "identity",
    };
    if (body !== undefined) {
      headers["content-type"] = "image/webp";
      headers["content-length"] = String(body.length);
      headers["content-md5"] = createHash("md5").update(body).digest("base64");
      headers["x-cos-forbid-overwrite"] = "true";
    }
    headers.authorization = await this.authorization(
      method,
      pathname,
      headers,
      query,
      false,
    );
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value);
    try {
      const response = await this.sender({
        url,
        method,
        headers,
        timeoutMs: this.timeout,
        maxResponseBytes,
        ...(body === undefined ? {} : { body }),
      });
      if (response.body.length > maxResponseBytes)
        throw new Error("COS response exceeds byte limit");
      return response;
    } catch {
      // Underlying errors can contain full signed URLs, request headers or keys.
      throw new Error("COS request failed; verify state before retrying");
    }
  }

  async verifyObject(objectKey: string): Promise<VerifiedPilotCosObject> {
    const expected = this.object(objectKey);
    const response = await this.send(
      "GET",
      `/${objectKey}`,
      expected.sizeBytes,
    );
    if (
      response.statusCode !== 200 ||
      response.body.length !== expected.sizeBytes ||
      sha256(response.body) !== expected.sha256
    ) {
      throw new Error("COS object content conflicts with the Pilot manifest");
    }
    return {
      objectKey,
      sha256: expected.sha256,
      sizeBytes: expected.sizeBytes,
      verifiedAt: new Date(this.now()).toISOString(),
      outcome: "reused",
    };
  }

  private async assertNeverVersioned(): Promise<void> {
    // COS forbid-overwrite does not protect a versioned or suspended bucket.
    // https://cloud.tencent.com/document/product/436/19888 and /436/7749
    const response = await this.send("GET", "/", 4096, undefined, {
      versioning: "",
    });
    const xml = response.body
      .toString("utf8")
      .trim()
      .replace(/^<\?xml[^?]*\?>\s*/, "");
    if (
      response.statusCode !== 200 ||
      !/^<VersioningConfiguration\s*(?:xmlns=["']http:\/\/cos\.myqcloud\.com\/doc\/2006-03-01\/["']\s*)?(?:\/>|>\s*<\/VersioningConfiguration>)$/.test(
        xml,
      )
    ) {
      throw new Error("COS upload requires a verified never-versioned bucket");
    }
  }

  async ensureObject(
    objectKey: string,
    bytes: Buffer,
  ): Promise<VerifiedPilotCosObject> {
    const expected = this.object(objectKey);
    // Copy before asynchronous work so callers cannot change bytes after hashing.
    if (bytes.length !== expected.sizeBytes)
      throw new Error("COS input size mismatch");
    const body = Buffer.from(bytes);
    if (sha256(body) !== expected.sha256)
      throw new Error("COS input SHA-256 mismatch");
    const head = await this.send("HEAD", `/${objectKey}`, 0);
    if (head.statusCode === 200) return this.verifyObject(objectKey);
    if (head.statusCode !== 404)
      throw new Error("COS object existence could not be verified");
    await this.assertNeverVersioned();
    const put = await this.send("PUT", `/${objectKey}`, 4096, body);
    if (![200, 201, 409, 412].includes(put.statusCode)) {
      throw new Error("COS upload failed; verify state before retrying");
    }
    // Actual GET bytes, not ETag or self-declared metadata, establish integrity.
    const verified = await this.verifyObject(objectKey);
    return {
      ...verified,
      outcome:
        put.statusCode === 200 || put.statusCode === 201
          ? "uploaded"
          : "reused",
    };
  }

  createStorageUrlResolver() {
    return {
      resolveMany: async <MediaIdentity extends string>(
        locators: readonly {
          readonly mediaId: MediaIdentity;
          readonly objectKey: string;
        }[],
      ): Promise<ReadonlyMap<MediaIdentity, string>> => {
        const result = new Map<MediaIdentity, string>();
        for (const locator of locators) {
          const expected = this.objects.get(locator.objectKey);
          if (!expected || expected.mediaId !== locator.mediaId) continue;
          const pathname = `/${locator.objectKey}`;
          const url = new URL(pathname, this.mediaOrigin);
          // Signing per read avoids caching already-expired URL values. The HTTP
          // composition must also mark Pilot API responses Cache-Control: no-store.
          const query: Record<string, string> = {
            "response-cache-control": "no-store",
          };
          const authorization = await this.authorization(
            "GET",
            pathname,
            { host: url.host },
            query,
            true,
          );
          for (const [key, value] of Object.entries(query))
            url.searchParams.set(key, value);
          for (const [key, value] of new URLSearchParams(authorization))
            url.searchParams.set(key, value);
          result.set(locator.mediaId, url.toString());
        }
        return result;
      },
    };
  }
}
