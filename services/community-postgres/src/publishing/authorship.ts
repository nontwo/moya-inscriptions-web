import { workAuthorshipSchema } from "@moya/contracts/schemas";
import type { WorkAuthorship } from "@moya/contracts";

/*
 * The stored authorship columns of a work revision and their contract shape.
 * A leaf module: drafts, works, operator and author reads share it without
 * import cycles.
 */

export interface RevisionAuthorshipColumns {
  /** NULL when the revision declares no authorship (legacy baselines). */
  readonly authorship_kind: string | null;
  readonly reference_title: string | null;
  readonly original_author: string | null;
  readonly source_note: string | null;
}

/**
 * The stored authorship of a revision as the contract shape, or null when the
 * revision declares none: nothing is ever reported as `original` unless the
 * author chose it (C05).
 */
export const revisionAuthorship = (
  row: RevisionAuthorshipColumns,
): WorkAuthorship | null =>
  row.authorship_kind === null
    ? null
    : workAuthorshipSchema.parse(
        row.authorship_kind === "original"
          ? { kind: "original" }
          : {
              kind: row.authorship_kind,
              ...(row.reference_title === null
                ? {}
                : { referenceTitle: row.reference_title }),
              ...(row.original_author === null
                ? {}
                : { originalAuthor: row.original_author }),
              ...(row.source_note === null
                ? {}
                : { sourceNote: row.source_note }),
            },
      );
