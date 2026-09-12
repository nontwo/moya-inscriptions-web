import { CommunityStoreUnavailableError } from "@moya/api";

import type {
  CommunityIdentityPort,
  PublicUserRecord,
  SessionRecordInput,
} from "@moya/api";
import type { PublicUserId } from "@moya/contracts";

export const fixtureUsers = {
  active: {
    id: "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f01" as PublicUserId,
    handle: "dev-user-01",
    displayName: "拓片爱好者",
    status: "active",
  },
  second: {
    id: "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f02" as PublicUserId,
    handle: "dev-user-02",
    displayName: "拓片爱好者",
    status: "active",
  },
  suspended: {
    id: "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f03" as PublicUserId,
    handle: "dev-user-03",
    displayName: "石刻研究者",
    status: "suspended",
  },
  ordinary: {
    id: "user-0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f04" as PublicUserId,
    handle: "member-04",
    displayName: "普通用户",
    status: "active",
  },
} as const satisfies Record<string, PublicUserRecord>;

interface StoredSession extends SessionRecordInput {
  revokedAt?: Date;
}

/** Deterministic in-memory port mirroring the adapter's SQL semantics. */
export class InMemoryCommunityIdentityPort implements CommunityIdentityPort {
  readonly sessions = new Map<string, StoredSession>();
  readonly users = new Map<PublicUserId, PublicUserRecord>();
  readonly developmentAccounts = new Set<PublicUserId>();
  unavailable = false;

  constructor(
    users: readonly PublicUserRecord[] = Object.values(fixtureUsers),
    developmentAccounts: readonly PublicUserId[] = [
      fixtureUsers.active.id,
      fixtureUsers.second.id,
      fixtureUsers.suspended.id,
    ],
  ) {
    for (const user of users) this.users.set(user.id, user);
    for (const id of developmentAccounts) this.developmentAccounts.add(id);
  }

  setStatus(id: PublicUserId, status: PublicUserRecord["status"]): void {
    const user = this.users.get(id);
    if (user === undefined) throw new Error("Unknown fixture user");
    this.users.set(id, { ...user, status });
  }

  private assertAvailable(): void {
    if (this.unavailable) throw new CommunityStoreUnavailableError();
  }

  async findDevelopmentAccountByHandle(
    handle: string,
  ): Promise<PublicUserRecord | null> {
    this.assertAvailable();
    for (const user of this.users.values()) {
      if (user.handle === handle && this.developmentAccounts.has(user.id))
        return user;
    }
    return null;
  }

  async createSession(session: SessionRecordInput): Promise<void> {
    this.assertAvailable();
    if (this.sessions.has(session.tokenHash))
      throw new Error("Duplicate session token hash");
    this.sessions.set(session.tokenHash, { ...session });
  }

  async findSessionUser(
    tokenHash: string,
    now: Date,
  ): Promise<PublicUserRecord | null> {
    this.assertAvailable();
    const session = this.sessions.get(tokenHash);
    if (
      session === undefined ||
      session.revokedAt !== undefined ||
      session.expiresAt.getTime() <= now.getTime()
    )
      return null;
    return this.users.get(session.userId) ?? null;
  }

  async revokeSession(tokenHash: string, now: Date): Promise<boolean> {
    this.assertAvailable();
    const session = this.sessions.get(tokenHash);
    if (
      session === undefined ||
      session.revokedAt !== undefined ||
      session.expiresAt.getTime() <= now.getTime()
    )
      return false;
    session.revokedAt = now;
    return true;
  }

  async findUserById(id: PublicUserId): Promise<PublicUserRecord | null> {
    this.assertAvailable();
    return this.users.get(id) ?? null;
  }

  /** Mirrors the adapter: status and session revocation move together. */
  async setUserStatus(
    id: PublicUserId,
    status: PublicUserRecord["status"],
    at: Date,
  ): Promise<{
    readonly user: PublicUserRecord;
    readonly revokedSessions: number;
  } | null> {
    this.assertAvailable();
    const user = this.users.get(id);
    if (user === undefined) return null;
    const updated = { ...user, status };
    this.users.set(id, updated);
    let revokedSessions = 0;
    if (status === "suspended") {
      for (const session of this.sessions.values()) {
        if (
          session.userId === id &&
          session.revokedAt === undefined &&
          session.expiresAt.getTime() > at.getTime()
        ) {
          session.revokedAt = at;
          revokedSessions += 1;
        }
      }
    }
    return { user: updated, revokedSessions };
  }
}
