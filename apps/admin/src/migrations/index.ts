import * as migration_20260908_030835_p2_04_initial from "./20260908_030835_p2_04_initial";
import * as migration_20260908_031500_published_views from "./20260908_031500_published_views";
import * as migration_20260908_035348_p2_04_identity_claims from "./20260908_035348_p2_04_identity_claims";
import * as migration_20260908_120000_published_search from "./20260908_120000_published_search";

export const migrations = [
  {
    up: migration_20260908_030835_p2_04_initial.up,
    down: migration_20260908_030835_p2_04_initial.down,
    name: "20260908_030835_p2_04_initial",
  },
  {
    up: migration_20260908_031500_published_views.up,
    down: migration_20260908_031500_published_views.down,
    name: "20260908_031500_published_views",
  },
  {
    up: migration_20260908_035348_p2_04_identity_claims.up,
    down: migration_20260908_035348_p2_04_identity_claims.down,
    name: "20260908_035348_p2_04_identity_claims",
  },
  {
    up: migration_20260908_120000_published_search.up,
    down: migration_20260908_120000_published_search.down,
    name: "20260908_120000_published_search",
  },
];
