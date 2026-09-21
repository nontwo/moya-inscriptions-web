-- Agent Connections V1 (Issue #141): one human, one registered client, one
-- connection.
--
-- WHY. `resolveConnection` is read-then-create -- it asks `findForClient` for
-- the row this human holds for this exact client and opens one when the answer
-- is none -- and nothing stood between the read and the write. The consent
-- REVIEW page performs that pair during a server render, which is a thing Next
-- will happily run twice because it prefetches links. Measured on a disposable
-- target: two concurrent resolves for one pair produce two rows carrying the
-- same created_at, which is the shape the Owner walkthrough reported.
--
-- WHAT THE SECOND ROW COSTS, which is more than a duplicate card on the Owner's
-- page. `findForClient` refuses an ambiguous pair rather than picking the
-- newest, deliberately, because silently choosing is how a revoked connection
-- is bypassed by a duplicate nobody noticed. So the second row WEDGES the pair:
-- measured, the next resolve for it raises AMBIGUOUS_CLIENT_CONNECTION, and no
-- disconnect in the Admin can clear the row the page is not showing.
--
-- WHY FULL, and not `WHERE status <> 'revoked'`. A partial index over the live
-- rows is the obvious shape and it is the wrong one here. `findForClient` and
-- `resolveConnection` do not filter by status at all -- a revoked connection is
-- KEPT, and a reconnect resolves back to the SAME row -- so a second row beside
-- a revoked one would still be an ambiguous pair, still wedged, with a partial
-- index reporting success. The rule the code already relies on is "at most one
-- row per pair, whatever its status", and that is the rule written here.
--
-- Forward-only, and NO data change: choosing which of two existing rows to keep
-- is not a migration's decision, because one of them may hold the live grant.
-- A database that already carries a duplicate is refused here, with the query
-- that finds it, and an operator resolves it.

DO $$
DECLARE
  pairs BIGINT;
BEGIN
  SELECT count(*) INTO pairs FROM (
    SELECT 1
      FROM community.agent_connections
     GROUP BY human_account_id, oauth_client_id
    HAVING count(*) > 1
  ) AS duplicated;
  IF pairs > 0 THEN
    RAISE EXCEPTION 'community.agent_connections holds % (human_account_id, oauth_client_id) pair(s) with more than one row, which this index forbids. Nothing here chooses which row to keep: one of them may hold the live grant. List them with: SELECT human_account_id, oauth_client_id, count(*) FROM community.agent_connections GROUP BY 1, 2 HAVING count(*) > 1;', pairs;
  END IF;
END $$;

CREATE UNIQUE INDEX agent_connections_human_client_unique
  ON community.agent_connections (human_account_id, oauth_client_id);

COMMENT ON INDEX community.agent_connections_human_client_unique IS
  'One connection per (human_account_id, oauth_client_id). The consent path is read-then-create across concurrent renders, so this index -- not the application -- is what decides the winner. Deliberately NOT partial on status: a revoked row is kept and a reconnect reuses it, so a second row beside one would be an ambiguous pair that findForClient refuses.';
