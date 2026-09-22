import type {
  AuthAccountSecurity,
  AuthCapabilities,
  AuthChallengeAccepted,
  AuthFactor,
  PublicUserId,
  PublicUserProfile,
} from "@moya/contracts";

import { mapPublicUserProfile } from "../mappers/community-public-contract-mapper.js";
import {
  defaultRandomBytes,
  generateOpaqueId,
  generateSessionToken,
  hashSessionToken,
} from "../session-token.js";
import type {
  AuthChannelName,
  AuthEnvironmentName,
  AuthPurposeName,
  AuthUnitOfWork,
  CommunityAuthPort,
  StoredChallenge,
  StoredHandoff,
  StoredIdentity,
  StoredReceipt,
  StoredUser,
  VerificationMode,
} from "./auth-port.js";
import {
  assertAuthKeys,
  decryptContact,
  encryptContact,
  generateEmailOtp,
  keyedHash,
  lookupDigest,
  maskEmail,
  maskPhone,
  normalizeEmail,
  normalizePhone,
  otpVerifier,
  verifierMatches,
} from "./contact-crypto.js";
import type { AuthKeys } from "./contact-crypto.js";
import type { DeliveryOutcome } from "./delivery.js";
import type { RandomBytes } from "../session-token.js";

const OTP_TTL_MS = 5 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;
const TARGET_SENDS = 8;
const SOURCE_SENDS = 20;
const GLOBAL_SENDS = 200;
const HANDOFF_TTL_MS = 10 * 60 * 1000;
const DEFAULT_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const HANDLE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export const authReasons = [
  "AUTH_CHANNEL_UNAVAILABLE",
  "AUTH_INVALID_IDENTIFIER",
  "AUTH_INVALID_DISPLAY_NAME",
  "AUTH_AGREEMENT_REQUIRED",
  "AUTH_RATE_LIMITED",
  "AUTH_CODE_EXHAUSTED",
  "AUTH_CODE_INVALID",
  "AUTH_CODE_EXPIRED",
  "AUTH_CODE_SUPERSEDED",
  "AUTH_PROOF_REJECTED",
  "AUTH_IDENTIFIER_CONFLICT",
  "AUTH_LAST_FACTOR",
  "AUTH_STALE_VERSION",
  "AUTH_ACCOUNT_SUSPENDED",
  "AUTH_UNAUTHENTICATED",
  "AUTH_DELIVERY_FAILED",
  "AUTH_DELIVERY_UNKNOWN",
  "AUTH_PROVENANCE_REJECTED",
  "AUTH_NOT_CONFIGURED",
] as const;

export type AuthReason = (typeof authReasons)[number];
export type AuthResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: AuthReason };

export interface AuthSessionGrant {
  readonly token: string;
  readonly expiresAt: string;
  readonly profile: PublicUserProfile;
}

export type AuthVerifyValue =
  | { readonly outcome: "signed_in"; readonly session: AuthSessionGrant }
  | {
      readonly outcome: "registration_required";
      readonly handoffToken: string;
      readonly maskedTarget: string;
      readonly channel: AuthChannelName;
    }
  | {
      readonly outcome: "already_registered";
      readonly channel: AuthChannelName;
    }
  | { readonly outcome: "reauthenticated"; readonly reauthToken: string };

export interface AuthDeliveryPorts {
  sendEmail(input: {
    readonly to: string;
    readonly code: string;
    readonly minutes: number;
  }): Promise<DeliveryOutcome>;
  sendPhone(input: {
    readonly e164: string;
    readonly code: string | null;
    readonly outId: string;
    readonly minutes: number;
  }): Promise<DeliveryOutcome>;
  checkPhone(input: {
    readonly e164: string;
    readonly code: string;
    readonly outId: string;
  }): Promise<"pass" | "fail" | "malformed" | "unknown">;
}

export interface CommunityAuthServiceOptions {
  readonly environment: AuthEnvironmentName;
  readonly profile: "full-local" | "email-first";
  readonly keys: AuthKeys;
  readonly emailMode: VerificationMode;
  readonly phoneMode: VerificationMode | "disabled";
  readonly delivery: AuthDeliveryPorts;
  readonly clock?: () => Date;
  readonly randomBytes?: RandomBytes;
  readonly sessionTtlMs?: number;
}

interface Target {
  readonly digest: string;
  readonly destination: string;
  readonly masked: string;
  readonly ciphertext: string;
  readonly userId: string | null;
  readonly sessionHash: string | null;
  readonly expectedVersion: number | null;
  readonly reauthHash: string | null;
}

interface Minted extends AuthSessionGrant {
  readonly sessionId: string;
  readonly tokenHash: string;
}

type Reservation =
  | { readonly kind: "replay"; readonly accepted: AuthChallengeAccepted }
  | {
      readonly kind: "send";
      readonly challenge: StoredChallenge;
      readonly continuationToken: string;
      readonly destination: string;
      readonly code: string | null;
    };

class AuthRollback extends Error {
  constructor(readonly result: AuthResult<unknown>) {
    super("auth rollback");
  }
}

const fail = <T>(reason: AuthReason): AuthResult<T> => ({
  ok: false,
  reason,
});

/** Check-constraint backstop when an attempt counter would pass five. */
const attemptsBound = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  if ("kind" in error && error.kind === "attempts") return true;
  const code = "code" in error ? String(error.code) : "";
  const constraint = "constraint" in error ? String(error.constraint) : "";
  const message = "message" in error ? String(error.message) : "";
  return (
    code === "23514" &&
    (constraint === "auth_challenges_attempts_bounded" ||
      message.includes("auth_challenges_attempts_bounded"))
  );
};

/**
 * Email-first registration, sign-in and factor binding on the existing
 * public-user and session tables. Session tokens are minted only after a
 * purpose-bound proof and are never stored in receipts.
 */
export class CommunityAuthService {
  private readonly clock: () => Date;
  private readonly randomBytes: RandomBytes;
  private readonly sessionTtlMs: number;

  constructor(
    private readonly port: CommunityAuthPort,
    private readonly options: CommunityAuthServiceOptions,
  ) {
    assertAuthKeys(options.keys);
    this.clock = options.clock ?? (() => new Date());
    this.randomBytes = options.randomBytes ?? defaultRandomBytes;
    this.sessionTtlMs = options.sessionTtlMs ?? DEFAULT_SESSION_TTL_MS;
  }

  capabilities(): AuthCapabilities {
    const phone = this.options.phoneMode !== "disabled";
    return {
      profile: this.options.profile,
      email: { available: true, reason: null },
      phone: phone
        ? { available: true, reason: null }
        : {
            available: false,
            reason: "Phone sign-in is turned off in this acceptance profile.",
          },
      developmentOnly: this.options.environment === "development",
    };
  }

  async sendChallenge(input: {
    readonly channel: AuthChannelName;
    readonly purpose: AuthPurposeName;
    readonly identifier?: string | undefined;
    readonly idempotencyKey: string;
    readonly source: string;
    readonly sessionToken?: string | undefined;
    readonly reauthToken?: string | undefined;
  }): Promise<AuthResult<AuthChallengeAccepted>> {
    if (!this.channelAvailable(input.channel))
      return fail("AUTH_CHANNEL_UNAVAILABLE");
    const at = this.clock();
    const session = await this.optionalSession(input.sessionToken, at);
    if (!session.ok) return session;
    const target = await this.resolveTarget(input, session.value, at);
    if (!target.ok) return target;
    const reserved = await this.transactional<Reservation>((tx) =>
      this.reserve(tx, input, target.value, at),
    );
    if (!reserved.ok) return reserved;
    if (reserved.value.kind === "replay")
      return { ok: true, value: reserved.value.accepted };
    const delivery = await this.deliver(reserved.value);
    const marked = await this.transactional<"accepted" | "failed" | "unknown">(
      async (tx) => {
        const current = await tx.findChallenge(
          reserved.value.kind === "send" ? reserved.value.challenge.id : "",
        );
        if (current === null || reserved.value.kind !== "send")
          return fail("AUTH_PROOF_REJECTED");
        await tx.saveChallenge({
          ...current,
          deliveryState:
            delivery.state === "accepted" ? "accepted" : delivery.state,
          providerCorrelation:
            delivery.state === "accepted"
              ? delivery.correlation
              : current.providerCorrelation,
          invalidatedAt:
            delivery.state === "accepted" ? null : current.createdAt,
          resendAvailableAt:
            delivery.state === "accepted"
              ? current.resendAvailableAt
              : current.createdAt,
        });
        return { ok: true, value: delivery.state };
      },
    );
    if (!marked.ok) return marked;
    if (marked.value !== "accepted")
      return fail(
        marked.value === "unknown"
          ? "AUTH_DELIVERY_UNKNOWN"
          : "AUTH_DELIVERY_FAILED",
      );
    return {
      ok: true,
      value: {
        challengeId: reserved.value.challenge.id,
        resendAvailableAt: reserved.value.challenge.resendAvailableAt,
        maskedTarget: target.value.masked,
        continuationToken: reserved.value.continuationToken,
      },
    };
  }

  async verifyChallenge(input: {
    readonly challengeId: string;
    readonly code: string;
    readonly continuationToken: string;
    readonly idempotencyKey: string;
  }): Promise<AuthResult<AuthVerifyValue>> {
    const at = this.clock();
    const continuationHash = await hashSessionToken(input.continuationToken);
    const loaded = await this.transactional<StoredChallenge>(async (tx) => {
      const challenge = await tx.findChallenge(input.challengeId);
      if (challenge === null || challenge.continuationHash !== continuationHash)
        return fail("AUTH_PROOF_REJECTED");
      return { ok: true, value: challenge };
    });
    if (!loaded.ok) return loaded;
    let providerPassed = false;
    if (loaded.value.strategy === "provider_generated") {
      const plain = await decryptContact(
        this.options.keys,
        loaded.value.channel,
        loaded.value.ciphertext,
      );
      if (plain === null) return fail("AUTH_PROOF_REJECTED");
      const checked = await this.options.delivery.checkPhone({
        e164: plain,
        code: input.code,
        outId: loaded.value.id,
      });
      if (checked === "unknown") return fail("AUTH_DELIVERY_UNKNOWN");
      if (checked === "malformed") return fail("AUTH_DELIVERY_FAILED");
      providerPassed = checked === "pass";
    }
    return this.transactional<AuthVerifyValue>((tx) =>
      this.finishVerify(tx, input, continuationHash, providerPassed, at),
    );
  }

  async confirmRegistration(input: {
    readonly handoffToken: string;
    readonly displayName: string;
    readonly agreement: boolean;
    readonly idempotencyKey: string;
  }): Promise<AuthResult<AuthSessionGrant>> {
    if (input.agreement !== true) return fail("AUTH_AGREEMENT_REQUIRED");
    const displayName = input.displayName.trim();
    if (
      displayName !== input.displayName ||
      displayName.length < 1 ||
      displayName.length > 40 ||
      displayName.includes("\u0000")
    )
      return fail("AUTH_INVALID_DISPLAY_NAME");
    const at = this.clock();
    const tokenHash = await hashSessionToken(input.handoffToken);
    return this.transactional<AuthSessionGrant>(async (tx) => {
      const handoff = await tx.findHandoff(tokenHash);
      if (
        handoff === null ||
        handoff.purpose !== "register_confirm" ||
        !this.handoffModeOk(handoff)
      )
        return fail("AUTH_PROOF_REJECTED");
      if (new Date(handoff.expiresAt).getTime() <= at.getTime())
        return fail("AUTH_CODE_EXPIRED");
      await tx.lockDigest(handoff.targetDigest);
      const receiptKey = await this.receiptKey(
        input.idempotencyKey,
        handoff.targetDigest,
        "register",
      );
      const receipt = await tx.findReceipt(receiptKey);
      if (receipt !== null) {
        const user = await tx.lockUser(receipt.userId);
        if (user === null || user.status !== "active")
          return fail("AUTH_ACCOUNT_SUSPENDED");
        return {
          ok: true,
          value: await this.reissue(tx, receipt, user, handoff.channel, at),
        };
      }
      if (handoff.consumedAt !== null) return fail("AUTH_PROOF_REJECTED");
      if (
        (await tx.findIdentity(handoff.channel, handoff.targetDigest)) !== null
      )
        throw new AuthRollback(fail("AUTH_IDENTIFIER_CONFLICT"));
      if ((await tx.consumeHandoff(handoff.id, at.toISOString())) !== "ok")
        return fail("AUTH_PROOF_REJECTED");
      const user = await this.insertNewUser(tx, displayName);
      const inserted = await tx.insertIdentity({
        id: generateOpaqueId("login", this.randomBytes),
        userId: user.id,
        kind: handoff.channel,
        lookupDigest: handoff.targetDigest,
        ciphertext: handoff.ciphertext,
        lookupKeyVersion: this.options.keys.version,
        verificationMode: handoff.providerMode,
        environment: handoff.environment,
        version: 1,
        verifiedAt: at.toISOString(),
      });
      if (inserted === "conflict")
        throw new AuthRollback(fail("AUTH_IDENTIFIER_CONFLICT"));
      const session = await this.mint(tx, user, handoff.channel, at);
      await tx.insertReceipt({
        keyHash: receiptKey,
        userId: user.id,
        sessionId: session.sessionId,
        sessionTokenHash: session.tokenHash,
        purpose: "register",
      });
      await this.audit(tx, user.id, "register", at);
      return { ok: true, value: session };
    });
  }

  async readAccount(
    sessionToken: string,
  ): Promise<AuthResult<AuthAccountSecurity>> {
    const at = this.clock();
    const tokenHash = await hashSessionToken(sessionToken);
    return this.transactional(async (tx) => {
      const user = await tx.findSessionUser(tokenHash, at.toISOString());
      if (user === null) return fail("AUTH_UNAUTHENTICATED");
      if (user.status !== "active") return fail("AUTH_ACCOUNT_SUSPENDED");
      return { ok: true, value: await this.accountView(tx, user.id) };
    });
  }

  async completeFactor(input: {
    readonly challengeId: string;
    readonly code: string;
    readonly continuationToken: string;
    readonly reauthToken: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly sessionToken: string;
  }): Promise<
    AuthResult<{
      readonly session: AuthSessionGrant;
      readonly account: AuthAccountSecurity;
    }>
  > {
    const at = this.clock();
    const continuationHash = await hashSessionToken(input.continuationToken);
    const loaded = await this.transactional<StoredChallenge>(async (tx) => {
      const challenge = await tx.findChallenge(input.challengeId);
      if (challenge === null || challenge.continuationHash !== continuationHash)
        return fail("AUTH_PROOF_REJECTED");
      return { ok: true, value: challenge };
    });
    if (!loaded.ok) return loaded;
    let providerPassed = false;
    if (loaded.value.strategy === "provider_generated") {
      const plain = await decryptContact(
        this.options.keys,
        loaded.value.channel,
        loaded.value.ciphertext,
      );
      if (plain === null) return fail("AUTH_PROOF_REJECTED");
      const checked = await this.options.delivery.checkPhone({
        e164: plain,
        code: input.code,
        outId: loaded.value.id,
      });
      if (checked === "unknown") return fail("AUTH_DELIVERY_UNKNOWN");
      if (checked === "malformed") return fail("AUTH_DELIVERY_FAILED");
      providerPassed = checked === "pass";
    }
    const sessionHash = await hashSessionToken(input.sessionToken);
    const reauthHash = await hashSessionToken(input.reauthToken);
    return this.transactional(async (tx) => {
      const challenge = await tx.findChallenge(input.challengeId);
      if (
        challenge === null ||
        challenge.continuationHash !== continuationHash ||
        (challenge.purpose !== "link" && challenge.purpose !== "replace") ||
        !this.challengeFresh(challenge, at)
      )
        return fail("AUTH_PROOF_REJECTED");
      const user = await tx.findSessionUser(sessionHash, at.toISOString());
      if (
        user === null ||
        challenge.userId !== user.id ||
        challenge.sessionHash !== sessionHash
      )
        return fail("AUTH_UNAUTHENTICATED");
      if (user.status !== "active") return fail("AUTH_ACCOUNT_SUSPENDED");
      const receiptKey = await this.receiptKey(
        input.idempotencyKey,
        challenge.targetDigest,
        challenge.purpose,
      );
      const receipt = await tx.findReceipt(receiptKey);
      if (receipt !== null) {
        const session = await this.reissue(
          tx,
          receipt,
          user,
          challenge.channel,
          at,
        );
        return {
          ok: true,
          value: { session, account: await this.accountView(tx, user.id) },
        };
      }
      const since = new Date(at.getTime() - WINDOW_MS).toISOString();
      if (
        (await tx.failureCount(
          challenge.targetDigest,
          challenge.purpose,
          since,
        )) >= MAX_ATTEMPTS ||
        challenge.attempts >= MAX_ATTEMPTS
      )
        return fail("AUTH_CODE_EXHAUSTED");
      if (!(await this.codeAccepted(challenge, input.code, providerPassed))) {
        await tx.saveChallenge({
          ...challenge,
          attempts: challenge.attempts + 1,
        });
        await tx.addFailure(
          challenge.targetDigest,
          challenge.purpose,
          at.toISOString(),
        );
        return fail("AUTH_CODE_INVALID");
      }
      const reauth = await tx.findHandoff(reauthHash);
      if (
        reauth === null ||
        reauth.purpose !== "reauth" ||
        reauth.userId !== user.id ||
        reauth.sessionHash !== sessionHash ||
        reauth.consumedAt !== null
      )
        return fail("AUTH_PROOF_REJECTED");
      if (
        !this.handoffModeOk(reauth) ||
        new Date(reauth.expiresAt).getTime() <= at.getTime()
      )
        return fail("AUTH_PROOF_REJECTED");
      const reauthIdentity = (await tx.listIdentities(user.id)).find(
        (row) => row.kind === reauth.channel,
      );
      if (reauthIdentity === undefined || !this.provenanceOk(reauthIdentity))
        return fail("AUTH_PROOF_REJECTED");
      await tx.lockUser(user.id);
      const current = (await tx.listIdentities(user.id)).find(
        (row) => row.kind === challenge.channel,
      );
      const owner = await tx.findIdentity(
        challenge.channel,
        challenge.targetDigest,
      );
      if (owner !== null && owner.userId !== user.id)
        throw new AuthRollback(fail("AUTH_IDENTIFIER_CONFLICT"));
      if (current === undefined) {
        if (challenge.purpose !== "link" || input.expectedVersion !== 0)
          return fail("AUTH_STALE_VERSION");
        const inserted = await tx.insertIdentity(
          this.identityFrom(challenge, user.id, at),
        );
        if (inserted === "conflict")
          throw new AuthRollback(fail("AUTH_IDENTIFIER_CONFLICT"));
      } else {
        if (
          challenge.purpose !== "replace" ||
          current.version !== input.expectedVersion
        )
          return fail("AUTH_STALE_VERSION");
        if (
          current.verificationMode !== challenge.providerMode ||
          current.environment !== challenge.environment
        )
          return fail("AUTH_PROVENANCE_REJECTED");
        const replaced = await tx.replaceIdentity(
          {
            ...this.identityFrom(challenge, user.id, at),
            id: current.id,
            version: current.version + 1,
          },
          current.version,
        );
        if (replaced === "stale") return fail("AUTH_STALE_VERSION");
        if (replaced === "conflict")
          throw new AuthRollback(fail("AUTH_IDENTIFIER_CONFLICT"));
      }
      if ((await tx.consumeHandoff(reauth.id, at.toISOString())) !== "ok")
        return fail("AUTH_PROOF_REJECTED");
      await tx.saveChallenge({ ...challenge, completedAt: at.toISOString() });
      await tx.invalidateUserProofs(user.id, at.toISOString());
      const session = await this.mint(tx, user, challenge.channel, at);
      await tx.revokeOtherSessions(
        user.id,
        session.tokenHash,
        at.toISOString(),
      );
      await tx.insertReceipt({
        keyHash: receiptKey,
        userId: user.id,
        sessionId: session.sessionId,
        sessionTokenHash: session.tokenHash,
        purpose: challenge.purpose,
      });
      await this.audit(tx, user.id, challenge.purpose, at);
      return {
        ok: true,
        value: { session, account: await this.accountView(tx, user.id) },
      };
    });
  }

  async unlinkFactor(input: {
    readonly channel: AuthChannelName;
    readonly reauthToken: string;
    readonly expectedVersion: number;
    readonly idempotencyKey: string;
    readonly sessionToken: string;
  }): Promise<
    AuthResult<{
      readonly session: AuthSessionGrant;
      readonly account: AuthAccountSecurity;
    }>
  > {
    const at = this.clock();
    const sessionHash = await hashSessionToken(input.sessionToken);
    const reauthHash = await hashSessionToken(input.reauthToken);
    return this.transactional(async (tx) => {
      const user = await tx.findSessionUser(sessionHash, at.toISOString());
      if (user === null) return fail("AUTH_UNAUTHENTICATED");
      if (user.status !== "active") return fail("AUTH_ACCOUNT_SUSPENDED");
      const receiptKey = await this.receiptKey(
        input.idempotencyKey,
        user.id,
        `unlink:${input.channel}`,
      );
      const receipt = await tx.findReceipt(receiptKey);
      if (receipt !== null) {
        const session = await this.reissue(
          tx,
          receipt,
          user,
          input.channel,
          at,
        );
        return {
          ok: true,
          value: { session, account: await this.accountView(tx, user.id) },
        };
      }
      const reauth = await tx.findHandoff(reauthHash);
      if (
        reauth === null ||
        reauth.purpose !== "reauth" ||
        reauth.userId !== user.id ||
        reauth.sessionHash !== sessionHash ||
        reauth.consumedAt !== null ||
        !this.handoffModeOk(reauth)
      )
        return fail("AUTH_PROOF_REJECTED");
      await tx.lockUser(user.id);
      const identities = await tx.listIdentities(user.id);
      const reauthIdentity = identities.find(
        (row) => row.kind === reauth.channel,
      );
      if (reauthIdentity === undefined || !this.provenanceOk(reauthIdentity))
        return fail("AUTH_PROOF_REJECTED");
      const target = identities.find((row) => row.kind === input.channel);
      if (target === undefined) return fail("AUTH_INVALID_IDENTIFIER");
      if (target.version !== input.expectedVersion)
        return fail("AUTH_STALE_VERSION");
      const remaining = identities.filter(
        (row) => row.kind !== input.channel && this.provenanceOk(row),
      );
      if (remaining.length === 0) return fail("AUTH_LAST_FACTOR");
      const deleted = await tx.deleteIdentity(
        user.id,
        input.channel,
        input.expectedVersion,
      );
      if (deleted === "last_factor") return fail("AUTH_LAST_FACTOR");
      if (deleted === "stale") return fail("AUTH_STALE_VERSION");
      if (deleted !== "ok") return fail("AUTH_PROOF_REJECTED");
      if ((await tx.consumeHandoff(reauth.id, at.toISOString())) !== "ok")
        return fail("AUTH_PROOF_REJECTED");
      await tx.invalidateUserProofs(user.id, at.toISOString());
      const session = await this.mint(
        tx,
        user,
        remaining[0]?.kind ?? input.channel,
        at,
      );
      await tx.revokeOtherSessions(
        user.id,
        session.tokenHash,
        at.toISOString(),
      );
      await tx.insertReceipt({
        keyHash: receiptKey,
        userId: user.id,
        sessionId: session.sessionId,
        sessionTokenHash: session.tokenHash,
        purpose: "unlink",
      });
      await this.audit(tx, user.id, "unlink", at);
      return {
        ok: true,
        value: { session, account: await this.accountView(tx, user.id) },
      };
    });
  }

  async signOut(
    sessionToken: string,
  ): Promise<AuthResult<{ readonly signedOut: true }>> {
    const at = this.clock();
    const tokenHash = await hashSessionToken(sessionToken);
    return this.transactional(async (tx) => {
      if (!(await tx.revokeSession(tokenHash, at.toISOString())))
        return fail("AUTH_UNAUTHENTICATED");
      return { ok: true, value: { signedOut: true } };
    });
  }

  private async finishVerify(
    tx: AuthUnitOfWork,
    input: {
      readonly challengeId: string;
      readonly code: string;
      readonly idempotencyKey: string;
    },
    continuationHash: string,
    providerPassed: boolean,
    at: Date,
  ): Promise<AuthResult<AuthVerifyValue>> {
    const challenge = await tx.findChallenge(input.challengeId);
    if (challenge === null || challenge.continuationHash !== continuationHash)
      return fail("AUTH_PROOF_REJECTED");
    if (!this.challengeModeOk(challenge))
      return fail("AUTH_PROVENANCE_REJECTED");
    const receiptKey = await this.receiptKey(
      input.idempotencyKey,
      challenge.targetDigest,
      challenge.purpose,
    );
    const receipt = await tx.findReceipt(receiptKey);
    if (receipt !== null && challenge.purpose === "sign_in") {
      const user = await tx.lockUser(receipt.userId);
      if (user === null || user.status !== "active")
        return fail("AUTH_ACCOUNT_SUSPENDED");
      return {
        ok: true,
        value: {
          outcome: "signed_in",
          session: await this.reissue(tx, receipt, user, challenge.channel, at),
        },
      };
    }
    if (!this.challengeFresh(challenge, at))
      return this.staleChallenge(challenge, at);
    const since = new Date(at.getTime() - WINDOW_MS).toISOString();
    if (
      (await tx.failureCount(
        challenge.targetDigest,
        challenge.purpose,
        since,
      )) >= MAX_ATTEMPTS ||
      challenge.attempts >= MAX_ATTEMPTS
    )
      return fail("AUTH_CODE_EXHAUSTED");
    if (!(await this.codeAccepted(challenge, input.code, providerPassed))) {
      await tx.saveChallenge({
        ...challenge,
        attempts: challenge.attempts + 1,
      });
      await tx.addFailure(
        challenge.targetDigest,
        challenge.purpose,
        at.toISOString(),
      );
      return fail("AUTH_CODE_INVALID");
    }
    // Link and replace are completed only by completeFactor. Verifying them
    // here must not set completedAt, or that proof can never be used.
    if (challenge.purpose === "link" || challenge.purpose === "replace")
      return fail("AUTH_PROOF_REJECTED");
    await tx.saveChallenge({ ...challenge, completedAt: at.toISOString() });
    if (challenge.purpose === "reauthenticate") {
      if (challenge.userId === null || challenge.sessionHash === null)
        return fail("AUTH_PROOF_REJECTED");
      const token = generateSessionToken(this.randomBytes);
      await tx.insertHandoff({
        id: generateOpaqueId("handoff", this.randomBytes),
        tokenHash: await hashSessionToken(token),
        purpose: "reauth",
        channel: challenge.channel,
        targetDigest: challenge.targetDigest,
        ciphertext: challenge.ciphertext,
        providerMode: challenge.providerMode,
        environment: challenge.environment,
        userId: challenge.userId,
        sessionHash: challenge.sessionHash,
        expectedVersion: challenge.expectedVersion,
        expiresAt: new Date(at.getTime() + HANDOFF_TTL_MS).toISOString(),
        consumedAt: null,
      });
      return {
        ok: true,
        value: { outcome: "reauthenticated", reauthToken: token },
      };
    }
    const identity = await tx.findIdentity(
      challenge.channel,
      challenge.targetDigest,
    );
    if (challenge.purpose === "register") {
      if (identity !== null)
        return {
          ok: true,
          value: { outcome: "already_registered", channel: challenge.channel },
        };
      return this.issueRegistrationHandoff(tx, challenge, at);
    }
    if (challenge.purpose !== "sign_in") return fail("AUTH_PROOF_REJECTED");
    if (identity === null)
      return this.issueRegistrationHandoff(tx, challenge, at);
    const user = await tx.lockUser(identity.userId);
    if (user === null || user.status !== "active")
      return fail("AUTH_ACCOUNT_SUSPENDED");
    if (!this.provenanceOk(identity)) return fail("AUTH_PROVENANCE_REJECTED");
    const session = await this.mint(tx, user, challenge.channel, at);
    await tx.insertReceipt({
      keyHash: receiptKey,
      userId: user.id,
      sessionId: session.sessionId,
      sessionTokenHash: session.tokenHash,
      purpose: "sign_in",
    });
    await this.audit(tx, user.id, "sign_in", at);
    return { ok: true, value: { outcome: "signed_in", session } };
  }

  private async reserve(
    tx: AuthUnitOfWork,
    input: {
      readonly channel: AuthChannelName;
      readonly purpose: AuthPurposeName;
      readonly idempotencyKey: string;
      readonly source: string;
    },
    target: Target,
    at: Date,
  ): Promise<AuthResult<Reservation>> {
    const since = new Date(at.getTime() - WINDOW_MS).toISOString();
    if (
      (await tx.failureCount(target.digest, input.purpose, since)) >=
      MAX_ATTEMPTS
    )
      return fail("AUTH_CODE_EXHAUSTED");
    const idempotencyHash = await keyedHash(
      this.options.keys.lookupKey,
      `send\0${input.purpose}\0${input.channel}\0${target.digest}\0${input.idempotencyKey}\0${target.sessionHash ?? ""}`,
    );
    const existing = await tx.findChallengeByIdempotency(idempotencyHash);
    if (existing !== null) {
      if (existing.deliveryState === "failed")
        return fail("AUTH_DELIVERY_FAILED");
      if (existing.deliveryState === "unknown")
        return fail("AUTH_DELIVERY_UNKNOWN");
      return {
        ok: true,
        value: {
          kind: "replay",
          accepted: {
            challengeId: existing.id,
            resendAvailableAt: existing.resendAvailableAt,
            maskedTarget: target.masked,
          },
        },
      };
    }
    const open = await tx.openChallenge({
      channel: input.channel,
      purpose: input.purpose,
      targetDigest: target.digest,
    });
    if (
      open !== null &&
      new Date(open.resendAvailableAt).getTime() > at.getTime()
    ) {
      return {
        ok: true,
        value: {
          kind: "replay",
          accepted: {
            challengeId: open.id,
            resendAvailableAt: open.resendAvailableAt,
            maskedTarget: target.masked,
          },
        },
      };
    }
    const sourceKey = await keyedHash(
      this.options.keys.lookupKey,
      `source\0${input.source}`,
    );
    if (
      (await tx.sendCount("target", target.digest, since)) >= TARGET_SENDS ||
      (await tx.sendCount("source", sourceKey, since)) >= SOURCE_SENDS ||
      (await tx.sendCount("global", "global", since)) >= GLOBAL_SENDS
    )
      return fail("AUTH_RATE_LIMITED");
    if (open !== null)
      await tx.saveChallenge({ ...open, supersededAt: at.toISOString() });
    const mode = this.modeFor(input.channel);
    if (mode === "disabled") return fail("AUTH_CHANNEL_UNAVAILABLE");
    const strategy =
      mode === "provider" && input.channel === "phone"
        ? "provider_generated"
        : "application_otp";
    const code = strategy === "application_otp" ? generateEmailOtp() : null;
    const id = generateOpaqueId("challenge", this.randomBytes);
    const continuationToken = generateSessionToken(this.randomBytes);
    const challenge: StoredChallenge = {
      id,
      channel: input.channel,
      purpose: input.purpose,
      targetDigest: target.digest,
      ciphertext: target.ciphertext,
      verifier:
        code === null
          ? null
          : await otpVerifier(
              this.options.keys,
              id,
              input.purpose,
              target.digest,
              code,
            ),
      strategy,
      providerMode: mode,
      environment: this.options.environment,
      userId: target.userId,
      sessionHash: target.sessionHash,
      continuationHash: await hashSessionToken(continuationToken),
      expectedVersion: target.expectedVersion,
      reauthHash: target.reauthHash,
      providerCorrelation: null,
      expiresAt: new Date(at.getTime() + OTP_TTL_MS).toISOString(),
      attempts: 0,
      resendAvailableAt: new Date(at.getTime() + RESEND_MS).toISOString(),
      supersededAt: null,
      completedAt: null,
      invalidatedAt: null,
      deliveryState: "pending",
      idempotencyHash,
      createdAt: at.toISOString(),
    };
    if ((await tx.insertChallenge(challenge)) === "conflict") {
      const raced = await tx.findChallengeByIdempotency(idempotencyHash);
      if (raced === null) return fail("AUTH_RATE_LIMITED");
      return {
        ok: true,
        value: {
          kind: "replay",
          accepted: {
            challengeId: raced.id,
            resendAvailableAt: raced.resendAvailableAt,
            maskedTarget: target.masked,
          },
        },
      };
    }
    await tx.addSend("target", target.digest, at.toISOString());
    await tx.addSend("source", sourceKey, at.toISOString());
    await tx.addSend("global", "global", at.toISOString());
    return {
      ok: true,
      value: {
        kind: "send",
        challenge,
        continuationToken,
        destination: target.destination,
        code,
      },
    };
  }

  private async resolveTarget(
    input: {
      readonly channel: AuthChannelName;
      readonly purpose: AuthPurposeName;
      readonly identifier?: string | undefined;
      readonly sessionToken?: string | undefined;
      readonly reauthToken?: string | undefined;
    },
    session: { readonly user: StoredUser; readonly sessionHash: string } | null,
    at: Date,
  ): Promise<AuthResult<Target>> {
    if (
      input.purpose === "reauthenticate" ||
      input.purpose === "link" ||
      input.purpose === "replace"
    ) {
      if (session === null) return fail("AUTH_UNAUTHENTICATED");
      if (session.user.status !== "active")
        return fail("AUTH_ACCOUNT_SUSPENDED");
    }
    if (input.purpose === "reauthenticate") {
      if (session === null) return fail("AUTH_UNAUTHENTICATED");
      return this.transactional(async (tx) => {
        const identity = (await tx.listIdentities(session.user.id)).find(
          (row) => row.kind === input.channel,
        );
        if (identity === undefined || !this.provenanceOk(identity))
          return fail("AUTH_INVALID_IDENTIFIER");
        const destination = await decryptContact(
          this.options.keys,
          input.channel,
          identity.ciphertext,
        );
        if (destination === null) return fail("AUTH_PROOF_REJECTED");
        return {
          ok: true,
          value: {
            digest: identity.lookupDigest,
            destination,
            masked:
              input.channel === "email"
                ? maskEmail(destination)
                : maskPhone(destination),
            ciphertext: identity.ciphertext,
            userId: session.user.id,
            sessionHash: session.sessionHash,
            expectedVersion: identity.version,
            reauthHash: null,
          },
        };
      });
    }
    const normalized = this.normalize(input.channel, input.identifier ?? "");
    if (normalized === null) return fail("AUTH_INVALID_IDENTIFIER");
    let reauthHash: string | null = null;
    if (input.purpose === "link" || input.purpose === "replace") {
      if (session === null || input.reauthToken === undefined)
        return fail("AUTH_PROOF_REJECTED");
      reauthHash = await hashSessionToken(input.reauthToken);
      const reauth = await this.transactional<StoredHandoff>(async (tx) => {
        const row = await tx.findHandoff(reauthHash ?? "");
        if (row === null) return fail("AUTH_PROOF_REJECTED");
        return { ok: true, value: row };
      });
      if (!reauth.ok) return reauth;
      if (
        reauth.value.purpose !== "reauth" ||
        reauth.value.userId !== session.user.id ||
        reauth.value.sessionHash !== session.sessionHash ||
        reauth.value.consumedAt !== null ||
        new Date(reauth.value.expiresAt).getTime() <= at.getTime()
      )
        return fail("AUTH_PROOF_REJECTED");
    }
    return {
      ok: true,
      value: {
        digest: await lookupDigest(
          input.channel,
          normalized.lookup,
          this.options.keys,
        ),
        destination: normalized.delivery,
        masked: normalized.masked,
        ciphertext: await encryptContact(
          this.options.keys,
          input.channel,
          normalized.delivery,
        ),
        userId: session?.user.id ?? null,
        sessionHash: session?.sessionHash ?? null,
        expectedVersion: null,
        reauthHash,
      },
    };
  }

  private async optionalSession(
    token: string | undefined,
    at: Date,
  ): Promise<
    AuthResult<{
      readonly user: StoredUser;
      readonly sessionHash: string;
    } | null>
  > {
    if (token === undefined) return { ok: true, value: null };
    const sessionHash = await hashSessionToken(token);
    return this.transactional(async (tx) => {
      const user = await tx.findSessionUser(sessionHash, at.toISOString());
      if (user === null) return fail("AUTH_UNAUTHENTICATED");
      return { ok: true, value: { user, sessionHash } };
    });
  }

  private async issueRegistrationHandoff(
    tx: AuthUnitOfWork,
    challenge: StoredChallenge,
    at: Date,
  ): Promise<AuthResult<AuthVerifyValue>> {
    const token = generateSessionToken(this.randomBytes);
    await tx.insertHandoff({
      id: generateOpaqueId("handoff", this.randomBytes),
      tokenHash: await hashSessionToken(token),
      purpose: "register_confirm",
      channel: challenge.channel,
      targetDigest: challenge.targetDigest,
      ciphertext: challenge.ciphertext,
      providerMode: challenge.providerMode,
      environment: challenge.environment,
      userId: null,
      sessionHash: null,
      expectedVersion: null,
      expiresAt: new Date(at.getTime() + HANDOFF_TTL_MS).toISOString(),
      consumedAt: null,
    });
    const plain = await decryptContact(
      this.options.keys,
      challenge.channel,
      challenge.ciphertext,
    );
    return {
      ok: true,
      value: {
        outcome: "registration_required",
        handoffToken: token,
        maskedTarget:
          plain === null
            ? "***"
            : challenge.channel === "email"
              ? maskEmail(plain)
              : maskPhone(plain),
        channel: challenge.channel,
      },
    };
  }

  private async deliver(
    reserved: Extract<Reservation, { kind: "send" }>,
  ): Promise<DeliveryOutcome> {
    try {
      if (reserved.challenge.channel === "email") {
        if (reserved.code === null) return { state: "failed" };
        return await this.options.delivery.sendEmail({
          to: reserved.destination,
          code: reserved.code,
          minutes: 5,
        });
      }
      return await this.options.delivery.sendPhone({
        e164: reserved.destination,
        code: reserved.code,
        outId: reserved.challenge.id,
        minutes: 5,
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      return name === "TimeoutError" || name === "AbortError"
        ? { state: "unknown" }
        : { state: "failed" };
    }
  }

  private async codeAccepted(
    challenge: StoredChallenge,
    code: string,
    providerPassed: boolean,
  ): Promise<boolean> {
    if (challenge.strategy === "provider_generated") return providerPassed;
    if (challenge.verifier === null) return false;
    return verifierMatches(
      challenge.verifier,
      await otpVerifier(
        this.options.keys,
        challenge.id,
        challenge.purpose,
        challenge.targetDigest,
        code,
      ),
    );
  }

  private async mint(
    tx: AuthUnitOfWork,
    user: StoredUser,
    channel: AuthChannelName,
    at: Date,
  ): Promise<Minted> {
    const token = generateSessionToken(this.randomBytes);
    const tokenHash = await hashSessionToken(token);
    const sessionId = generateOpaqueId("session", this.randomBytes);
    const expiresAt = new Date(at.getTime() + this.sessionTtlMs).toISOString();
    await tx.insertSession({
      id: sessionId,
      tokenHash,
      userId: user.id,
      issuedAt: at.toISOString(),
      expiresAt,
      issuer: "verified_login",
      authEnvironment: this.options.environment,
      authChannel: channel,
    });
    return {
      token,
      expiresAt,
      profile: mapPublicUserProfile({
        id: user.id as PublicUserId,
        handle: user.handle,
        displayName: user.displayName,
        status: user.status,
      }),
      sessionId,
      tokenHash,
    };
  }

  private async reissue(
    tx: AuthUnitOfWork,
    receipt: StoredReceipt,
    user: StoredUser,
    channel: AuthChannelName,
    at: Date,
  ): Promise<AuthSessionGrant> {
    await tx.revokeSession(receipt.sessionTokenHash, at.toISOString());
    const session = await this.mint(tx, user, channel, at);
    await tx.updateReceiptSession(
      receipt.keyHash,
      session.sessionId,
      session.tokenHash,
    );
    return session;
  }

  private async insertNewUser(
    tx: AuthUnitOfWork,
    displayName: string,
  ): Promise<StoredUser> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const user: StoredUser = {
        id: generateOpaqueId("user", this.randomBytes),
        handle: this.generateHandle(),
        displayName,
        status: "active",
      };
      if ((await tx.insertUser(user)) === "ok") return user;
    }
    throw new Error("Could not assign a handle");
  }

  private async accountView(
    tx: AuthUnitOfWork,
    userId: string,
  ): Promise<AuthAccountSecurity> {
    const identities = await tx.listIdentities(userId);
    const factor = async (channel: AuthChannelName): Promise<AuthFactor> => {
      const identity = identities.find((row) => row.kind === channel);
      if (identity === undefined)
        return {
          channel,
          state: "unbound",
          masked: null,
          version: 0,
          usable: false,
        };
      const plain = await decryptContact(
        this.options.keys,
        channel,
        identity.ciphertext,
      );
      const masked =
        plain === null
          ? "***"
          : channel === "email"
            ? maskEmail(plain)
            : maskPhone(plain);
      const usable = this.provenanceOk(identity);
      const pending = await tx.hasOpenFactorChange(userId, channel);
      const state = !this.channelAvailable(channel)
        ? "unavailable"
        : pending
          ? "pending"
          : "verified";
      return { channel, state, masked, version: identity.version, usable };
    };
    return {
      userId,
      email: await factor("email"),
      phone: await factor("phone"),
      capabilities: this.capabilities(),
    };
  }

  private async audit(
    tx: AuthUnitOfWork,
    userId: string,
    action: string,
    at: Date,
  ): Promise<void> {
    await tx.insertAudit({
      id: generateOpaqueId("auth-audit", this.randomBytes),
      userId,
      action,
      atIso: at.toISOString(),
    });
  }

  private identityFrom(
    challenge: StoredChallenge,
    userId: string,
    at: Date,
  ): StoredIdentity {
    return {
      id: generateOpaqueId("login", this.randomBytes),
      userId,
      kind: challenge.channel,
      lookupDigest: challenge.targetDigest,
      ciphertext: challenge.ciphertext,
      lookupKeyVersion: this.options.keys.version,
      verificationMode: challenge.providerMode,
      environment: challenge.environment,
      version: 1,
      verifiedAt: at.toISOString(),
    };
  }

  private staleChallenge(
    challenge: StoredChallenge,
    at: Date,
  ): AuthResult<never> {
    if (challenge.supersededAt !== null) return fail("AUTH_CODE_SUPERSEDED");
    if (new Date(challenge.expiresAt).getTime() <= at.getTime())
      return fail("AUTH_CODE_EXPIRED");
    return fail("AUTH_PROOF_REJECTED");
  }

  private challengeFresh(challenge: StoredChallenge, at: Date): boolean {
    return (
      challenge.supersededAt === null &&
      challenge.invalidatedAt === null &&
      challenge.completedAt === null &&
      challenge.deliveryState === "accepted" &&
      new Date(challenge.expiresAt).getTime() > at.getTime()
    );
  }

  private normalize(
    channel: AuthChannelName,
    identifier: string,
  ): {
    readonly lookup: string;
    readonly delivery: string;
    readonly masked: string;
  } | null {
    if (channel === "email") {
      const email = normalizeEmail(identifier);
      if (email === null) return null;
      return {
        lookup: email.lookup,
        delivery: email.delivery,
        masked: maskEmail(email.delivery),
      };
    }
    const phone = normalizePhone(identifier);
    if (phone === null) return null;
    return { lookup: phone, delivery: phone, masked: maskPhone(phone) };
  }

  private channelAvailable(channel: AuthChannelName): boolean {
    return this.modeFor(channel) !== "disabled";
  }

  private modeFor(channel: AuthChannelName): VerificationMode | "disabled" {
    return channel === "email"
      ? this.options.emailMode
      : this.options.phoneMode;
  }

  private provenanceOk(identity: StoredIdentity): boolean {
    return (
      identity.environment === this.options.environment &&
      identity.verificationMode === this.modeFor(identity.kind)
    );
  }

  private challengeModeOk(challenge: StoredChallenge): boolean {
    return (
      challenge.environment === this.options.environment &&
      challenge.providerMode === this.modeFor(challenge.channel)
    );
  }

  private handoffModeOk(handoff: StoredHandoff): boolean {
    return (
      handoff.environment === this.options.environment &&
      handoff.providerMode === this.modeFor(handoff.channel)
    );
  }

  private async receiptKey(
    idempotencyKey: string,
    target: string,
    purpose: string,
  ): Promise<string> {
    return await keyedHash(
      this.options.keys.lookupKey,
      `receipt\0${purpose}\0${target}\0${idempotencyKey}`,
    );
  }

  private generateHandle(): string {
    const bytes = this.randomBytes(12);
    let handle = "u";
    for (const byte of bytes)
      handle += HANDLE_ALPHABET[byte % HANDLE_ALPHABET.length] ?? "a";
    return handle;
  }

  private async transactional<T>(
    work: (tx: AuthUnitOfWork) => Promise<AuthResult<T>>,
  ): Promise<AuthResult<T>> {
    try {
      return await this.port.transaction(work);
    } catch (error) {
      if (error instanceof AuthRollback) return error.result as AuthResult<T>;
      if (attemptsBound(error)) return fail("AUTH_CODE_EXHAUSTED");
      throw error;
    }
  }
}
