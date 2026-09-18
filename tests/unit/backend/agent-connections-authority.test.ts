import {
  ConnectionAuthority,
  agentConnectionSchema,
  openConnection,
  revokeConnection,
} from "admin/agent-connections";
import { describe, expect, it, vi } from "vitest";

import type {
  AgentConnection,
  ConnectionStore,
  VersionedConnection,
} from "admin/agent-connections";

/**
 * r10 §5 — the canonical connection authority under concurrency.
 *
 * The failure this file exists to prevent: a revocation that lands, and is
 * then quietly undone by a slower permission change that was decided against
 * the pre-revocation record and stored on top of it. Generation regression is
 * how a disconnect stops being a disconnect.
 */

const AT = "2026-09-18T03:00:00Z";
const consent = (
  preset: AgentConnection["preset"] = "read-only",
  humanAccountId = "user-owner",
) => ({ humanAccountId, preset, at: AT });

const seed = (): AgentConnection =>
  openConnection({
    id: "conn-1",
    principalLabel: "agent-phone",
    humanAccountId: "user-owner",
    client: "claude",
    oauthClientId: "artvenn-claude-desktop-01",
    environment: "development",
  });

/** An in-memory store with real compare-and-set semantics. */
class MemoryStore implements ConnectionStore {
  private rows = new Map<string, VersionedConnection>();
  reads = 0;
  writes = 0;
  conflicts = 0;

  constructor(initial: AgentConnection) {
    this.rows.set(initial.id, { connection: initial, version: 1 });
  }

  async read(connectionId: string): Promise<VersionedConnection | null> {
    this.reads += 1;
    return this.rows.get(connectionId) ?? null;
  }

  async compareAndSet(
    connectionId: string,
    expectedVersion: number,
    next: AgentConnection,
  ): Promise<VersionedConnection | null> {
    const row = this.rows.get(connectionId);
    if (row === undefined || row.version !== expectedVersion) {
      this.conflicts += 1;
      return null;
    }
    const written = { connection: next, version: row.version + 1 };
    this.rows.set(connectionId, written);
    this.writes += 1;
    return written;
  }

  peek(connectionId: string) {
    return this.rows.get(connectionId);
  }
}

describe("compare-and-set transitions", () => {
  it("stores a transition decided from the current version", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({ store });
    const authorized = await authority.authorize("conn-1", consent());
    expect(authorized.status).toBe("authorized");
    expect(store.peek("conn-1")?.version).toBe(2);
  });

  it("re-decides against the winner: a revocation that lands mid-flight is not overwritten", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({ store });
    await authority.authorize("conn-1", consent());
    const authorizedGeneration = store.peek("conn-1")!.connection.generation;

    // The interferer REVOKES. A correct implementation recomputes the
    // permission change against the revoked record and refuses it; an
    // implementation that computed `next` once and blindly retried it would
    // store `authorized` on top of the revocation and put the generation back.
    const real = store.compareAndSet.bind(store);
    let interfered = false;
    vi.spyOn(store, "compareAndSet").mockImplementation(
      async (id, expectedVersion, next) => {
        if (!interfered) {
          interfered = true;
          const row = store.peek(id)!;
          await real(id, row.version, revokeConnection(row.connection, AT));
          return null;
        }
        return real(id, expectedVersion, next);
      },
    );

    await expect(
      authority.reconsent("conn-1", consent("management")),
    ).rejects.toThrow("CONNECTION_NOT_AUTHORIZED");

    const after = store.peek("conn-1")!.connection;
    expect(after.status).toBe("revoked");
    expect(after.preset).toBe("read-only");
    expect(after.generation).toBeGreaterThan(authorizedGeneration);
    vi.restoreAllMocks();
  });
});

describe("generation is monotone under concurrent actions", () => {
  it("never stores a generation below the one already recorded", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({ store });
    await authority.authorize("conn-1", consent());
    const beforeRevoke = store.peek("conn-1")!.connection.generation;

    await authority.revoke("conn-1", AT);
    const afterRevoke = store.peek("conn-1")!.connection;
    expect(afterRevoke.generation).toBeGreaterThan(beforeRevoke);

    // A permission change arriving after the revocation is refused outright,
    // not applied on top of it.
    await expect(
      authority.reconsent("conn-1", consent("management")),
    ).rejects.toThrow();
    expect(store.peek("conn-1")!.connection.generation).toBe(
      afterRevoke.generation,
    );
    expect(store.peek("conn-1")!.connection.status).toBe("revoked");
  });

  it("a concurrent disconnect and reconnect cannot resurrect an older generation", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({ store });
    await authority.authorize("conn-1", consent());

    const seen: number[] = [];
    for (let round = 0; round < 4; round += 1) {
      await authority.revoke("conn-1", AT);
      seen.push(store.peek("conn-1")!.connection.generation);
      await authority.reconnect("conn-1", consent());
      seen.push(store.peek("conn-1")!.connection.generation);
    }
    const sorted = [...seen].sort((a, b) => a - b);
    expect(seen).toEqual(sorted);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("refuses a transition that would move the generation backwards", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({ store });
    await authority.authorize("conn-1", consent());
    const regressing = new ConnectionAuthority({ store });
    // A transition that returns a lower generation is rejected by the
    // authority even though the pure function produced it.
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (regressing as any).transition("conn-1", (current: AgentConnection) => ({
        ...current,
        generation: current.generation - 1,
      })),
    ).rejects.toThrow("CONNECTION_GENERATION_WOULD_REGRESS");
  });
});

describe("canonical deny lands before provider cleanup", () => {
  it("revokes the record first, then cleans up", async () => {
    const order: string[] = [];
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({
      store,
      cleanupProviderGrant: async () => {
        order.push(`cleanup:${store.peek("conn-1")!.connection.status}`);
      },
    });
    await authority.authorize("conn-1", consent());
    await authority.revoke("conn-1", AT);
    // The cleanup observed an already-revoked record.
    expect(order).toEqual(["cleanup:revoked"]);
  });

  it("stays revoked when provider cleanup fails, because the record is the authority", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({
      store,
      cleanupProviderGrant: async () => {
        throw new Error("provider unreachable");
      },
    });
    await authority.authorize("conn-1", consent());
    await expect(authority.revoke("conn-1", AT)).resolves.toMatchObject({
      status: "revoked",
    });
    expect(store.peek("conn-1")!.connection.status).toBe("revoked");
  });

  it("is idempotent: a repeated revoke neither fails nor moves the generation", async () => {
    const cleanup = vi.fn(async () => undefined);
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({
      store,
      cleanupProviderGrant: cleanup,
    });
    await authority.authorize("conn-1", consent());
    const first = await authority.revoke("conn-1", AT);
    const second = await authority.revoke("conn-1", "2026-09-18T04:00:00Z");
    expect(second.generation).toBe(first.generation);
    expect(second.revokedAt).toBe(first.revokedAt);
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});

describe("unavailable authority fails closed", () => {
  const broken = (): ConnectionStore => ({
    read: async () => {
      throw new Error("store down");
    },
    compareAndSet: async () => {
      throw new Error("store down");
    },
  });

  it("refuses to answer `current` when the store cannot be read", async () => {
    await expect(
      new ConnectionAuthority({ store: broken() }).current("conn-1"),
    ).rejects.toThrow("CONNECTION_AUTHORITY_UNAVAILABLE");
  });

  it("does not treat a missing record as permission", async () => {
    const empty: ConnectionStore = {
      read: async () => null,
      compareAndSet: async () => null,
    };
    await expect(
      new ConnectionAuthority({ store: empty }).current("conn-1"),
    ).rejects.toThrow("CONNECTION_NOT_FOUND");
  });

  it("refuses a transition when the store cannot be written", async () => {
    await expect(
      new ConnectionAuthority({ store: broken() }).revoke("conn-1", AT),
    ).rejects.toThrow("CONNECTION_AUTHORITY_UNAVAILABLE");
  });

  it("gives up after bounded attempts rather than spinning on contention", async () => {
    const store = new MemoryStore(seed());
    await new ConnectionAuthority({ store }).authorize("conn-1", consent());
    vi.spyOn(store, "compareAndSet").mockResolvedValue(null);
    await expect(
      new ConnectionAuthority({ store, maxAttempts: 3 }).revoke("conn-1", AT),
    ).rejects.toThrow("CONNECTION_AUTHORITY_CONTENDED");
    vi.restoreAllMocks();
  });
});

describe("connections are isolated from one another", () => {
  it("revoking one leaves another untouched", async () => {
    const a = seed();
    const b = { ...seed(), id: "conn-2", principalLabel: "agent-desk" };
    const rows = new Map<string, VersionedConnection>([
      ["conn-1", { connection: a, version: 1 }],
      ["conn-2", { connection: b, version: 1 }],
    ]);
    const store: ConnectionStore = {
      read: async (id) => rows.get(id) ?? null,
      compareAndSet: async (id, expectedVersion, next) => {
        const row = rows.get(id);
        if (row === undefined || row.version !== expectedVersion) return null;
        const written = { connection: next, version: row.version + 1 };
        rows.set(id, written);
        return written;
      },
    };
    const authority = new ConnectionAuthority({ store });
    await authority.authorize("conn-1", consent());
    await authority.authorize("conn-2", consent());
    const bBefore = rows.get("conn-2")!.connection;
    await authority.revoke("conn-1", AT);
    expect(rows.get("conn-2")!.connection).toEqual(bBefore);
    expect(rows.get("conn-2")!.connection.status).toBe("authorized");
  });
});

describe("r10 review blocker 2 — every stored record satisfies its own schema", () => {
  it("parses the record after each transition, which nothing did before", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({ store });
    const parse = () =>
      agentConnectionSchema.parse(store.peek("conn-1")!.connection);

    await authority.authorize("conn-1", consent());
    expect(parse().status).toBe("authorized");
    await authority.reconsent("conn-1", consent("management"));
    expect(parse().preset).toBe("management");
    await authority.revoke("conn-1", AT);
    // The case that used to store a value its own schema rejects.
    expect(parse().revokedAt).toBe("2026-09-18T03:00:00.000Z");
    await authority.reconnect("conn-1", consent());
    expect(parse().revokedAt).toBeNull();
  });

  it("normalizes a revocation timestamp given in another form", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({ store });
    await authority.authorize("conn-1", consent());
    await authority.revoke("conn-1", "2026-09-18T05:00:00+02:00");
    const parsed = agentConnectionSchema.parse(
      store.peek("conn-1")!.connection,
    );
    expect(parsed.revokedAt).toBe("2026-09-18T03:00:00.000Z");
  });

  it("refuses an unparseable revocation timestamp rather than storing it", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({ store });
    await authority.authorize("conn-1", consent());
    await expect(authority.revoke("conn-1", "not-a-time")).rejects.toThrow(
      "CONNECTION_TIMESTAMP_INVALID",
    );
    expect(store.peek("conn-1")!.connection.status).toBe("authorized");
  });
});

describe("r10 re-review — the consent instant is stored, canonically", () => {
  it("records when consent was given, normalized", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({ store });
    await authority.authorize("conn-1", {
      humanAccountId: "user-owner",
      preset: "read-only",
      at: "2026-09-18T05:00:00+02:00",
    });
    const parsed = agentConnectionSchema.parse(
      store.peek("conn-1")!.connection,
    );
    expect(parsed.consentedAt).toBe("2026-09-18T03:00:00.000Z");
  });

  it("refuses an offset-less consent instant rather than reading it as host local time", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({ store });
    await expect(
      authority.authorize("conn-1", {
        humanAccountId: "user-owner",
        preset: "read-only",
        at: "2026-09-18T05:00:00",
      }),
    ).rejects.toThrow("CONNECTION_TIMESTAMP_INVALID");
  });

  it("refuses an offset-less revocation instant for the same reason", async () => {
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({ store });
    await authority.authorize("conn-1", consent());
    await expect(
      authority.revoke("conn-1", "2026-09-18T05:00:00"),
    ).rejects.toThrow("CONNECTION_TIMESTAMP_INVALID");
  });

  it("surfaces a failing provider cleanup instead of swallowing it silently", async () => {
    const codes: string[] = [];
    const store = new MemoryStore(seed());
    const authority = new ConnectionAuthority({
      store,
      cleanupProviderGrant: async () => {
        throw new Error("provider unreachable");
      },
      recordFailure: (code) => codes.push(code),
    });
    await authority.authorize("conn-1", consent());
    await expect(authority.revoke("conn-1", AT)).resolves.toMatchObject({
      status: "revoked",
    });
    expect(codes).toEqual(["CONNECTION_CLEANUP_FAILED"]);
  });
});
