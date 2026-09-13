import type { ContentCard, ContentIdentity } from "@moya/contracts";
import { AuthorRequestError } from "./author-data";

/** Public metadata reads only; local favorites/search never become a server
 * collection. Resolve before filtering/paging, with at most twelve in flight. */
export const resolveLocalContent = async (
  targets: readonly ContentIdentity[],
  read: (target: ContentIdentity) => Promise<ContentCard>,
  search: string,
  kind: string,
  current: () => boolean = () => true,
): Promise<ContentCard[]> => {
  const items: ContentCard[] = [];
  const needle = search.trim().normalize("NFKC").toLowerCase();
  for (let offset = 0; offset < targets.length; offset += 12) {
    if (!current()) return [];
    const batch = await Promise.all(
      targets.slice(offset, offset + 12).map((target) =>
        read(target).catch((error: unknown) => {
          if (error instanceof AuthorRequestError && error.status === 404)
            return null;
          throw error;
        }),
      ),
    );
    for (const item of batch) {
      if (!item || (kind !== "all" && item.kind !== kind)) continue;
      if (
        needle &&
        ![item.title, ...item.aliases].some((text) =>
          text.normalize("NFKC").toLowerCase().includes(needle),
        )
      )
        continue;
      items.push(item);
    }
  }
  return items;
};
