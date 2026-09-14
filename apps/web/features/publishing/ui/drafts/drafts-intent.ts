import { requestIdentity } from "../../../shell/request-identity";
import { PublishingRequestError } from "../../publishing-data";

/**
 * One request identity per author intent (delete this draft, restore that
 * snapshot, choose this version). A write whose outcome is unknown keeps its
 * identity so the explicit retry repeats the same idempotent command instead
 * of creating a new write intent; a success or a definite refusal ends it.
 */
export const createIntentIds = () => {
  const ids = new Map<string, string>();
  return {
    take: (intent: string): string => {
      const existing = ids.get(intent);
      if (existing !== undefined) return existing;
      const created = requestIdentity();
      ids.set(intent, created);
      return created;
    },
    settle: (intent: string, error: unknown = null): void => {
      if (error instanceof PublishingRequestError && error.outcomeUnknown)
        return;
      ids.delete(intent);
    },
  };
};

/** A caller's own abort (the panel closed) is not a failure to show. */
export const isAbort = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

/** Product text for a failed publishing request; Backend wording never reaches it. */
export const failureText = (error: unknown, fallback: string): string =>
  error instanceof PublishingRequestError ? error.message : fallback;
