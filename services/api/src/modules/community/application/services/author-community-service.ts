import { CommunityNotFoundError } from "../errors/community-request-errors.js";
import type { AuthorCommunityPort } from "../ports/author-community-port.js";
import type { CatalogPublicationPort } from "../ports/catalog-publication-port.js";
import type {
  DiscussionPort,
  DiscussionQuery,
} from "../ports/discussion-port.js";
import type {
  CommunityDiscoveryPort,
  DiscoveryCardRecord,
} from "../ports/community-discovery-port.js";
import type { StorageUrlResolver } from "../../../catalog/application/ports/storage-url-resolver.js";
import type {
  AuthorListQuery,
  ContentCard,
  DiscoveryQuery,
  CatalogId,
  ContentIdentity,
  ContentRelationUpdate,
} from "@moya/contracts";

/** Public application boundary; the adapter enforces transactional ownership. */
export class AuthorCommunityService {
  constructor(
    readonly port: AuthorCommunityPort,
    private readonly catalog: CatalogPublicationPort,
    readonly discussion?: DiscussionPort,
    readonly discovery?: CommunityDiscoveryPort,
    private readonly mediaResolver?: StorageUrlResolver,
  ) {}
  private async cards(
    items: readonly DiscoveryCardRecord[],
  ): Promise<ContentCard[]> {
    const locators = items.flatMap((item) =>
      item.media?.type === "catalog"
        ? [{ mediaId: item.media.id, objectKey: item.media.objectKey }]
        : [],
    );
    if (locators.length && !this.mediaResolver)
      throw new CommunityNotFoundError("Media unavailable");
    const urls = await this.mediaResolver?.resolveMany(locators);
    return items.map((item) => {
      const m = item.media;
      if (!m) return { ...item, media: null };
      const src =
        m.type === "work" ? `/api/community/media/${m.id}` : urls?.get(m.id);
      if (!src) throw new CommunityNotFoundError("Media unavailable");
      return {
        ...item,
        media: { id: m.id, width: m.width, height: m.height, src },
      };
    });
  }
  async browse(viewer: string | null, query: DiscoveryQuery) {
    if (!this.discovery) throw new CommunityNotFoundError();
    const page = await this.discovery.browse(viewer, query);
    return { ...page, items: await this.cards(page.items) };
  }
  async collection(
    owner: string,
    viewer: string | null,
    list: "favorite" | "like",
    query: AuthorListQuery,
  ) {
    if (!this.discovery) throw new CommunityNotFoundError();
    const page = await this.discovery.collection(owner, viewer, list, query);
    return { ...page, items: await this.cards(page.items) };
  }
  async card(target: ContentIdentity, viewer: string | null) {
    if (!this.discovery) throw new CommunityNotFoundError();
    const [item] = await this.cards([
      await this.discovery.card(target, viewer),
    ]);
    return item!;
  }
  async profile(id: string, viewer: string | null) {
    const profile = await this.port.readProfile(id, viewer);
    if (!this.discovery) return profile;
    const q: AuthorListQuery = {
      page: 1,
      pageSize: 1,
      kind: "all",
      search: "",
    };
    const totals = { ...profile.totals };
    if (totals.favorites !== null)
      totals.favorites = (
        await this.discovery.collection(id, viewer, "favorite", q)
      ).total;
    if (totals.likes !== null)
      totals.likes = (
        await this.discovery.collection(id, viewer, "like", q)
      ).total;
    if (totals.following !== null)
      totals.following = (
        await this.port.listPeople(id, viewer, "following", q)
      ).total;
    if (totals.followers !== null)
      totals.followers = (
        await this.port.listPeople(id, viewer, "followers", q)
      ).total;
    return { ...profile, totals };
  }
  async assertTarget(
    target: ContentIdentity,
    viewer: string | null,
  ): Promise<void> {
    if (target.type === "catalog") {
      if (!(await this.catalog.isPublished(target.id as CatalogId)))
        throw new CommunityNotFoundError();
    } else {
      const work = await this.port.readWork(target.id, viewer);
      if (!work.available) throw new CommunityNotFoundError();
    }
  }
  async commentLike(
    actor: string,
    id: string,
    enabled: boolean,
    request: string,
  ) {
    if (!this.discussion) throw new CommunityNotFoundError();
    await this.assertTarget(await this.discussion.discussionTarget(id), actor);
    await this.discussion.setDiscussionLike(actor, id, enabled, request);
  }
  async ownComments(actor: string, query: DiscussionQuery) {
    if (!this.discussion) throw new CommunityNotFoundError();
    const page = await this.discussion.ownComments(actor, query);
    const items = await Promise.all(
      page.items.map(async (item) => {
        if (
          item.target?.type === "catalog" &&
          !(await this.catalog.isPublished(item.target.id as CatalogId))
        )
          return { ...item, target: null };
        return item;
      }),
    );
    return { ...page, items };
  }
  async relation(
    actor: string,
    kind: "favorite" | "like",
    input: ContentRelationUpdate,
  ): Promise<void> {
    if (
      input.enabled &&
      input.target.type === "catalog" &&
      !(await this.catalog.isPublished(input.target.id as CatalogId))
    )
      throw new CommunityNotFoundError();
    await this.port.changeRelation(actor, kind, input);
  }
}
