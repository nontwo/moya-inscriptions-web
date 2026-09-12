export interface RequiredCommunityMigration {
  readonly migrationId: string;
  readonly filename: string;
  readonly checksum: string;
}

/** Append-only community family; every applied file stays byte-identical. */
export const requiredCommunityMigrations: readonly RequiredCommunityMigration[] =
  Object.freeze([
    Object.freeze({
      migrationId: "20260912030000",
      filename: "20260912030000_community_identity_sessions.sql",
      checksum:
        "96cb752f6f36d7294b035c152c26a7337b45467df3a3c305fc42e010c772ef61",
    }),
    Object.freeze({
      migrationId: "20260912050000",
      filename: "20260912050000_community_comments_moderation.sql",
      checksum:
        "6be083ac66ebe477f893726447f168c539746198cfd96a76e6854cbe2e84f5f8",
    }),
  ]);
