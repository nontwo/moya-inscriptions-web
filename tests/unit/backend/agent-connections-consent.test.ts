import { RegisteredClientError } from "@moya/community-postgres";
import {
  CONSENT_LANDING_PREFIX,
  ConsentError,
  admitReadOnlyCapabilities,
  consentDecisionSchema,
  consentReviewPath,
  consentTicketsEqual,
  describeConsent,
  digestConsentTicket,
  interactionUidSchema,
  mintConsentTicket,
  parseRegisteredClients,
  providerResumeUrl,
} from "admin/agent-connections-consent";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

/**
 * Agent Connections V1 (Issue #141 r15 §5) — the consent rules, without a
 * framework.
 *
 * Imported through its own subpath rather than the package barrel, for the
 * reason r14 measured: the barrel reaches `payload` and now `pg`, and a fast
 * lane that pays for a database driver to check a URL rule stops being fast.
 */
describe("consent rules", () => {
  const live = {
    interactionUid: "abc123_-XYZ",
    oauthClientId: "artvenn-claude-01",
    resource: "https://resource.invalid/api/mcp",
    capabilityScopes: ["artvenn:read"],
    protocolScopes: ["offline_access"],
    preset: "read-only" as const,
    expiresAt: new Date("2026-09-20T12:05:00Z").toISOString(),
    environment: "development",
    now: new Date("2026-09-20T12:00:00Z"),
  };

  describe("the milestone is read-only, and says so rather than narrowing", () => {
    it("refuses management instead of quietly dropping it", () => {
      // The direction matters. Narrowing would hand back a working token
      // having ignored what was asked for: the caller would believe it had
      // management and find out by being denied later, and the Owner would
      // have approved a screen that never mentioned it.
      expect(() =>
        admitReadOnlyCapabilities(["artvenn:read", "artvenn:manage"]),
      ).toThrow(ConsentError);
      expect(() => admitReadOnlyCapabilities(["artvenn:manage"])).toThrow(
        ConsentError,
      );
    });

    it("refuses an unknown capability and an empty request", () => {
      expect(() => admitReadOnlyCapabilities(["artvenn:everything"])).toThrow(
        ConsentError,
      );
      expect(() => admitReadOnlyCapabilities([])).toThrow(ConsentError);
      // `offline_access` grants no business authority, so a request carrying
      // only it has asked for nothing.
      expect(() => admitReadOnlyCapabilities(["offline_access"])).toThrow(
        ConsentError,
      );
    });

    it("keeps one canonical spelling of what was consented to", () => {
      expect(
        admitReadOnlyCapabilities([
          "offline_access",
          "artvenn:read",
          "artvenn:read",
        ]),
      ).toEqual(["artvenn:read"]);
    });

    it("refuses a management preset even when the scopes look read-only", () => {
      expect(() =>
        describeConsent({ ...live, preset: "management" as never }),
      ).toThrow(ConsentError);
    });
  });

  describe("the display is what the decision is bound to", () => {
    it("renders exactly the provider's facts", () => {
      expect(describeConsent(live)).toEqual({
        interaction: "abc123_-XYZ",
        client: "artvenn-claude-01",
        resource: "https://resource.invalid/api/mcp",
        environment: "development",
        capabilities: ["artvenn:read"],
        protocol: ["offline_access"],
        preset: "read-only",
        expiresAt: "2026-09-20T12:05:00.000Z",
      });
    });

    it("refuses an interaction that is already dead, rather than showing it as live", () => {
      expect(() =>
        describeConsent({
          ...live,
          now: new Date("2026-09-20T12:05:00Z"),
        }),
      ).toThrow(ConsentError);
      expect(() =>
        describeConsent({ ...live, expiresAt: "not a time" }),
      ).toThrow(ConsentError);
    });

    it("refuses a resource that could be two audiences", () => {
      for (const resource of [
        "https://resource.invalid/api/mcp?tenant=2",
        "https://resource.invalid/api/mcp#fragment",
        "ftp://resource.invalid/api/mcp",
        "not a url",
      ])
        expect(() => describeConsent({ ...live, resource })).toThrow(
          ConsentError,
        );
    });

    it("refuses a malformed interaction or client before rendering either", () => {
      for (const interactionUid of ["", "a b", "../escape", "a/b", "a?b"])
        expect(() => describeConsent({ ...live, interactionUid })).toThrow(
          ConsentError,
        );
      expect(() =>
        describeConsent({
          ...live,
          oauthClientId: "has://scheme-but-not-https",
        }),
      ).toThrow(ConsentError);
    });

    it("drops a protocol scope it does not recognise rather than displaying it", () => {
      // Unlike a capability, a protocol scope grants nothing, so an unknown
      // one is not a refusal — but it must not appear on the screen as though
      // the human agreed to it.
      expect(
        describeConsent({
          ...live,
          protocolScopes: ["offline_access", "something_else"],
        }).protocol,
      ).toEqual(["offline_access"]);
    });
  });

  describe("no request field reaches a URL", () => {
    it("builds the continuation as a path on this origin", () => {
      expect(consentReviewPath("abc123")).toBe(
        "/admin/agent-connections/consent?interaction=abc123",
      );
      // The uid is the only input, and it is validated before it is used, so
      // there is nothing here for an arbitrary return URL to arrive through.
      for (const uid of ["https://elsewhere.invalid", "a b", "../../x", ""])
        expect(() => consentReviewPath(uid)).toThrow(ConsentError);
    });

    it("builds the resume from the CONFIGURED issuer, never from a caller", () => {
      // Under the consent prefix, not a tidier /interaction/<uid>/resume:
      // oidc-provider scopes its interaction cookie to the pathname of the
      // consent destination, so a route outside that prefix is one the
      // browser reaches without the cookie that names the interaction.
      expect(providerResumeUrl("https://auth.localhost:34620", "abc123")).toBe(
        "https://auth.localhost:34620/agent-connections/consent/abc123/resume",
      );
      expect(providerResumeUrl("https://auth.localhost:34620/", "abc123")).toBe(
        "https://auth.localhost:34620/agent-connections/consent/abc123/resume",
      );
      expect(
        providerResumeUrl("https://auth.localhost:34620", "abc123"),
      ).toContain(`${CONSENT_LANDING_PREFIX}/abc123/resume`);
      expect(consentReviewPath("abc123")).toContain(CONSENT_LANDING_PREFIX);
      for (const issuer of [
        "https://auth.localhost:34620?x=1",
        "https://auth.localhost:34620#x",
        "ftp://auth.localhost",
        "",
      ])
        expect(() => providerResumeUrl(issuer, "abc123")).toThrow(ConsentError);
      expect(() =>
        providerResumeUrl("https://auth.localhost:34620", "../../elsewhere"),
      ).toThrow(ConsentError);
    });
  });

  describe("the ticket", () => {
    it("is 32 bytes, and only its digest is meant to be stored", () => {
      const first = mintConsentTicket();
      const second = mintConsentTicket();
      expect(first.ticket).toMatch(/^[0-9a-f]{64}$/u);
      expect(first.ticket).not.toBe(second.ticket);
      expect(first.digest).toBe(
        createHash("sha256").update(first.ticket, "utf8").digest("hex"),
      );
      // The stored value must not be the presented one.
      expect(first.digest).not.toBe(first.ticket);
    });

    it("compares without leaking a length or a prefix through a throw", () => {
      const { ticket } = mintConsentTicket();
      expect(consentTicketsEqual(ticket, ticket)).toBe(true);
      expect(consentTicketsEqual(ticket, ticket.slice(0, 10))).toBe(false);
      expect(consentTicketsEqual(ticket, `${ticket}0`)).toBe(false);
    });
  });

  describe("the POST body", () => {
    const body = {
      interaction: "abc123",
      ticket: "a".repeat(64),
      decision: "approve",
    };

    it("requires an explicit decision, so arriving is not approving", () => {
      expect(consentDecisionSchema.safeParse(body).success).toBe(true);
      expect(
        consentDecisionSchema.safeParse({ ...body, decision: undefined })
          .success,
      ).toBe(false);
      expect(
        consentDecisionSchema.safeParse({ ...body, decision: true }).success,
      ).toBe(false);
      expect(
        consentDecisionSchema.safeParse({ ...body, decision: "yes" }).success,
      ).toBe(false);
    });

    it("refuses an extra field rather than ignoring it", () => {
      expect(
        consentDecisionSchema.safeParse({ ...body, preset: "management" })
          .success,
      ).toBe(false);
      expect(
        consentDecisionSchema.safeParse({ ...body, ticket: "A".repeat(64) })
          .success,
      ).toBe(false);
      expect(
        consentDecisionSchema.safeParse({ ...body, interaction: "a b" })
          .success,
      ).toBe(false);
    });
  });

  describe("the registry is shared configuration, not a second copy", () => {
    const entry = {
      clientId: "artvenn-claude-01",
      family: "claude",
      label: "Claude",
      redirectUris: ["http://127.0.0.1:34699/callback"],
    };
    const one = JSON.stringify([entry]);

    it("reads exactly what it is given", () => {
      expect([...parseRegisteredClients(one).values()]).toEqual([entry]);
    });

    it("refuses a redirect target that is not loopback", () => {
      // A redirect target is where an authorization code is delivered, so a
      // registry that accepted a remote host would be the weakest link in the
      // whole flow.
      for (const redirect of [
        "https://elsewhere.invalid/callback",
        "http://192.168.1.10:8080/callback",
        "http://127.0.0.1:34699/callback#fragment",
        "http://user@127.0.0.1:34699/callback",
        "not a url",
      ])
        expect(() =>
          parseRegisteredClients(
            JSON.stringify([{ ...entry, redirectUris: [redirect] }]),
          ),
        ).toThrow(RegisteredClientError);
      expect(() =>
        parseRegisteredClients(
          JSON.stringify([{ ...entry, redirectUris: [] }]),
        ),
      ).toThrow(RegisteredClientError);
    });

    it("refuses rather than skipping, because a dropped client is a blank screen the provider will still authorize", () => {
      for (const value of [
        "",
        "[]",
        "{}",
        JSON.stringify([{ clientId: "a", family: "claude" }]),
        JSON.stringify([{ ...entry, extra: 1 }]),
        JSON.stringify([{ ...entry, family: "nokia" }]),
        JSON.stringify([{ ...entry, label: " x" }]),
        JSON.stringify([{ ...entry, clientId: "" }]),
      ])
        expect(() => parseRegisteredClients(value)).toThrow(
          RegisteredClientError,
        );
    });

    it("refuses a duplicated client id instead of letting the last entry win", () => {
      expect(() =>
        parseRegisteredClients(
          JSON.stringify([
            { ...entry, label: "First" },
            { ...entry, family: "codex", label: "Second" },
          ]),
        ),
      ).toThrow(RegisteredClientError);
    });
  });

  it("keeps the interaction uid opaque wherever it is parsed", () => {
    expect(interactionUidSchema.safeParse("a".repeat(256)).success).toBe(true);
    expect(interactionUidSchema.safeParse("a".repeat(257)).success).toBe(false);
    expect(digestConsentTicket("x")).toMatch(/^[0-9a-f]{64}$/u);
  });
});
