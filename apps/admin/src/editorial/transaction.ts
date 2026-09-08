import { sql, type PostgresAdapter } from "@payloadcms/db-postgres";
import type { PayloadRequest } from "payload";

import { EditorialError } from "./errors";

/** Uses the exact Payload transaction; falling back to the pool is unsafe. */
export const lockEditorialKey = async (
  req: PayloadRequest,
  key: string,
): Promise<void> => {
  const transactionID = await req.transactionID;
  if (!transactionID) throw new EditorialError("TRANSACTION_REQUIRED", 503);
  const adapter = req.payload.db as unknown as Pick<
    PostgresAdapter,
    "sessions"
  >;
  const session = adapter.sessions?.[String(transactionID)];
  if (!session) throw new EditorialError("TRANSACTION_REQUIRED", 503);
  try {
    await session.db.execute(sql`SET LOCAL lock_timeout = '5s'`);
    await session.db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${`moya-editorial:${key}`}, 0))`,
    );
  } catch {
    throw new EditorialError("CONCURRENT_OPERATION_BUSY", 409);
  }
};

export const withEditorialTransaction = async <T>(
  req: PayloadRequest,
  work: () => Promise<T>,
): Promise<T> => {
  if (req.transactionID) return work();
  const transactionID = await req.payload.db.beginTransaction();
  if (!transactionID) throw new EditorialError("TRANSACTION_REQUIRED", 503);
  req.transactionID = transactionID;
  try {
    const result = await work();
    await req.payload.db.commitTransaction(transactionID);
    return result;
  } catch (error) {
    await req.payload.db.rollbackTransaction(transactionID);
    throw error;
  } finally {
    delete req.transactionID;
  }
};
