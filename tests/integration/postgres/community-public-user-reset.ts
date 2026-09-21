/**
 * Reset of the community public-user graph for the PostgreSQL suites.
 *
 * `community-postgres.test.ts` starts from exactly the three seeded
 * Development accounts, so its `beforeAll` empties `community.public_users`
 * before it applies the seed. That DELETE is blocked by every row still
 * referencing a user, and the reset used to name the referencing tables by
 * hand: catalog_comment_replies, catalog_comments, sessions and
 * development_accounts. Twenty-two foreign keys reference `public_users`, so
 * the hand-kept list was already short by seventeen tables, and it went stale
 * twice more as tables were added.
 *
 * The suites that create their own actors delete only their own rows
 * (`WHERE actor_id = ANY($1)`), which is correct while a run completes: an
 * interrupted run leaves those rows behind for an actor nobody will clean up
 * again. `community.author_command_receipts` and
 * `community.discovery_sequences` were two such tables, so the next run failed
 * in `beforeAll`, before a single test executed, and stayed failing until the
 * database was emptied by hand. CI never reproduced it, because CI creates the
 * database fresh for every run and never inherits the debris.
 *
 * The list is therefore derived from `pg_constraint` on each run instead of
 * being written down. A table added tomorrow with a foreign key to
 * `public_users` is covered the moment it exists, and no future migration can
 * make this reset stale again.
 */
import type { createPostgresPool } from "@moya/catalog-postgres";

/** The table the graph is rooted at; everything reachable from it is reset. */
export const PUBLIC_USER_TABLE = "community.public_users";

/**
 * Every table that references the root, transitively: the children of
 * `public_users`, their own children, and so on. `UNION` (not `UNION ALL`)
 * terminates the walk on the cycles the schema contains — `user_media.owner_id`
 * references `public_users`, and `public_users.avatar_media_id` references
 * `user_media` back.
 *
 * Names are assembled from `pg_namespace` and `pg_class` through
 * `quote_ident`, not from `regclass`, whose text form drops the schema
 * whenever the schema happens to sit on the search path.
 */
const DEPENDENT_TABLES = `
  WITH RECURSIVE dependents(oid) AS (
    SELECT $1::regclass::oid
    UNION
    SELECT reference.conrelid
    FROM pg_constraint reference
    JOIN dependents ON reference.confrelid = dependents.oid
    WHERE reference.contype = 'f'
  )
  SELECT quote_ident(namespace.nspname) || '.' || quote_ident(class.relname) AS table_name
  FROM dependents
  JOIN pg_class class ON class.oid = dependents.oid
  JOIN pg_namespace namespace ON namespace.oid = class.relnamespace
  WHERE class.relkind IN ('r', 'p')
  ORDER BY table_name`;

/**
 * The tables a reset has to empty, root included, in a stable order. Exported
 * so a suite can assert what the reset covers without performing one.
 */
export const communityPublicUserDependents = async (
  pool: ReturnType<typeof createPostgresPool>,
): Promise<readonly string[]> => {
  const { rows } = await pool.query<{ table_name: string }>(DEPENDENT_TABLES, [
    PUBLIC_USER_TABLE,
  ]);
  if (rows.length === 0)
    throw new Error(
      `${PUBLIC_USER_TABLE} resolved to no table: the community migrations have not been applied to this database`,
    );
  return rows.map((row) => row.table_name);
};

/**
 * Empties `community.public_users` and everything that references it, leaving
 * the caller to apply the Development seed.
 *
 * One TRUNCATE, because the tables reference each other in both directions and
 * no DELETE order satisfies both sides of the `public_users` / `user_media`
 * cycle. Identity is not restarted: the suites assert on ids they supply
 * themselves, and a restart would move the sequences they do not.
 *
 * Returns the tables it emptied.
 */
export const resetCommunityPublicUsers = async (
  pool: ReturnType<typeof createPostgresPool>,
): Promise<readonly string[]> => {
  const tables = await communityPublicUserDependents(pool);
  // The identifiers come from pg_catalog through quote_ident, never from a
  // caller. CASCADE is deliberately absent: the derivation above is the whole
  // closure, so a table it somehow missed must fail here by name instead of
  // being truncated silently along with whatever else references it. PostgreSQL
  // names that table in DETAIL, which a test reporter shows only for the
  // message, so the two are joined into one.
  try {
    await pool.query(`TRUNCATE ${tables.join(", ")}`);
  } catch (cause) {
    const { detail, hint } = cause as { detail?: string; hint?: string };
    throw new Error(
      [
        `resetting ${PUBLIC_USER_TABLE} and the ${tables.length - 1} tables derived as referencing it failed`,
        (cause as Error).message,
        detail,
        hint,
      ]
        .filter(Boolean)
        .join(" — "),
      { cause },
    );
  }
  return tables;
};
