export interface RequiredMigration {
  readonly migrationId: string;
  readonly filename: string;
  readonly checksum: string;
}

export const requiredMigrations: readonly RequiredMigration[] = Object.freeze([
  Object.freeze({
    migrationId: "20260811005348",
    filename: "20260811005348_catalog_read_model.sql",
    checksum:
      "4355c6a64f313bf2733078835112e04b370140824c77544e9e2026b8d4fa99ec",
  }),
]);
