/** Internal availability signal for community identity adapters. */
export class CommunityStoreUnavailableError extends Error {
  override readonly name = "CommunityStoreUnavailableError";

  constructor(options: { readonly cause?: unknown } = {}) {
    super("Community store is unavailable", options);
  }
}

export const isCommunityStoreUnavailableError = (
  error: unknown,
): error is CommunityStoreUnavailableError =>
  error instanceof CommunityStoreUnavailableError;
