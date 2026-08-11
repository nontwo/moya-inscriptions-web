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
  Object.freeze({
    migrationId: "20260811023250",
    filename: "20260811023250_retire_cliff_inscription_kind.sql",
    checksum:
      "52fedfe4a722b89a3062d11e17e494f424a35bca9e4faf2f6eabe54846d20ac7",
  }),
]);
