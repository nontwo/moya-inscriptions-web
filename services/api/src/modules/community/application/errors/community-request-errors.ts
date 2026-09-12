/** The submitted body failed a Contract or domain rule (maps to INVALID_INPUT). */
export class CommunityInputError extends Error {
  override readonly name = "CommunityInputError";

  constructor(message = "Community input is invalid") {
    super(message);
  }
}

export const isCommunityInputError = (
  error: unknown,
): error is CommunityInputError => error instanceof CommunityInputError;

/**
 * The Catalog record is unknown or not currently published, or the root comment
 * is unknown or not visible (maps to ITEM_NOT_FOUND).
 */
export class CommunityNotFoundError extends Error {
  override readonly name = "CommunityNotFoundError";

  constructor(message = "Community subject was not found") {
    super(message);
  }
}

export const isCommunityNotFoundError = (
  error: unknown,
): error is CommunityNotFoundError => error instanceof CommunityNotFoundError;
