/**
 * Agent Connections V1 (Issue #141 r14 §6) — destroying a provider grant, and
 * saying truthfully whether it happened.
 *
 * r12 measured the defect this closes: after an ArtVenn disconnect the
 * provider still accepted the refresh token and issued, because the provider
 * knows nothing about ArtVenn's generation. The canonical revoke is the
 * authority and lands first; this is the downstream half that stops the old
 * grant producing anything at all.
 *
 * Two things it deliberately does NOT do.
 *
 * It does not un-revoke. Every failing path that CAN record does record:
 * `destroy_status='failed'`, connection still revoked, because cleanup failing
 * is not consent returning. The first version did not manage that — a step sat
 * outside the try and could reject having written nothing — and a later
 * version claimed "every", which is an absolute and is not one. The ledger
 * writes themselves sit outside the try, so a database that cannot be written
 * to leaves the row on `pending`. That is unavoidable rather than overlooked:
 * you cannot record a failure when the recorder is what failed.
 * The ledger stays visible and retryable, and `done` is terminal in both
 * directions by trigger — including its timestamp.
 *
 * It does not claim a distributed transaction. The canonical tables and the
 * provider's own store are separate, the migration header says so, and the
 * order is fixed: canonical deny commits first, this runs afterwards and may
 * fail without changing what the resource server reads.
 *
 * The provider is injected rather than imported. `revokeByGrantId` on the
 * token models is NOT proof the Grant itself is gone — the r14 brief is
 * explicit about that — so both operations are named separately and both must
 * succeed before anything is recorded as done.
 */

export interface ProviderGrantLifecycle {
  /**
   * Destroys the provider's own Grant object. For `oidc-provider` this is
   * `Grant.adapter.destroy(grantId)`, which is how grant destruction actually
   * reaches an adapter — `revokeByGrantId` never carries it.
   */
  readonly destroyGrant: (grantId: string) => Promise<void>;
  /**
   * Revokes the tokens and codes issued under the grant. Separate from the
   * above on purpose: one succeeding says nothing about the other.
   */
  readonly revokeIssued: (grantId: string) => Promise<void>;
  /**
   * Answers whether anything for this grant is still resolvable at the
   * provider. Used to make the operation idempotent without treating "already
   * absent" as "never existed".
   */
  readonly isAbsent?: (grantId: string) => Promise<boolean>;
}

type Queryable = {
  query: (
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: unknown[]; rowCount: number | null }>;
};

export interface GrantDestroyerOptions {
  readonly pool: Queryable;
  readonly provider: ProviderGrantLifecycle;
  /** Invalidates the external wrappers of the grant. */
  readonly invalidateWrappers?: (grantId: string, at: Date) => Promise<number>;
  /** Bare diagnostic codes. Never an identifier, never a message. */
  readonly recordFailure?: (code: string) => void;
}

export type GrantDestructionOutcome =
  | { readonly status: "done"; readonly destroyedAt: string }
  | { readonly status: "failed"; readonly reason: string }
  | { readonly status: "unknown-grant" };

const GRANTS = "community.agent_connection_grants";

export const createGrantDestroyer = (options: GrantDestroyerOptions) => {
  const { pool, provider } = options;

  const markFailed = async (
    grantId: string,
    reason: string,
  ): Promise<GrantDestructionOutcome> => {
    // `failed` may carry a timestamp or not; what it may never do is look
    // un-attempted. It stays retryable and stays visible.
    await pool.query(
      `UPDATE ${GRANTS} SET destroy_status='failed', destroyed_at=NULL
        WHERE grant_id=$1 AND destroy_status <> 'done'`,
      [grantId],
    );
    options.recordFailure?.(reason);
    return { status: "failed", reason } as const;
  };

  return {
    /**
     * Destroys one grant at the provider and records the outcome.
     *
     * Idempotent: a grant already recorded `done` returns its original
     * completion rather than re-running or restating it, because the trigger
     * refuses to move a completed destruction OR its timestamp.
     */
    async destroy(grantId: string): Promise<GrantDestructionOutcome> {
      const { rows } = await pool.query(
        `SELECT destroy_status, destroyed_at FROM ${GRANTS} WHERE grant_id=$1`,
        [grantId],
      );
      const row = rows[0] as
        { destroy_status: string; destroyed_at: Date | null } | undefined;
      if (row === undefined) return { status: "unknown-grant" };
      if (row.destroy_status === "done" && row.destroyed_at !== null)
        return {
          status: "done",
          destroyedAt: row.destroyed_at.toISOString(),
        };

      // Announce the attempt before making it. A process that dies mid-way
      // leaves `pending`, which is the truthful state: somebody asked, and
      // nobody has proved it finished.
      await pool.query(
        `UPDATE ${GRANTS} SET destroy_status='pending'
          WHERE grant_id=$1 AND destroy_status IN ('not-requested','failed')`,
        [grantId],
      );

      // Which step failed, so `recordFailure` can say. Collapsing the codes
      // into one was not required by the m6 fix, and `recordFailure` exists
      // precisely so an operator can tell a provider outage from a privilege
      // error on the wrapper sweep.
      //
      // Six codes are reachable from this function, not three: the four `step`
      // values below, plus PROVIDER_GRANT_STILL_PRESENT from the verification
      // and PROVIDER_DESTROY_UNRECORDED from the race recovery. An earlier
      // draft of this note said "one try, three codes" while sitting above two
      // try blocks — left here as a corrected count rather than a deleted one,
      // because a comment that miscounts what it introduces is the same defect
      // this slice keeps finding.
      let step = "PROVIDER_REVOKE_FAILED";
      try {
        // Order matters only in that both must happen. Tokens first, so a
        // failure between the two leaves the Grant object present and the
        // ledger honest rather than the reverse.
        await provider.revokeIssued(grantId);
        step = "PROVIDER_DESTROY_FAILED";
        await provider.destroyGrant(grantId);
        step = "PROVIDER_DESTROY_UNVERIFIED";
        if (provider.isAbsent !== undefined) {
          // Trust, then verify. `revokeByGrantId` returning without throwing
          // is not evidence the Grant is gone; this is the only check that is.
          // It verifies the Grant OBJECT only — issued tokens are covered by
          // `revokeIssued` not throwing, which is weaker, and saying so here
          // is better than letting the word "verified" cover both.
          if (!(await provider.isAbsent(grantId)))
            return markFailed(grantId, "PROVIDER_GRANT_STILL_PRESENT");
        }
      } catch {
        return markFailed(grantId, step);
      }

      // Stamped only now, so `destroyed_at` records when destruction
      // COMPLETED rather than when it was attempted.
      const at = new Date();

      // A second try, not a second chance to skip recording: this step is the
      // one the r14 review found OUTSIDE the guard entirely, where a throw —
      // reachable, since the App role holds UPDATE on the grant ledger but
      // only SELECT on wrappers — left the row `pending` forever.
      try {
        if (options.invalidateWrappers !== undefined)
          await options.invalidateWrappers(grantId, at);
      } catch {
        return markFailed(grantId, "WRAPPER_INVALIDATION_FAILED");
      }

      const completed = await pool.query(
        `UPDATE ${GRANTS} SET destroy_status='done', destroyed_at=$2
          WHERE grant_id=$1 AND destroy_status <> 'done'
      RETURNING destroyed_at`,
        [grantId, at],
      );
      const stored = (completed.rows[0] as { destroyed_at: Date } | undefined)
        ?.destroyed_at;
      if (stored !== undefined)
        return { status: "done", destroyedAt: stored.toISOString() };

      // Nothing matched: another worker completed it between the read and the
      // write. Report ITS timestamp, never the one this call invented — the
      // trigger refuses to store a second one, so returning `at` would be
      // reporting a time that exists nowhere in the database.
      const current = await pool.query(
        `SELECT destroyed_at FROM ${GRANTS} WHERE grant_id=$1`,
        [grantId],
      );
      const raced = (
        current.rows[0] as { destroyed_at: Date | null } | undefined
      )?.destroyed_at;
      return raced === null || raced === undefined
        ? markFailed(grantId, "PROVIDER_DESTROY_UNRECORDED")
        : { status: "done", destroyedAt: raced.toISOString() };
    },

    /**
     * Grants whose destruction was requested and has not completed. The queue
     * a retry runs over — bounded, and ordered oldest first so a stuck grant
     * is not starved by newer ones.
     */
    async pending(limit = 100): Promise<readonly string[]> {
      const { rows } = await pool.query(
        `SELECT grant_id FROM ${GRANTS}
          WHERE destroy_status IN ('pending','failed')
          ORDER BY consented_at ASC
          LIMIT $1`,
        [limit],
      );
      return (rows as { grant_id: string }[]).map((r) => r.grant_id);
    },
  };
};

export type GrantDestroyer = ReturnType<typeof createGrantDestroyer>;
