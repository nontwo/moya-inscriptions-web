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

/**
 * The subject exists but is not in a state the requested transition may leave
 * (someone else moderated it first, or the queue was stale). Maps to 409 on
 * the operator boundary; nothing was changed and nothing was recorded.
 */
export class CommunityConflictError extends Error {
  override readonly name = "CommunityConflictError";

  constructor(message = "Community subject is in a different state") {
    super(message);
  }
}

export const isCommunityConflictError = (
  error: unknown,
): error is CommunityConflictError => error instanceof CommunityConflictError;
