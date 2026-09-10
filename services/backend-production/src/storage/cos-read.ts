import { createCosSdk } from "./cos-sdk.js";

import type { CosSdkDependencies } from "./cos-sdk.js";

export interface CosCredentials {
  readonly secretId: string;
  readonly secretKey: string;
  readonly securityToken?: string;
  /** Unix seconds. Required when a temporary securityToken is supplied. */
  readonly expiresAt?: number;
}

export interface CosReadOptions {
  readonly bucket: string;
  readonly region: string;
  /** An independently verified, bucket-bound HTTPS origin. Backend-only. */
  readonly mediaOrigin: string;
  readonly credentials: () => Promise<CosCredentials>;
  readonly signedUrlTtlSeconds?: number;
  readonly requestTimeoutMs?: number;
}

export type CosReadDependencies = CosSdkDependencies & {
  readonly now?: () => number;
};

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

/** Shared official-SDK initialization and short-lived signing, without upload
 * or Pilot identity/manifest policy. Callers authorize object keys first.
 */
export class CosReadUrlSigner {
  private readonly origin: URL;
  private readonly ttl: number;
  private readonly timeout: number;
  private readonly now: () => number;

  constructor(
    private readonly options: CosReadOptions,
    private readonly dependencies: CosReadDependencies = {},
  ) {
    if (
      !/^[a-z0-9][a-z0-9-]{1,49}-[0-9]{5,20}$/.test(options.bucket) ||
      !/^[a-z]{2}-[a-z]+(?:-[a-z]+)?$/.test(options.region)
    ) {
      throw new Error("COS bucket or region invalid");
    }
    this.origin = httpsOrigin(options.mediaOrigin);
    this.ttl = options.signedUrlTtlSeconds ?? 300;
    this.timeout = options.requestTimeoutMs ?? 30_000;
    this.now = dependencies.now ?? Date.now;
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
  }

  async sdk() {
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
      now < 0 ||
      (credentials.expiresAt !== undefined &&
        !Number.isSafeInteger(credentials.expiresAt)) ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt - now < 30 ||
      (credentials.securityToken !== undefined &&
        credentials.expiresAt === undefined)
    ) {
      throw new Error("COS credentials expired or insufficient validity");
    }
    if (
      !/^[A-Za-z0-9_-]+$/.test(credentials.secretId) ||
      !credentials.secretKey ||
      /[\r\n]/.test(credentials.secretKey) ||
      (credentials.securityToken !== undefined &&
        (!credentials.securityToken ||
          /[\r\n]/.test(credentials.securityToken)))
    ) {
      throw new Error("COS credentials invalid");
    }
    return {
      ...createCosSdk(
        {
          secretId: credentials.secretId,
          secretKey: credentials.secretKey,
          startsAt: now,
          expiresAt,
          timeoutMs: this.timeout,
        },
        this.dependencies,
      ),
      securityToken: credentials.securityToken,
      expiresIn: expiresAt - now,
    };
  }

  async sign(objectKey: string): Promise<string> {
    // Keys come from the authorized database projection, never request input.
    // Preserve Unicode, spaces and literal percent characters without rewriting.
    if (
      !objectKey ||
      objectKey.length > 2048 ||
      objectKey.includes("\\") ||
      [...objectKey].some((character) => {
        const code = character.charCodeAt(0);
        return code < 32 || code === 127;
      }) ||
      objectKey
        .split("/")
        .some((part) => !part || part === "." || part === "..")
    )
      throw new Error("COS object key invalid");
    return new Promise<string>((resolve, reject) => {
      const deadline = setTimeout(
        () => reject(new Error("COS URL signing failed")),
        this.timeout,
      );
      const complete = async () => {
        const sdk = await this.sdk();
        const query: Record<string, string> = {
          "response-cache-control": "no-store",
        };
        if (sdk.securityToken)
          query["x-cos-security-token"] = sdk.securityToken;
        return new Promise<string>((signed, failed) => {
          sdk.client.getObjectUrl(
            {
              Bucket: this.options.bucket,
              Region: this.options.region,
              Key: objectKey,
              Domain: this.origin.host,
              Protocol: "https:",
              Method: "GET",
              Sign: true,
              Expires: sdk.expiresIn,
              Query: query,
            },
            (error, data) => {
              if (error) failed(new Error("COS URL signing failed"));
              else signed(data.Url);
            },
          );
        });
      };
      void complete()
        .then(resolve, (error: unknown) => {
          // Credentials errors are intentionally bounded messages from sdk().
          if (
            error instanceof Error &&
            /^COS credentials (unavailable|expired or insufficient validity|invalid)$/.test(
              error.message,
            )
          )
            reject(error);
          else reject(new Error("COS URL signing failed"));
        })
        .finally(() => clearTimeout(deadline));
    });
  }
}
