import type {
  AuthorListQuery,
  ContentCard,
  ContentIdentity,
  DiscoveryQuery,
  InscriptionFilterOptions,
  MediaId,
} from "@moya/contracts";
import type { AuthorPage } from "./author-community-port.js";
export type DiscoveryCardRecord = Omit<ContentCard, "media"> & {
  readonly media:
    | (
        | {
            readonly type: "catalog";
            readonly id: MediaId;
            readonly objectKey: string;
            readonly width: number;
            readonly height: number;
          }
        | {
            readonly type: "work";
            /** The media item id, or the user media id of an unedited legacy PNG. */
            readonly id: string;
            /**
             * The same-origin still path the card shows: the card derivative
             * (`/api/community/publishing/media/<itemId>/<variant>/<editKey>`,
             * the cover variant under the cover crop's edit key when it
             * exists) or, for an unedited legacy item, its Phase 4 user media
             * path (`/api/community/media/<user-media-id>`).
             */
            readonly src: string;
            readonly width: number;
            readonly height: number;
          }
      )
    | null;
};
export interface DiscoveryPageRecord {
  readonly items: readonly DiscoveryCardRecord[];
  readonly sequence: string;
  readonly nextAfter: number;
  readonly hasMore: boolean;
}
export interface CommunityDiscoveryPort {
  browse(
    viewer: string | null,
    query: DiscoveryQuery,
  ): Promise<DiscoveryPageRecord>;
  collection(
    owner: string,
    viewer: string | null,
    list: "favorite" | "like",
    query: AuthorListQuery,
  ): Promise<AuthorPage<DiscoveryCardRecord>>;
  card(
    target: ContentIdentity,
    viewer: string | null,
  ): Promise<DiscoveryCardRecord>;
  state(
    target: ContentIdentity,
    actor: string,
  ): Promise<{ favorite: boolean; liked: boolean }>;
  filterOptions(): Promise<InscriptionFilterOptions>;
}
