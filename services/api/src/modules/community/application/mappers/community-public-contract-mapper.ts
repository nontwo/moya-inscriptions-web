import { publicUserProfileSchema } from "@moya/contracts/schemas";

import type { PublicUserProfile } from "@moya/contracts";

import type { PublicUserRecord } from "../../domain/public-user.js";

/** The only public projection of a public user; status and timestamps never leave the Backend. */
export const mapPublicUserProfile = (
  user: PublicUserRecord,
): PublicUserProfile =>
  publicUserProfileSchema.parse({
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
  });
