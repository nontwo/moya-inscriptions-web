/**
 * Content-free rejection codes: exactly the contracts `mediaFailureCodeSchema`
 * (`PublishingMediaFailureCode`); a type-level test keeps the lists equal.
 */
export type MediaFailureCode =
  | "unsupported_type"
  | "decode_failed"
  | "dimensions_exceeded"
  | "duration_exceeded"
  | "stream_layout_unsupported"
  | "animated_image_unsupported"
  | "pairing_mismatch"
  | "size_mismatch"
  | "processing_timeout"
  | "processing_failed";

/** Deterministic content rejection: the item fails, no system retry helps. */
export class MediaRejectedError extends Error {
  constructor(readonly failureCode: MediaFailureCode) {
    super(`Publishing media rejected: ${failureCode}`);
    this.name = "MediaRejectedError";
  }
}

export type MediaParseErrorCode =
  | "truncated"
  | "box_invalid"
  | "limit_exceeded"
  | "offset_invalid"
  | "structure_invalid";

/** Bounded parser failure. Messages never contain input bytes. */
export class MediaParseError extends Error {
  constructor(readonly code: MediaParseErrorCode) {
    super(`Publishing media parse failure: ${code}`);
    this.name = "MediaParseError";
  }
}

/**
 * Malformed processing input (a programming error upstream, never a content
 * rejection): invalid ids, component layouts, edits or edit keys.
 */
export class MediaProcessingInputError extends TypeError {
  constructor() {
    super("Invalid publishing media processing input");
    this.name = "MediaProcessingInputError";
  }
}

const SYSTEM_CODE_PATTERN = /^E[A-Z0-9]{1,31}$/;

/** A system error code such as `ENOSPC` from an unknown error, else null. */
export const systemErrorCode = (error: unknown): string | null => {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  return SYSTEM_CODE_PATTERN.test(code) ? code : null;
};

/**
 * Retryable infrastructure failure without paths or tool messages; carries at
 * most a system error code.
 */
export class MediaProcessingUnavailableError extends Error {
  constructor(readonly systemCode: string | null) {
    super("Publishing media processing unavailable");
    this.name = "MediaProcessingUnavailableError";
  }
}
