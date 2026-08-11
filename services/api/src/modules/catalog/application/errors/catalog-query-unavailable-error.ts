/** Internal availability signal for Catalog read adapters. */
export class CatalogQueryUnavailableError extends Error {
  override readonly name = "CatalogQueryUnavailableError";

  constructor(options: { readonly cause?: unknown } = {}) {
    super("Catalog query service is unavailable", options);
  }
}

export const isCatalogQueryUnavailableError = (
  error: unknown,
): error is CatalogQueryUnavailableError =>
  error instanceof CatalogQueryUnavailableError;
