import { asCommunityOperationError } from "./availability.js";
import {
  findDevelopmentAccountByHandleSql,
  findSessionUserSql,
  insertSessionSql,
  revokeSessionSql,
} from "./queries.js";
import { mapPublicUserRow } from "./row-mapper.js";

import type { PublicUserRow } from "./row-mapper.js";
import type {
  CommunityIdentityPort,
  PublicUserRecord,
  SessionRecordInput,
} from "@moya/api";
import type { Pool } from "pg";

/** App-role adapter: DML only on the community namespace, never DDL. */
export class PostgresCommunityIdentityAdapter implements CommunityIdentityPort {
  constructor(private readonly pool: Pool) {}

  async findDevelopmentAccountByHandle(
    handle: string,
  ): Promise<PublicUserRecord | null> {
    const result = await this.query<PublicUserRow>(
      findDevelopmentAccountByHandleSql,
      [handle],
    );
    const row = result[0];
    return row === undefined ? null : mapPublicUserRow(row);
  }

  async createSession(session: SessionRecordInput): Promise<void> {
    await this.query(insertSessionSql, [
      session.id,
      session.tokenHash,
      session.userId,
      session.issuedAt,
      session.expiresAt,
    ]);
  }

  async findSessionUser(
    tokenHash: string,
    now: Date,
  ): Promise<PublicUserRecord | null> {
    const result = await this.query<PublicUserRow>(findSessionUserSql, [
      tokenHash,
      now,
    ]);
    const row = result[0];
    return row === undefined ? null : mapPublicUserRow(row);
  }

  async revokeSession(tokenHash: string, now: Date): Promise<boolean> {
    const client = await this.connect();
    try {
      const result = await client.query(revokeSessionSql, [tokenHash, now]);
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      throw asCommunityOperationError(error, "query");
    } finally {
      client.release();
    }
  }

  private async connect() {
    try {
      return await this.pool.connect();
    } catch (error) {
      throw asCommunityOperationError(error, "connect");
    }
  }

  private async query<Row extends PublicUserRow = PublicUserRow>(
    sql: string,
    values: readonly unknown[],
  ): Promise<readonly Row[]> {
    const client = await this.connect();
    try {
      const result = await client.query<Row>(sql, [...values]);
      return result.rows;
    } catch (error) {
      throw asCommunityOperationError(error, "query");
    } finally {
      client.release();
    }
  }
}
