/** Read-only schema-family check performed before either migration family. */
export const migrationTargetProbeSql = `
SELECT
  (to_regclass('schema_migrations') IS NOT NULL OR EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = to_regclass('catalog_entries') AND relkind IN ('r', 'p')
  )) AS legacy_present,
  (to_regclass('catalogs') IS NOT NULL
    OR to_regclass('_catalogs_v') IS NOT NULL
    OR to_regclass('payload_migrations') IS NOT NULL OR EXISTS (
      SELECT 1 FROM pg_class
      WHERE oid = to_regclass('catalog_entries') AND relkind = 'v'
    )) AS payload_present
`;

export const assertMigrationTarget = (
  rows: readonly Record<string, unknown>[],
  source: "legacy" | "payload",
): void => {
  const row = rows[0];
  if (
    rows.length !== 1 ||
    typeof row?.legacy_present !== "boolean" ||
    typeof row.payload_present !== "boolean"
  )
    throw new Error("Migration target schema check failed");
  if (source === "legacy" ? row.payload_present : row.legacy_present)
    throw new Error("Migration target belongs to the other content source");
};
