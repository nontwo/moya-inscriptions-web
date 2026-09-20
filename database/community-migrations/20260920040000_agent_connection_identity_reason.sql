-- agent-connections-v1 (Issue #141 r15): the rule is unchanged; its stated
-- REASON stopped being true one migration ago. Forward-only; no data change.
--
-- 20260918040000 wrote, in the catalog where `\d+` prints it:
--
--   "AUTHORIZATION MUST READ IDENTITY FROM THIS ROW, NEVER FROM
--    agent_connections: a connection's oauth_client_id and human_account_id
--    remain writable by design, while everything here is frozen at consent."
--
-- 20260920030000 froze both of those columns, so the justification now
-- contradicts the schema it ships beside. An independent review caught it and
-- was right to hold delivery for it: the RULE is load-bearing and must stay,
-- and the reason is the half a reader checks. Somebody who finds the columns
-- frozen, concludes the basis has evaporated and starts reading identity from
-- the connection re-introduces exactly the r14 `readForAuthorization` column
-- collision — a defect this series has already written one migration about.
--
-- The rule survives on a better reason, and it is a stronger one: the grant is
-- frozen AT ITS OWN CONSENT and there is one row per grant, while the
-- connection is a living row that spans generations. "The connection's columns
-- cannot move" is not the same statement as "the connection's columns equal
-- this grant's" — a reconnect mints a new grant while the connection persists,
-- so the two legitimately disagree and only the grant says what THIS token
-- was consented under.
COMMENT ON TABLE community.agent_connection_grants IS
  'Immutable consent snapshot, one row per provider grant. AUTHORIZATION MUST '
  'READ IDENTITY FROM THIS ROW, NEVER FROM agent_connections. The reason is '
  'not that the connection is mutable -- since 20260920030000 its identity '
  'columns are frozen too -- but that a connection is a LIVING row spanning '
  'generations while each grant is frozen at its own consent. A reconnect '
  'mints a new grant and keeps the connection, so the two legitimately '
  'disagree, and only this row says what a given token was consented under. '
  'Taking the client or the subject from the connection would reintroduce the '
  'mutable-identity hole the frozen generation exists to close.';
