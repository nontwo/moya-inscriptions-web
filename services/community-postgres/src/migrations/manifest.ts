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
    Object.freeze({
      migrationId: "20260914090000",
      filename: "20260914090000_work_publishing_storage.sql",
      checksum:
        "c62bc3cd53e5704023905a70193ac7f304dfe7ab97c06fa0cf57f1975f1e4c21",
    }),
    Object.freeze({
      migrationId: "20260914091000",
      filename: "20260914091000_work_publishing_revisions.sql",
      checksum:
        "cfaedc3fd5396610c636500b169c206cdc351c4542842170c4efde269aeac148",
    }),
    Object.freeze({
      migrationId: "20260914092000",
      filename: "20260914092000_work_publishing_legacy_backfill.sql",
      checksum:
        "cb6238b56dd6f92b219a04f78443522a818010893f25cac4754f4c2e136aecba",
    }),
    Object.freeze({
      migrationId: "20260914093000",
      filename: "20260914093000_work_publishing_legacy_bridge.sql",
      checksum:
        "b5312208eb20df808b6e070748de4d377d84b105c123688b2b5882d1c98893fc",
    }),
    Object.freeze({
      migrationId: "20260914094000",
      filename: "20260914094000_work_publishing_legacy_authorship.sql",
      checksum:
        "c319ca35973bfbba07e9b112410e6e6eb994f3005ec485ad7fcb65f78055be6d",
    }),
    Object.freeze({
      migrationId: "20260915010000",
      filename: "20260915010000_featured_users.sql",
      checksum:
        "582b4c7f66cd8aec707ccaf89ff1969c567efc80640f89c5d3dcd5924e4143de",
    }),
    Object.freeze({
      migrationId: "20260916010000",
      filename: "20260916010000_community_access_indexes.sql",
      checksum:
        "3e19ec9a70f771d0207adb316d9c7dc171e073d348c1537f013876621b12d876",
    }),
    Object.freeze({
      migrationId: "20260916011000",
      filename: "20260916011000_receipt_timestamps.sql",
      checksum:
        "87555ee7e65f4537174bfb78dd1fb63a3cb738cf51a66658cb23791ebdb2f79d",
    }),
    Object.freeze({
      migrationId: "20260917010000",
      filename: "20260917010000_agent_administration.sql",
      checksum:
        "385bf7ca8c83241696d55ce5ba7d4ee53ac842da140a11fe78a00e0608a4c273",
    }),
    Object.freeze({
      migrationId: "20260917020000",
      filename: "20260917020000_agent_operation_criteria.sql",
      checksum:
        "91041dc7622e09169483b99b143a281d1a22518812916476914800e972c69350",
    }),
    Object.freeze({
      migrationId: "20260918010000",
      filename: "20260918010000_agent_connections.sql",
      checksum:
        "4813d376cc3f42430e1ba8cd7cc0af78675438e4fb96bf333d12c8435d7ff636",
    }),
    Object.freeze({
      migrationId: "20260918020000",
      filename: "20260918020000_agent_connection_provider_artifacts.sql",
      checksum:
        "ee7e7f095caf29e8dbee791860ccb355a6089df29132863f3ab1e894090f8320",
    }),
    Object.freeze({
      migrationId: "20260918030000",
      filename: "20260918030000_agent_connection_invariants.sql",
      checksum:
        "0129df8e9fbbbc34bc2b547e9a175439ea86e4028a297a3914373c91d7603202",
    }),
    Object.freeze({
      migrationId: "20260918040000",
      filename: "20260918040000_agent_connection_ledger_integrity.sql",
      checksum:
        "d77c3ec55f486e4fe4a0824a8c66a6fc82a3143eafc2c355985a6e48e0de7a6a",
    }),
    Object.freeze({
      migrationId: "20260918050000",
      filename: "20260918050000_agent_connection_destroyed_at_terminal.sql",
      checksum:
        "2697a0a800117c5e577de54d3c0c404a3118b6fabd4b50acba819c06a81351ea",
    }),
    Object.freeze({
      migrationId: "20260920010000",
      filename: "20260920010000_agent_connection_principal_identity.sql",
      checksum:
        "65584b1a8000ad2879e98daade02e43d0c706ec479036bbb0d5f7378ade84a37",
    }),
    Object.freeze({
      migrationId: "20260920020000",
      filename: "20260920020000_agent_connection_consent.sql",
      checksum:
        "275c00b664f741e509271a3c0eddefb4005b1287906fba121c4383ab56cdab8e",
    }),
  ]);
