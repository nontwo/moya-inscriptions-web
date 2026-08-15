/** Internal availability signal for required Catalog Media URL resolution. */
export class CatalogMediaResolutionError extends Error {
  override readonly name = "CatalogMediaResolutionError";

  constructor(options: { readonly cause?: unknown } = {}) {
    super("Catalog Media URL resolution is unavailable", options);
  }
}

export const isCatalogMediaResolutionError = (
  error: unknown,
): error is CatalogMediaResolutionError =>
  error instanceof CatalogMediaResolutionError;
