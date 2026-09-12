export { PostgresCommunityIdentityAdapter } from "./adapter.js";
export { asCommunityOperationError } from "./availability.js";
export { requiredCommunityMigrations } from "./migrations/manifest.js";
export {
  CommunityMigrationStateError,
  CommunitySchemaNotReadyError,
  readCommunityMigrationFiles,
  runCommunityMigrations,
  verifyCommunityMigrationLedger,
} from "./migrations/runner.js";
export { mapPublicUserRow } from "./row-mapper.js";

export type { RequiredCommunityMigration } from "./migrations/manifest.js";
export type { CommunityMigrationFile } from "./migrations/runner.js";
export type { PublicUserRow } from "./row-mapper.js";
