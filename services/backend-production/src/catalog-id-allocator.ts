import { randomUUID } from "node:crypto";

/** Platform composition policy. The importer core owns neither this format nor this allocator. */
export const platformCatalogIdAllocator = {
  allocateCatalogId: () => `catalog-${randomUUID()}`,
};
