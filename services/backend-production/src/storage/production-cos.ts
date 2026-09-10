import { CosReadUrlSigner } from "./cos-read.js";

import type { CosReadDependencies, CosReadOptions } from "./cos-read.js";
import type { RuntimeEnvironment } from "@moya/backend-runtime";

/** Backend-only: callers must keep the returned signed URLs behind the public
 * media delivery boundary. Authorization is the published database projection,
 * with no Pilot manifest, object limit or upload capability.
 */
export class ProductionCosStorageUrlResolver {
  private readonly signer: CosReadUrlSigner;

  constructor(options: CosReadOptions, dependencies: CosReadDependencies = {}) {
    this.signer = new CosReadUrlSigner(options, dependencies);
  }

  async resolveMany<MediaIdentity extends string>(
    locators: readonly {
      readonly mediaId: MediaIdentity;
      readonly objectKey: string;
    }[],
  ): Promise<ReadonlyMap<MediaIdentity, string>> {
    const result = new Map<MediaIdentity, string>();
    for (const locator of locators) {
      result.set(locator.mediaId, await this.signer.sign(locator.objectKey));
    }
    return result;
  }
}

/** Validation happens before database initialization and makes no cloud call. */
export function productionCosOptions(
  environment: RuntimeEnvironment,
): CosReadOptions {
  const required = (key: string): string => {
    const value = environment[key];
    if (!value || value.trim() !== value)
      throw new Error(
        `Production COS configuration missing or invalid: ${key}`,
      );
    return value;
  };
  const integer = (key: string): number => {
    const value = required(key);
    if (!/^[1-9]\d*$/.test(value))
      throw new Error(`Production COS configuration invalid: ${key}`);
    return Number(value);
  };
  const secretId = required("COS_SECRET_ID");
  const secretKey = required("COS_SECRET_KEY");
  if (!/^[A-Za-z0-9_-]+$/.test(secretId) || /[\r\n]/.test(secretKey))
    throw new Error("Production COS credentials invalid");
  const temporary =
    environment.COS_SECURITY_TOKEN === undefined
      ? {}
      : {
          securityToken: required("COS_SECURITY_TOKEN"),
          expiresAt: integer("COS_CREDENTIAL_EXPIRES_AT"),
        };
  if (temporary.securityToken && /[\r\n]/.test(temporary.securityToken))
    throw new Error("Production COS credentials invalid");
  return {
    bucket: required("COS_BUCKET"),
    region: required("COS_REGION"),
    mediaOrigin: required("COS_MEDIA_ORIGIN"),
    credentials: async () => ({ secretId, secretKey, ...temporary }),
    ...(environment.COS_SIGNED_URL_TTL_SECONDS === undefined
      ? {}
      : { signedUrlTtlSeconds: integer("COS_SIGNED_URL_TTL_SECONDS") }),
    ...(environment.COS_REQUEST_TIMEOUT_MS === undefined
      ? {}
      : { requestTimeoutMs: integer("COS_REQUEST_TIMEOUT_MS") }),
  };
}
