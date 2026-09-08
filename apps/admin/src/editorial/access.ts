import type { Access, PayloadRequest, Where } from "payload";

import { EditorialError } from "./errors";

export const isOwner = (req: PayloadRequest): boolean =>
  req.user?.collection === "users" && req.user.role === "owner";

export const isAutomation = (req: PayloadRequest): boolean =>
  req.user?.collection === "users" && req.user.role === "automation";

export const catalogScope = (req: PayloadRequest): string[] => {
  const value: unknown =
    req.user?.collection === "users" ? req.user.scopeCatalogIds : undefined;
  return Array.isArray(value) && value.every((id) => typeof id === "string")
    ? value
    : [];
};

export const canEditCatalog = (
  req: PayloadRequest,
  catalogId: string,
): boolean =>
  isOwner(req) || (isAutomation(req) && catalogScope(req).includes(catalogId));

export const requireActor = (req: PayloadRequest) => {
  if (
    req.user?.collection !== "users" ||
    !["owner", "automation"].includes(req.user.role)
  ) {
    throw new EditorialError("AUTHORIZATION_REQUIRED", 403);
  }
  return req.user;
};

export const catalogScopeAccess = (req: PayloadRequest): boolean | Where => {
  if (isOwner(req)) return true;
  if (!isAutomation(req) || catalogScope(req).length === 0) return false;
  return { catalogId: { in: catalogScope(req) } };
};

const scoped: Access = ({ req }) => catalogScopeAccess(req);

export const catalogAccess = {
  create: ({ req }: { req: PayloadRequest }) =>
    isOwner(req) || isAutomation(req),
  delete: () => false,
  read: scoped,
  readVersions: scoped,
  update: scoped,
};
