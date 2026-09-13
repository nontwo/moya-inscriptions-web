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
            readonly id: string;
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
