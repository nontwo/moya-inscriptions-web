import type { PublicUserId } from "@moya/contracts";

import type { PublicUserRecord } from "../../domain/public-user.js";

/** A session row as the Backend stores it: the raw token never reaches the port. */
export interface SessionRecordInput {
  readonly id: string;
  readonly tokenHash: string;
  readonly userId: PublicUserId;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
}

/** Application-owned identity and session port for the community namespace. */
export interface CommunityIdentityPort {
  /** Only accounts registered as Development test accounts resolve here. */
  findDevelopmentAccountByHandle(
    handle: string,
  ): Promise<PublicUserRecord | null>;

  createSession(session: SessionRecordInput): Promise<void>;

  /** The user behind an unrevoked session that has not expired at `now`. */
  findSessionUser(
    tokenHash: string,
    now: Date,
  ): Promise<PublicUserRecord | null>;

  /** Revokes an active session; false when no active session matched. */
  revokeSession(tokenHash: string, now: Date): Promise<boolean>;

  findUserById(id: PublicUserId): Promise<PublicUserRecord | null>;

  /**
   * Suspension refuses new writes and revokes the user's active sessions in one
   * transaction; it changes no comment's moderation state. Null when unknown.
   */
  setUserStatus(
    id: PublicUserId,
    status: PublicUserRecord["status"],
    at: Date,
  ): Promise<{
    readonly user: PublicUserRecord;
    readonly revokedSessions: number;
  } | null>;
}
