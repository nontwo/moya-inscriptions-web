import { ConnectionAuthError } from "./contracts";
import {
  authorizeConnection,
  reconnectConnection,
  reconsentConnection,
  revokeConnection,
} from "./lifecycle";

import type { AgentConnection } from "./contracts";
import type { ConsentRecord } from "./lifecycle";

/**
 * Agent Connections V1 (Issue #141 r10 §5) — the canonical connection
 * authority.
 *
 * The pure transitions in `lifecycle.ts` say what a change means. This says
 * what happens when two of them race, which is where a revocation quietly
 * stops being a revocation.
 *
 * Two rules carry it:
 *
 *  1. **Every write is conditional on the version it was decided from.** A
 *     transition computed against version 4 may only be stored if the record
 *     is still at version 4. Otherwise it is rejected and recomputed against
 *     what is actually there — never merged, never retried blindly.
 *  2. **Canonical deny lands before provider cleanup.** The connection record
 *     is the authority the resource server reads; the provider's own token
 *     store is downstream of it. Cleaning up tokens first would leave a window
 *     where the provider is empty but the record still says "authorized".
 *     Cleanup is therefore idempotent and may fail without un-revoking
 *     anything.
 */

/** A stored connection with the version its state was read at. */
export interface VersionedConnection {
  readonly connection: AgentConnection;
  readonly version: number;
}

export interface ConnectionStore {
  read(connectionId: string): Promise<VersionedConnection | null>;
  /**
   * Stores `next` only if the record is still at `expectedVersion`. Returns
   * the stored row, or null when another writer moved first.
   */
  compareAndSet(
    connectionId: string,
    expectedVersion: number,
    next: AgentConnection,
  ): Promise<VersionedConnection | null>;
}

/** Deleting a grant's tokens at the provider. Downstream, and idempotent. */
export type ProviderCleanup = (connection: AgentConnection) => Promise<void>;

export interface ConnectionAuthorityOptions {
  readonly store: ConnectionStore;
  readonly cleanupProviderGrant?: ProviderCleanup;
  /** Bounded retries for a genuine lost race. Not a retry of a refusal. */
  readonly maxAttempts?: number;
}

const DEFAULT_ATTEMPTS = 5;

export class ConnectionAuthority {
  private readonly store: ConnectionStore;
  private readonly cleanupProviderGrant: ProviderCleanup | undefined;
  private readonly maxAttempts: number;

  constructor(options: ConnectionAuthorityOptions) {
    this.store = options.store;
    this.cleanupProviderGrant = options.cleanupProviderGrant;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_ATTEMPTS;
  }

  /**
   * Reads the connection the resource server must decide against. A store that
   * cannot answer is not "no connection": it is an unavailable authority, and
   * the caller must fail closed rather than treat absence as permission.
   */
  async current(connectionId: string): Promise<AgentConnection> {
    let stored: VersionedConnection | null;
    try {
      stored = await this.store.read(connectionId);
    } catch {
      throw new ConnectionAuthError("CONNECTION_AUTHORITY_UNAVAILABLE");
    }
    if (stored === null) throw new ConnectionAuthError("CONNECTION_NOT_FOUND");
    return stored.connection;
  }

  /**
   * Applies one transition under compare-and-set. The transition is recomputed
   * from the CURRENT record on every attempt, so a concurrent change is
   * re-decided rather than overwritten — which is what stops a slower
   * permission change from storing a generation lower than a revocation that
   * has already landed.
   */
  private async transition(
    connectionId: string,
    apply: (current: AgentConnection) => AgentConnection,
  ): Promise<AgentConnection> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt += 1) {
      let stored: VersionedConnection | null;
      try {
        stored = await this.store.read(connectionId);
      } catch {
        throw new ConnectionAuthError("CONNECTION_AUTHORITY_UNAVAILABLE");
      }
      if (stored === null)
        throw new ConnectionAuthError("CONNECTION_NOT_FOUND");

      // A refusal from the transition is a real answer, not a lost race: it
      // must escape immediately rather than being retried into existence.
      const next = apply(stored.connection);

      if (next.generation < stored.connection.generation)
        throw new ConnectionAuthError("CONNECTION_GENERATION_WOULD_REGRESS");

      let written: VersionedConnection | null;
      try {
        written = await this.store.compareAndSet(
          connectionId,
          stored.version,
          next,
        );
      } catch {
        throw new ConnectionAuthError("CONNECTION_AUTHORITY_UNAVAILABLE");
      }
      if (written !== null) return written.connection;
      // Somebody else moved first. Loop and decide again against their result.
    }
    throw new ConnectionAuthError("CONNECTION_AUTHORITY_CONTENDED");
  }

  authorize(
    connectionId: string,
    consent: ConsentRecord,
  ): Promise<AgentConnection> {
    return this.transition(connectionId, (current) =>
      authorizeConnection(current, consent),
    );
  }

  reconsent(
    connectionId: string,
    consent: ConsentRecord,
  ): Promise<AgentConnection> {
    return this.transition(connectionId, (current) =>
      reconsentConnection(current, consent),
    );
  }

  /**
   * Disconnect. The canonical deny is stored FIRST and is what the resource
   * server reads; provider cleanup runs afterwards and its failure is
   * swallowed deliberately, because a connection that is revoked in the
   * record but still has rows at the provider is safe, while the reverse is
   * not. Cleanup is idempotent, so a later retry costs nothing.
   */
  async revoke(connectionId: string, at: string): Promise<AgentConnection> {
    const revoked = await this.transition(connectionId, (current) =>
      revokeConnection(current, at),
    );
    if (this.cleanupProviderGrant !== undefined)
      await this.cleanupProviderGrant(revoked).catch(() => undefined);
    return revoked;
  }

  reconnect(
    connectionId: string,
    consent: ConsentRecord,
  ): Promise<AgentConnection> {
    return this.transition(connectionId, (current) =>
      reconnectConnection(current, consent),
    );
  }
}
