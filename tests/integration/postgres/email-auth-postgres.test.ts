import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

import {
  CommunityAuthService,
  assertProductionAuthConfiguration,
  createDevelopmentAuthService,
} from "@moya/api";
import {
  createPostgresPool,
  parsePostgresConfig,
} from "@moya/catalog-postgres";
import {
  PostgresCommunityAuthAdapter,
  requiredCommunityMigrations,
  runCommunityMigrations,
  verifyCommunityMigrationLedger,
} from "@moya/community-postgres";
import { afterAll, describe, expect, it } from "vitest";

import { requireSyntheticTestDatabaseUrl } from "./synthetic-test-database.js";

import type { AuthDeliveryPorts } from "@moya/api";

type Pool = ReturnType<typeof createPostgresPool>;

const ownerUrl = requireSyntheticTestDatabaseUrl();
const root = fileURLToPath(new URL("../../../", import.meta.url));
const migrationsDirectory = path.join(root, "database", "community-migrations");
const baselineMigrationId = "20260921010000";
const authMigrationId = "20260922010000";
const keys = {
  version: 1,
  lookupKey: Buffer.alloc(32, 11),
  encryptionKey: Buffer.alloc(32, 12),
  otpKey: Buffer.alloc(32, 13),
};
const codes: string[] = [];
const delivery = (): AuthDeliveryPorts => ({
  sendEmail: async (input) => {
    codes.push(input.code);
    return { state: "accepted", correlation: "pg-mail" };
  },
  sendPhone: async (input) => {
    if (input.code !== null) codes.push(input.code);
    return { state: "accepted", correlation: "pg-sms" };
  },
  checkPhone: async () => "fail",
});
const key = () => randomUUID();
const latest = () => {
  const code = codes.at(-1);
  if (code === undefined) throw new Error("missing captured code");
  return code;
};

const owner = createPostgresPool(
  parsePostgresConfig({ DATABASE_URL: ownerUrl }),
);
const pools = new Set<Pool>([owner]);
const poolFor = (url: string) => {
  const pool = createPostgresPool(parsePostgresConfig({ DATABASE_URL: url }));
  pools.add(pool);
  return pool;
};

const catalogStubs = `
  CREATE TABLE IF NOT EXISTS public.catalog_entries(
    catalog_id text PRIMARY KEY, province text, province_state text
  );
  CREATE TABLE IF NOT EXISTS public.catalog_discovery(
    catalog_id text PRIMARY KEY, kind text, title text, aliases varchar[],
    first_published_at timestamptz, filter_metadata jsonb
  );
  CREATE TABLE IF NOT EXISTS public.catalog_media(
    catalog_id text, media_id text, object_key text,
    width integer, height integer, is_representative boolean
  );
`;

const applyGrants = async (database: Pool, role: string) => {
  const sql = (
    await readFile(
      path.join(root, "infra/development/work-publishing/grant-runtime.sql"),
      "utf8",
    )
  ).replaceAll(':"app_role"', `"${role}"`);
  await database.query(sql);
};

const serviceFor = (
  pool: Pool,
  phone: "simulated" | "disabled" = "simulated",
) =>
  new CommunityAuthService(new PostgresCommunityAuthAdapter(pool), {
    environment: "development",
    profile: phone === "simulated" ? "full-local" : "email-first",
    keys,
    emailMode: "local_capture",
    phoneMode: phone,
    delivery: delivery(),
  });

const register = async (
  service: CommunityAuthService,
  channel: "email" | "phone",
  identifier: string,
  displayName: string,
) => {
  const sent = await service.sendChallenge({
    channel,
    purpose: "register",
    identifier,
    idempotencyKey: key(),
    source: "127.0.0.1",
  });
  if (!sent.ok || sent.value.continuationToken === undefined)
    throw new Error(sent.ok ? "missing continuation" : sent.reason);
  const verified = await service.verifyChallenge({
    challengeId: sent.value.challengeId,
    code: latest(),
    continuationToken: sent.value.continuationToken,
    idempotencyKey: key(),
  });
  if (!verified.ok || verified.value.outcome !== "registration_required")
    throw new Error(verified.ok ? verified.value.outcome : verified.reason);
  const registered = await service.confirmRegistration({
    handoffToken: verified.value.handoffToken,
    displayName,
    agreement: true,
    idempotencyKey: key(),
  });
  if (!registered.ok) throw new Error(registered.reason);
  return registered.value;
};

const reauthenticate = async (
  service: CommunityAuthService,
  token: string,
  channel: "email" | "phone",
) => {
  const sent = await service.sendChallenge({
    channel,
    purpose: "reauthenticate",
    idempotencyKey: key(),
    source: "127.0.0.1",
    sessionToken: token,
  });
  if (!sent.ok || sent.value.continuationToken === undefined)
    throw new Error(sent.ok ? "missing continuation" : sent.reason);
  const verified = await service.verifyChallenge({
    challengeId: sent.value.challengeId,
    code: latest(),
    continuationToken: sent.value.continuationToken,
    idempotencyKey: key(),
  });
  if (!verified.ok || verified.value.outcome !== "reauthenticated")
    throw new Error(verified.ok ? verified.value.outcome : verified.reason);
  return verified.value.reauthToken;
};

afterAll(async () => {
  await Promise.all([...pools].map((pool) => pool.end()));
});

describe("email-auth PostgreSQL", () => {
  it("upgrades from the pre-auth baseline and a clean install matches the ledger", async () => {
    const upgradeName = "email_auth_upgrade_synthetic";
    await owner.query(`DROP DATABASE IF EXISTS ${upgradeName}`);
    await owner.query(`CREATE DATABASE ${upgradeName}`);
    const upgradeUrl = new URL(ownerUrl);
    upgradeUrl.pathname = `/${upgradeName}`;
    const upgrade = poolFor(upgradeUrl.toString());
    expect(
      await runCommunityMigrations(upgrade, migrationsDirectory, {
        through: baselineMigrationId,
      }),
    ).not.toContain(authMigrationId);
    await expect(
      upgrade.query("SELECT 1 FROM community.user_login_identities"),
    ).rejects.toMatchObject({ code: "42P01" });
    expect(await runCommunityMigrations(upgrade, migrationsDirectory)).toEqual([
      authMigrationId,
    ]);
    expect(await runCommunityMigrations(upgrade, migrationsDirectory)).toEqual(
      [],
    );
    await owner.query("DROP SCHEMA IF EXISTS community CASCADE");
    expect(await runCommunityMigrations(owner, migrationsDirectory)).toEqual(
      requiredCommunityMigrations.map((file) => file.migrationId),
    );
    expect(await runCommunityMigrations(owner, migrationsDirectory)).toEqual(
      [],
    );
    const ledger = await owner.query<{
      migration_id: string;
      checksum: string;
    }>(
      "SELECT migration_id, checksum FROM community.schema_migrations ORDER BY migration_id",
    );
    expect(ledger.rows.map((row) => row.migration_id)).toEqual(
      requiredCommunityMigrations.map((file) => file.migrationId),
    );
    expect(
      ledger.rows.find((row) => row.migration_id === authMigrationId)?.checksum,
    ).toBe(
      requiredCommunityMigrations.find(
        (file) => file.migrationId === authMigrationId,
      )?.checksum,
    );
    await verifyCommunityMigrationLedger(owner);
  });

  it("converges runtime grants and enforces auth rules as the App role", async () => {
    const role = "email_auth_app";
    const password = "synthetic-test-only";
    await owner.query("TRUNCATE TABLE community.public_users CASCADE");
    await owner.query(catalogStubs);
    await owner.query(
      "CREATE TABLE IF NOT EXISTS public.unrelated_acceptance_probe(id integer)",
    );
    await owner.query(
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN EXECUTE 'DROP OWNED BY ${role}'; EXECUTE 'DROP ROLE ${role}'; END IF; END $$`,
    );
    await owner.query(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`,
    );
    await owner.query(
      `GRANT CONNECT ON DATABASE ${new URL(ownerUrl).pathname.slice(1)} TO ${role}`,
    );
    await applyGrants(owner, role);
    await applyGrants(owner, role);
    const appUrl = new URL(ownerUrl);
    appUrl.username = role;
    appUrl.password = password;
    const app = poolFor(appUrl.toString());
    await verifyCommunityMigrationLedger(app);
    const service = serviceFor(app);
    const email = await register(
      service,
      "email",
      "pg-owner@example.com",
      "库测",
    );
    const again = await service.sendChallenge({
      channel: "email",
      purpose: "sign_in",
      identifier: "pg-owner@example.com",
      idempotencyKey: key(),
      source: "127.0.0.1",
    });
    await service.signOut(email.token);
    if (!again.ok || again.value.continuationToken === undefined)
      throw new Error("sign-in send");
    const signed = await service.verifyChallenge({
      challengeId: again.value.challengeId,
      code: latest(),
      continuationToken: again.value.continuationToken,
      idempotencyKey: key(),
    });
    expect(
      signed.ok &&
        signed.value.outcome === "signed_in" &&
        signed.value.session.profile.id,
    ).toBe(email.profile.id);
    expect(await service.readAccount(email.token)).toMatchObject({
      ok: false,
      reason: "AUTH_UNAUTHENTICATED",
    });
    const revoked = await app.query<{ revoked_at: Date | null }>(
      "SELECT revoked_at FROM community.sessions WHERE user_id=$1 ORDER BY issued_at",
      [email.profile.id],
    );
    expect(revoked.rows.some((row) => row.revoked_at !== null)).toBe(true);

    const current =
      signed.ok && signed.value.outcome === "signed_in"
        ? signed.value.session.token
        : "";
    const proof = await reauthenticate(service, current, "email");
    const linked = await service.sendChallenge({
      channel: "phone",
      purpose: "link",
      identifier: "13800138001",
      idempotencyKey: key(),
      source: "127.0.0.1",
      sessionToken: current,
      reauthToken: proof,
    });
    if (!linked.ok || linked.value.continuationToken === undefined)
      throw new Error("link");
    const bound = await service.completeFactor({
      challengeId: linked.value.challengeId,
      code: latest(),
      continuationToken: linked.value.continuationToken,
      reauthToken: proof,
      expectedVersion: 0,
      idempotencyKey: key(),
      sessionToken: current,
    });
    expect(bound.ok && bound.value.account.userId).toBe(email.profile.id);
    if (!bound.ok) return;
    const phoneToken = bound.value.session.token;
    await service.signOut(phoneToken);
    const phoneSignIn = await service.sendChallenge({
      channel: "phone",
      purpose: "sign_in",
      identifier: "+8613800138001",
      idempotencyKey: key(),
      source: "127.0.0.1",
    });
    if (!phoneSignIn.ok || phoneSignIn.value.continuationToken === undefined)
      throw new Error("phone sign-in");
    const byPhone = await service.verifyChallenge({
      challengeId: phoneSignIn.value.challengeId,
      code: latest(),
      continuationToken: phoneSignIn.value.continuationToken,
      idempotencyKey: key(),
    });
    expect(
      byPhone.ok &&
        byPhone.value.outcome === "signed_in" &&
        byPhone.value.session.profile.id,
    ).toBe(email.profile.id);

    const phoneAccount = await register(
      service,
      "phone",
      "13900139000",
      "手机户",
    );
    const phoneProof = await reauthenticate(
      service,
      phoneAccount.token,
      "phone",
    );
    const emailLink = await service.sendChallenge({
      channel: "email",
      purpose: "link",
      identifier: "phone-first@example.com",
      idempotencyKey: key(),
      source: "127.0.0.1",
      sessionToken: phoneAccount.token,
      reauthToken: phoneProof,
    });
    if (!emailLink.ok || emailLink.value.continuationToken === undefined)
      throw new Error("email link");
    const emailBound = await service.completeFactor({
      challengeId: emailLink.value.challengeId,
      code: latest(),
      continuationToken: emailLink.value.continuationToken,
      reauthToken: phoneProof,
      expectedVersion: 0,
      idempotencyKey: key(),
      sessionToken: phoneAccount.token,
    });
    expect(emailBound.ok && emailBound.value.account.userId).toBe(
      phoneAccount.profile.id,
    );
    if (emailBound.ok) {
      const token = emailBound.value.session.token;
      const emailProof = await reauthenticate(service, token, "email");
      const phoneProof = await reauthenticate(service, token, "phone");
      const [dropEmail, dropPhone] = await Promise.all([
        service.unlinkFactor({
          channel: "email",
          reauthToken: emailProof,
          expectedVersion: emailBound.value.account.email.version,
          idempotencyKey: key(),
          sessionToken: token,
        }),
        service.unlinkFactor({
          channel: "phone",
          reauthToken: phoneProof,
          expectedVersion: emailBound.value.account.phone.version,
          idempotencyKey: key(),
          sessionToken: token,
        }),
      ]);
      expect([dropEmail, dropPhone].filter((result) => result.ok)).toHaveLength(
        1,
      );
      const remaining = await app.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM community.user_login_identities WHERE user_id=$1",
        [phoneAccount.profile.id],
      );
      expect(Number(remaining.rows[0]?.count)).toBe(1);
    }
    const users = await app.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM community.public_users",
    );
    const identities = await app.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM community.user_login_identities",
    );
    expect(Number(users.rows[0]?.count)).toBe(2);
    // The concurrent unlink keeps one factor on the phone-created account.
    expect(Number(identities.rows[0]?.count)).toBe(3);

    for (const sql of [
      "UPDATE community.user_login_identities SET user_id=user_id",
      "UPDATE community.user_login_identities SET verification_mode=verification_mode",
      "UPDATE community.user_login_identities SET environment=environment",
      "UPDATE community.sessions SET user_id=user_id",
      "DELETE FROM community.public_users",
      "CREATE TABLE community.qa_forbidden(id int)",
      "UPDATE community.schema_migrations SET checksum=checksum",
      "INSERT INTO community.development_accounts(user_id, label) VALUES ('user-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'x')",
      "ALTER ROLE email_auth_app SUPERUSER",
      "CREATE ROLE email_auth_escalated LOGIN",
      "SELECT id FROM public.unrelated_acceptance_probe",
    ])
      await expect(app.query(sql)).rejects.toMatchObject({ code: "42501" });
    const owners = await owner.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM community.account_publishing_capacity WHERE capacity_class='owner'",
    );
    expect(Number(owners.rows[0]?.count)).toBe(0);

    await owner.query(
      "UPDATE community.user_login_identities SET verification_mode='provider' WHERE kind='email' AND environment='development'",
    );
    const tainted = await service.sendChallenge({
      channel: "email",
      purpose: "sign_in",
      identifier: "pg-owner@example.com",
      idempotencyKey: key(),
      source: "127.0.0.1",
    });
    if (!tainted.ok || tainted.value.continuationToken === undefined)
      throw new Error("tainted sign-in");
    expect(
      await service.verifyChallenge({
        challengeId: tainted.value.challengeId,
        code: latest(),
        continuationToken: tainted.value.continuationToken,
        idempotencyKey: key(),
      }),
    ).toMatchObject({ ok: false, reason: "AUTH_PROVENANCE_REJECTED" });
    const emailFirst = serviceFor(app, "disabled");
    expect(
      await emailFirst.sendChallenge({
        channel: "phone",
        purpose: "sign_in",
        identifier: "+8613800138001",
        idempotencyKey: key(),
        source: "127.0.0.1",
      }),
    ).toMatchObject({ ok: false, reason: "AUTH_CHANNEL_UNAVAILABLE" });

    expect(() =>
      assertProductionAuthConfiguration({
        NODE_ENV: "production",
        AUTH_PROFILE: "full-local",
      }),
    ).toThrow(/Production rejects/);
    expect(
      createDevelopmentAuthService(new PostgresCommunityAuthAdapter(app), {
        NODE_ENV: "development",
      }),
    ).toBeNull();
  });

  it("rejects duplicate, stale, replayed and cross-purpose proofs", async () => {
    const appUrl = new URL(ownerUrl);
    appUrl.username = "email_auth_app";
    appUrl.password = "synthetic-test-only";
    const service = serviceFor(poolFor(appUrl.toString()));
    const sent = await service.sendChallenge({
      channel: "email",
      purpose: "register",
      identifier: "race@example.com",
      idempotencyKey: key(),
      source: "127.0.0.1",
    });
    if (!sent.ok || sent.value.continuationToken === undefined)
      throw new Error("race send");
    const verified = await service.verifyChallenge({
      challengeId: sent.value.challengeId,
      code: latest(),
      continuationToken: sent.value.continuationToken,
      idempotencyKey: key(),
    });
    if (!verified.ok || verified.value.outcome !== "registration_required")
      throw new Error("race verify");
    const idempotencyKey = key();
    const [first, second] = await Promise.all([
      service.confirmRegistration({
        handoffToken: verified.value.handoffToken,
        displayName: "竞态甲",
        agreement: true,
        idempotencyKey,
      }),
      service.confirmRegistration({
        handoffToken: verified.value.handoffToken,
        displayName: "竞态乙",
        agreement: true,
        idempotencyKey: key(),
      }),
    ]);
    const winners = [first, second].filter((result) => result.ok);
    expect(winners).toHaveLength(1);
    const replay = await service.verifyChallenge({
      challengeId: sent.value.challengeId,
      code: latest(),
      continuationToken: sent.value.continuationToken,
      idempotencyKey: key(),
    });
    expect(replay).toMatchObject({ ok: false, reason: "AUTH_PROOF_REJECTED" });
    if (!first.ok && !second.ok) return;
    const winner = first.ok ? first.value : second.ok ? second.value : null;
    if (winner === null) return;
    const proof = await reauthenticate(service, winner.token, "email");
    const replace = await service.sendChallenge({
      channel: "email",
      purpose: "replace",
      identifier: "pg-owner@example.com",
      idempotencyKey: key(),
      source: "127.0.0.1",
      sessionToken: winner.token,
      reauthToken: proof,
    });
    if (!replace.ok || replace.value.continuationToken === undefined)
      throw new Error("replace");
    expect(
      await service.completeFactor({
        challengeId: replace.value.challengeId,
        code: latest(),
        continuationToken: replace.value.continuationToken,
        reauthToken: proof,
        expectedVersion: 1,
        idempotencyKey: key(),
        sessionToken: winner.token,
      }),
    ).toMatchObject({ ok: false, reason: "AUTH_IDENTIFIER_CONFLICT" });
    const own = await service.sendChallenge({
      channel: "email",
      purpose: "replace",
      identifier: "replacement@example.com",
      idempotencyKey: key(),
      source: "127.0.0.1",
      sessionToken: winner.token,
      reauthToken: proof,
    });
    if (!own.ok || own.value.continuationToken === undefined)
      throw new Error("own replace");
    expect(
      await service.completeFactor({
        challengeId: own.value.challengeId,
        code: latest(),
        continuationToken: own.value.continuationToken,
        reauthToken: proof,
        expectedVersion: 99,
        idempotencyKey: key(),
        sessionToken: winner.token,
      }),
    ).toMatchObject({ ok: false, reason: "AUTH_STALE_VERSION" });
    expect(
      await service.completeFactor({
        challengeId: sent.value.challengeId,
        code: "000000",
        continuationToken: sent.value.continuationToken,
        reauthToken: proof,
        expectedVersion: 1,
        idempotencyKey: key(),
        sessionToken: winner.token,
      }),
    ).toMatchObject({ ok: false });
  });
});
