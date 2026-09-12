import type { CatalogCommentId } from "@moya/contracts";
import type {
  CommentAnalysisState,
  OperatorCommentKind,
} from "@moya/contracts/internal/community-operator";

/**
 * The provider-independent analysis boundary (Owner instruction 2026-09-12,
 * section 8). Analysis is advisory: it may recommend and never changes
 * publication or account state, which stays with the human operations behind
 * the operator boundary. Comment text handed to an analyzer is untrusted
 * data, never an instruction or a permission to invoke anything, and a
 * recommendation is never a factual judgment about Catalog scholarship.
 *
 * Future adapters (a REST or MCP analyzer, a rule pack) implement this port
 * under their own scoped, read-only principal; the Owner token is never
 * shared with them. A failed, skipped or stale run is reported as such.
 */
export interface CommentAnalysisTarget {
  readonly id: CatalogCommentId;
  readonly kind: OperatorCommentKind;
  readonly text: string;
}

export interface CommentAnalysisPort {
  /** False until a provider is configured; the UI then says "not connected". */
  readonly connected: boolean;
  readLatest(target: CommentAnalysisTarget): Promise<CommentAnalysisState>;
}

/** The default: no provider, no verdict, no pretence of one. */
export class DisabledCommentAnalysisPort implements CommentAnalysisPort {
  readonly connected = false;

  async readLatest(): Promise<CommentAnalysisState> {
    return { status: "not_connected" };
  }
}
