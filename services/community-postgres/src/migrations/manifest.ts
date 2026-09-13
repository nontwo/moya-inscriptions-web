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
    Object.freeze({
      migrationId: "20260912080000",
      filename: "20260912080000_community_direct_publication_default.sql",
      checksum:
        "21e051216b2246c716d5d97df28290e45bc181e36965e72812fc9bdf63d2ea1d",
    }),
    Object.freeze({
      migrationId: "20260912100000",
      filename: "20260912100000_community_moderation_reject_and_history.sql",
      checksum:
        "b672b6af018fdea53daf4fe405669e030fe3b1f923345686cabd3fd61ea09471",
    }),
    Object.freeze({
      migrationId: "20260913090000",
      filename: "20260913090000_author_community_foundations.sql",
      checksum:
        "36fa8fdecedd715b2f8f24d9fcb9040c776873f5b32eeedfac4050564a887d4e",
    }),
    Object.freeze({
      migrationId: "20260913100000",
      filename: "20260913100000_discussion_lifecycle.sql",
      checksum:
        "c5a3bbe7b96900d3600114ffe32f08b458fb71a6894827f3ef6f4a1aeb09dd04",
    }),
    Object.freeze({
      migrationId: "20260913110000",
      filename: "20260913110000_discovery_sequences.sql",
      checksum:
        "b1d86bce54f4b3b87a4577e21dc6290385118b5792576df25a84175bed610c11",
    }),
    Object.freeze({
      migrationId: "20260913120000",
      filename: "20260913120000_featured_operator_versions.sql",
      checksum:
        "1ec448477421f0f926b10db6461254ab2e092a7d21bc99201dc6bfa5b01063b0",
    }),
  ]);
