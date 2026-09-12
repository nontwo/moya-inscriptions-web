import type { PublicUserProfile } from "@moya/contracts";

import { mapPublicUserProfile } from "../mappers/community-public-contract-mapper.js";
import {
  defaultRandomBytes,
  generateSessionId,
  generateSessionToken,
  hashSessionToken,
  isSessionTokenShape,
} from "../session-token.js";

import type { CommunityIdentityPort } from "../ports/community-identity-port.js";
import type { RandomBytes } from "../session-token.js";

export interface CommunitySessionServiceOptions {
  readonly clock?: () => Date;
  /** Absolute session lifetime; sessions do not slide. */
  readonly sessionTtlMs?: number;
  readonly randomBytes?: RandomBytes;
}

/**
 * The one-time result of a Development sign-in. It is handed to the transport
 * layer, which validates it with the server-only Development session schema;
 * it is not a root Public DTO and the raw token appears nowhere else.
 */
export interface DevelopmentSessionGrant {
  readonly token: string;
  readonly expiresAt: string;
  readonly profile: PublicUserProfile;
}

const defaultSessionTtlMs = 7 * 24 * 60 * 60 * 1_000;
const maximumSessionTtlMs = 30 * 24 * 60 * 60 * 1_000;

/**
 * Backend-owned session lifecycle: issuance for Development test accounts,
 * validation on every request, absolute expiry and revocation. Web never
 * mints, decodes or validates a session.
 */
export class CommunitySessionService {
  private readonly clock: () => Date;
  private readonly sessionTtlMs: number;
  private readonly randomBytes: RandomBytes;

  constructor(
    private readonly identityPort: CommunityIdentityPort,
    options: CommunitySessionServiceOptions = {},
  ) {
    const ttl = options.sessionTtlMs ?? defaultSessionTtlMs;
    if (!Number.isSafeInteger(ttl) || ttl <= 0 || ttl > maximumSessionTtlMs)
      throw new Error("Session lifetime must be a positive bounded integer");
    this.clock = options.clock ?? (() => new Date());
    this.sessionTtlMs = ttl;
    this.randomBytes = options.randomBytes ?? defaultRandomBytes;
  }

  /** Development-only support operation; null means no such active test account. */
  async signInDevelopmentAccount(
    handle: string,
  ): Promise<DevelopmentSessionGrant | null> {
    const user = await this.identityPort.findDevelopmentAccountByHandle(handle);
    if (user === null || user.status !== "active") return null;
    const token = generateSessionToken(this.randomBytes);
    const issuedAt = this.clock();
    const expiresAt = new Date(issuedAt.getTime() + this.sessionTtlMs);
    await this.identityPort.createSession({
      id: generateSessionId(this.randomBytes),
      tokenHash: await hashSessionToken(token),
      userId: user.id,
      issuedAt,
      expiresAt,
    });
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      profile: mapPublicUserProfile(user),
    };
  }

  /** The session owner's profile, or null for a missing, malformed, expired, revoked or suspended session. */
  async identify(token: string): Promise<PublicUserProfile | null> {
    if (!isSessionTokenShape(token)) return null;
    const user = await this.identityPort.findSessionUser(
      await hashSessionToken(token),
      this.clock(),
    );
    if (user === null || user.status !== "active") return null;
    return mapPublicUserProfile(user);
  }

  /** Revokes the session behind the token; false when it was not active. */
  async signOut(token: string): Promise<boolean> {
    if (!isSessionTokenShape(token)) return false;
    return this.identityPort.revokeSession(
      await hashSessionToken(token),
      this.clock(),
    );
  }
}
