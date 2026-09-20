-- agent-connections-v1 (Issue #141 r15): the two roles the r13 grant plan said
-- would have to exist the day the authorization service did.
--
-- infra/development/work-publishing/grant-runtime.sql says, of
-- agent_connection_provider_artifacts and agent_connection_wrappers:
--
--   "The intent is a SECOND SQL role owned by the authorization service, not
--    this shared App role ... That role does not exist yet because the service
--    does not, and the day it lands this file stops being the whole grant plan."
--
-- The service landed. This is the rest of the plan, and it splits into TWO
-- roles rather than one, because the authorization path has two halves that
-- must not be able to do each other's job:
--
--   provider role  -- the OAuth provider. Owns the protocol's own storage and
--                     mints tokens. Never sees an Owner session, and cannot
--                     record a consent decision.
--   consent role   -- the Admin control plane. Authenticates the Owner and
--                     records decisions. Cannot mint a grant or a token.
--
-- Neither is a superuser and neither is the migration account.
--
-- Run as the database owner, after the community migrations, having named the
-- two roles first:
--
--   SELECT set_config('agent_connections.provider_role', 'yoyi_dev_auth', false);
--   SELECT set_config('agent_connections.consent_role',  'yoyi_dev_consent', false);
--
-- The whole file is ONE plain DO block on purpose. A psql-only spelling with
-- \gexec or :'variables' could not be executed by a driver, which would mean
-- the committed regression tested a re-typed copy of these grants rather than
-- this file. Every GRANT below is therefore the one a test actually runs.
--
-- Synthetic local passwords only. These roles do not exist in Production,
-- which provisions its own credentials independently.
DO $$
DECLARE
  provider_role text := current_setting('agent_connections.provider_role');
  consent_role  text := current_setting('agent_connections.consent_role');
BEGIN
  IF provider_role = consent_role THEN
    RAISE EXCEPTION 'the provider and consent roles must be distinct; splitting them IS the control';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = provider_role) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
      provider_role, 'synthetic-local-provider-only');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = consent_role) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
      consent_role, 'synthetic-local-consent-only');
  END IF;

  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I, %I',
    current_database(), provider_role, consent_role);
  EXECUTE format('GRANT USAGE ON SCHEMA community TO %I, %I',
    provider_role, consent_role);

  -- ------------------------------------------------------------- provider --
  --
  -- The protocol's own bookkeeping. This is the only role that writes it,
  -- which is the whole reason it exists: an injection in the resource-server
  -- path now reaches a role that can only SELECT a wrapper, not rewrite the
  -- token store.
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
       community.agent_connection_provider_artifacts TO %I', provider_role);

  -- Wrappers are minted when a token is issued and reaped when it expires.
  -- Both happen here, not on the resource-server path.
  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
       community.agent_connection_wrappers TO %I', provider_role);

  -- The immutable consent snapshot. INSERT only: the provider writes a grant
  -- row when it creates a grant, and the table's freeze trigger refuses every
  -- later edit except the destruction columns. No UPDATE is granted on
  -- generation_at_consent because nothing may ever move it -- that is the r12
  -- defect, and the ABSENCE of the privilege is the last line of that defence.
  EXECUTE format(
    'GRANT SELECT, INSERT ON TABLE community.agent_connection_grants TO %I',
    provider_role);
  EXECUTE format(
    'GRANT UPDATE (destroy_status, destroyed_at)
       ON TABLE community.agent_connection_grants TO %I', provider_role);

  -- The provider may point a connection at the grant it just made, and
  -- nothing else. It cannot authorize, revoke or move a generation: a
  -- provider that could do those could manufacture an authorization with no
  -- human anywhere in it.
  EXECUTE format(
    'GRANT SELECT ON TABLE community.agent_connections TO %I', provider_role);
  EXECUTE format(
    'GRANT UPDATE (current_grant_id) ON TABLE community.agent_connections TO %I',
    provider_role);

  -- The provider OPENS the interaction, writing only what it will enforce,
  -- and later marks it spent. It reads the decision somebody else made.
  --
  -- DELIBERATELY ABSENT: UPDATE on decision, decided_at, granted_generation,
  -- ticket_digest, human_account_id and connection_id. The provider never
  -- authenticates a human, so it must not be able to say who consented, to
  -- know the browser's single-use secret, or to record a decision. INSERT
  -- alone cannot approve: `decision` starts NULL and the provider holds no
  -- privilege that could move it.
  EXECUTE format(
    'GRANT SELECT, INSERT ON TABLE community.agent_connection_consents TO %I',
    provider_role);
  EXECUTE format(
    'GRANT UPDATE (resumed_at, grant_id)
       ON TABLE community.agent_connection_consents TO %I', provider_role);

  -- Startup readiness verifies the ledger read-only, exactly as the App role.
  EXECUTE format(
    'GRANT SELECT ON TABLE community.schema_migrations TO %I', provider_role);

  -- -------------------------------------------------------------- consent --
  --
  -- The Admin control plane. It says WHO is deciding and about WHICH
  -- connection, then records the decision. It cannot create an interaction,
  -- so it cannot conjure an authorization request nobody made, and it cannot
  -- alter what the provider will enforce.
  EXECUTE format(
    'GRANT SELECT ON TABLE community.agent_connection_consents TO %I',
    consent_role);
  EXECUTE format(
    'GRANT UPDATE (ticket_digest, human_account_id, connection_id,
                   decision, decided_at, granted_generation)
       ON TABLE community.agent_connection_consents TO %I', consent_role);

  -- The connection authority: status, generation and the consent timestamp
  -- move here and only here, under compare-and-set on version.
  EXECUTE format(
    'GRANT SELECT, INSERT ON TABLE community.agent_connections TO %I',
    consent_role);
  EXECUTE format(
    'GRANT UPDATE (
       status, generation, version, preset, consented_at, revoked_at,
       provider_cleanup_status, provider_cleanup_error
     ) ON TABLE community.agent_connections TO %I', consent_role);

  -- Read-only on the snapshot, for display. It cannot forge one.
  EXECUTE format(
    'GRANT SELECT ON TABLE community.agent_connection_grants TO %I',
    consent_role);
  EXECUTE format(
    'GRANT SELECT ON TABLE community.schema_migrations TO %I', consent_role);

  -- DELIBERATELY ABSENT for the consent role:
  --   * current_grant_id -- the provider's column. The control plane must not
  --                         be able to re-point a connection at a grant it did
  --                         not create.
  --   * INSERT/UPDATE on agent_connection_grants -- it cannot forge a consent
  --                         snapshot.
  --   * agent_connection_wrappers and _provider_artifacts -- no grant at all.
  --                         The control plane has no business near a token
  --                         store and cannot mint or resolve one.

  -- Nothing anywhere gets DELETE on a connection, a grant or a consent. The
  -- ledger is append-plus-freeze; removal is a retention decision, not a
  -- runtime one.
  EXECUTE format(
    'REVOKE DELETE ON TABLE
       community.agent_connections,
       community.agent_connection_grants,
       community.agent_connection_consents
     FROM %I, %I', provider_role, consent_role);
END
$$;
