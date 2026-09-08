import pg from "pg";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";

const { Client } = pg;
const SCHEMA = "p203_eval";
const BIGM_INDEX = "p203_normalized_text_bigm";
const TABLE = `${SCHEMA}.documents`;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const KINDS = new Set(["inscription", "calligraphy"]);
const MODES = new Set([
  "raw-exact",
  "normalized-exact",
  "prefix",
  "contains",
  "trgm",
  "fts",
  "policy",
]);
const INPUT_FIELDS = new Set([
  "id",
  "kind",
  "title",
  "aliases",
  "normalizedTitle",
  "normalizedAliases",
  "structuredText",
  "normalizedStructuredText",
  "body",
  "normalizedBody",
  "normalizedText",
  "titleAliasText",
  "visible",
]);
const COLUMNS = [
  "id",
  "kind",
  "title",
  "aliases",
  "normalized_title",
  "normalized_aliases",
  "structured_text",
  "normalized_structured_text",
  "body",
  "normalized_body",
  "normalized_text",
  "title_alias_text",
];
const INDEX_DEFINITIONS = [
  ["p203_title_exact", "btree (title)"],
  ["p203_title_prefix", "btree (title text_pattern_ops)"],
  ["p203_normalized_title_exact", "btree (normalized_title)"],
  ["p203_normalized_title_prefix", "btree (normalized_title text_pattern_ops)"],
  ["p203_aliases_exact", "gin (aliases)"],
  ["p203_normalized_aliases_exact", "gin (normalized_aliases)"],
  ["p203_normalized_title_trgm", "gin (normalized_title gin_trgm_ops)"],
  ["p203_normalized_text_trgm", "gin (normalized_text gin_trgm_ops)"],
  ["p203_fts", "gin (search_vector)"],
];

function failure(category, code) {
  const connectionCodes = new Set([
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "EPIPE",
    "ENOTFOUND",
  ]);
  const safeCode =
    typeof code === "string" &&
    (/^[A-Z0-9]{5}$/.test(code) || connectionCodes.has(code))
      ? `_${code}`
      : "";
  return new Error(`PG_EVALUATION_${category}${safeCode}`);
}

function safeText(value = "") {
  if (
    typeof value !== "string" ||
    /(?:https?:\/\/|file:\/\/|data:)/i.test(value)
  ) {
    throw failure("INVALID_DOCUMENT_TEXT");
  }
  return value;
}

function projectDocument(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc))
    throw failure("INVALID_DOCUMENT");
  if (Object.keys(doc).some((field) => !INPUT_FIELDS.has(field)))
    throw failure("UNAPPROVED_DOCUMENT_FIELD");
  if (
    typeof doc.id !== "string" ||
    !SAFE_ID.test(doc.id) ||
    !KINDS.has(doc.kind) ||
    typeof doc.visible !== "boolean"
  ) {
    throw failure("INVALID_DOCUMENT_IDENTITY");
  }
  if (!Array.isArray(doc.aliases) || !Array.isArray(doc.normalizedAliases))
    throw failure("INVALID_DOCUMENT_ALIASES");
  const result = {
    id: doc.id,
    kind: doc.kind,
    title: safeText(doc.title),
    aliases: doc.aliases.map(safeText),
    normalized_title: safeText(doc.normalizedTitle),
    normalized_aliases: doc.normalizedAliases.map(safeText),
    structured_text: safeText(doc.structuredText),
    normalized_structured_text: safeText(doc.normalizedStructuredText),
    body: safeText(doc.body),
    normalized_body: safeText(doc.normalizedBody),
  };
  result.title_alias_text = safeText(
    doc.titleAliasText ??
      [result.normalized_title, ...result.normalized_aliases].join(" "),
  );
  result.normalized_text = safeText(
    doc.normalizedText ??
      [
        result.title_alias_text,
        result.normalized_structured_text,
        result.normalized_body,
      ].join(" "),
  );
  return result;
}

function escapeLike(text) {
  return text.replace(/[\\%_]/g, "\\$&");
}

function buildSearch(
  query,
  { normalizedQuery = query, kind, mode = "policy", limit = 100 } = {},
) {
  if (
    typeof query !== "string" ||
    typeof normalizedQuery !== "string" ||
    query.length > 1000 ||
    normalizedQuery.length > 1000
  ) {
    throw failure("INVALID_QUERY");
  }
  if (!MODES.has(mode)) throw failure("INVALID_MODE");
  if (kind !== undefined && !KINDS.has(kind)) throw failure("INVALID_KIND");
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
    throw failure("INVALID_LIMIT");

  const parts = normalizedQuery.trim().split(/\s+/u).filter(Boolean);
  const values = [
    query,
    normalizedQuery,
    kind ?? null,
    parts.map((part) => `%${escapeLike(part)}%`),
    limit,
  ];
  const parameter = (value) => {
    values.push(value);
    return `$${values.length}::text`;
  };
  const allPartsIn = (column) =>
    `NOT EXISTS (SELECT 1 FROM unnest($4::text[]) AS part(pattern) WHERE ${column} NOT LIKE part.pattern)`;
  const rawTitle = "title = $1";
  const rawAlias = "aliases @> ARRAY[$1]::text[]";
  const normalizedExact =
    "(normalized_title = $2 OR normalized_aliases @> ARRAY[$2]::text[])";
  const policyTier = `CASE
    WHEN ${rawTitle} THEN 0
    WHEN ${rawAlias} THEN 1
    WHEN ${normalizedExact} THEN 2
    WHEN ${allPartsIn("title_alias_text")} THEN 3
    WHEN ${allPartsIn("(title_alias_text || ' ' || normalized_structured_text)")} THEN 4
    ELSE 5 END`;
  let predicate;
  let tier = policyTier;
  let order = "tier ASC, id ASC";
  switch (mode) {
    case "raw-exact":
      predicate = `(${rawTitle} OR ${rawAlias})`;
      tier = `CASE WHEN ${rawTitle} THEN 0 ELSE 1 END`;
      break;
    case "normalized-exact":
      predicate = normalizedExact;
      tier = "2";
      break;
    case "prefix": {
      const prefix = parameter(`${escapeLike(normalizedQuery)}%`);
      predicate = `(normalized_title LIKE ${prefix} OR EXISTS (SELECT 1 FROM unnest(normalized_aliases) AS alias(value) WHERE alias.value LIKE ${prefix}))`;
      tier = "3";
      break;
    }
    case "contains":
      predicate = `normalized_text LIKE ${parameter(`%${escapeLike(normalizedQuery)}%`)}`;
      break;
    case "trgm":
      predicate = "(normalized_title % $2 OR normalized_text % $2)";
      tier = "6";
      order =
        "GREATEST(similarity(normalized_title, $2), similarity(normalized_text, $2)) DESC, id ASC";
      break;
    case "fts":
      predicate = "search_vector @@ plainto_tsquery('simple'::regconfig, $2)";
      order =
        "ts_rank_cd(search_vector, plainto_tsquery('simple'::regconfig, $2)) DESC, id ASC";
      break;
    case "policy":
      // Top-level LIKE predicates let PostgreSQL select the real pg_trgm GIN
      // index where the query supplies usable trigrams. Do not hide candidate
      // retrieval behind a correlated unnest that would force a scan.
      predicate =
        parts
          .map(
            (part) =>
              `normalized_text LIKE ${parameter(`%${escapeLike(part)}%`)}`,
          )
          .join(" AND ") || "FALSE";
      break;
  }
  return {
    mode,
    empty: parts.length === 0,
    values,
    text: `SELECT id, (${tier})::integer AS tier FROM ${TABLE}
      WHERE $1::text IS NOT NULL AND $2::text IS NOT NULL
        AND cardinality($4::text[]) > 0
        AND ($3::text IS NULL OR kind = $3) AND ${predicate}
      ORDER BY ${order} LIMIT $5`,
  };
}

function numeric(value) {
  const parsed = typeof value === "string" ? Number(value) : value;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safePlan(node) {
  // PostgreSQL condition/output/sort strings may contain the bound query.
  // Retain actual plan structure and measurements, never those expressions.
  const result = {};
  const labels = {
    "Node Type": "nodeType",
    "Join Type": "joinType",
    "Scan Direction": "scanDirection",
    "Parent Relationship": "parentRelationship",
    Strategy: "strategy",
  };
  for (const [field, label] of Object.entries(labels)) {
    if (
      typeof node?.[field] === "string" &&
      /^[A-Za-z -]{1,50}$/.test(node[field])
    )
      result[label] = node[field];
  }
  const measures = {
    "Startup Cost": "startupCost",
    "Total Cost": "totalCost",
    "Plan Rows": "planRows",
    "Actual Startup Time": "actualStartupMs",
    "Actual Total Time": "actualTotalMs",
    "Actual Rows": "actualRows",
    "Actual Loops": "actualLoops",
    "Rows Removed by Filter": "rowsRemovedByFilter",
    "Rows Removed by Index Recheck": "rowsRemovedByIndexRecheck",
    "Shared Hit Blocks": "sharedHitBlocks",
    "Shared Read Blocks": "sharedReadBlocks",
    "Temp Read Blocks": "tempReadBlocks",
    "Temp Written Blocks": "tempWrittenBlocks",
    "Peak Memory Usage": "peakMemoryUsageKb",
    "Sort Space Used": "sortSpaceUsedKb",
  };
  for (const [field, label] of Object.entries(measures)) {
    if (node?.[field] !== undefined) result[label] = numeric(node[field]);
  }
  const approvedIndexes = new Set([
    "documents_pkey",
    BIGM_INDEX,
    ...INDEX_DEFINITIONS.map(([name]) => name),
  ]);
  if (approvedIndexes.has(node?.["Index Name"]))
    result.index = node["Index Name"];
  if (Array.isArray(node?.Plans)) result.plans = node.Plans.map(safePlan);
  return result;
}

/** One disposable PostgreSQL schema; no runtime Catalog tables or contracts. */
export function createPgEngine({ connection }) {
  let options;
  try {
    if (typeof connection === "string") {
      const endpoint = new URL(connection);
      if (
        !["postgres:", "postgresql:"].includes(endpoint.protocol) ||
        !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname)
      ) {
        throw failure("NON_ISOLATED_CONNECTION");
      }
      options = { connectionString: connection };
    } else if (
      connection &&
      typeof connection === "object" &&
      ["127.0.0.1", "localhost", "::1"].includes(connection.host)
    ) {
      options = connection;
    } else {
      throw failure("NON_ISOLATED_CONNECTION");
    }
  } catch {
    throw failure("INVALID_CONNECTION");
  }
  let client;
  try {
    client = new Client({
      ...options,
      connectionTimeoutMillis: 10_000,
      query_timeout: 600_000,
    });
  } catch {
    throw failure("INVALID_CLIENT");
  }
  let connected = false;
  let ownsSchema = false;
  let ready = false;
  let connectionFault = false;
  let version = null;
  let extensionVersion = null;
  client.on("error", () => {
    connectionFault = true;
  });

  async function execute(text, values = []) {
    if (connectionFault) throw failure("CONNECTION_FAILED");
    try {
      if (!connected) {
        await client.connect();
        connected = true;
      }
      return await client.query(text, values);
    } catch (error) {
      throw failure("DATABASE", error?.code);
    }
  }

  async function putDocuments(docs) {
    if (!docs.length) return;
    const definitions = COLUMNS.map(
      (column) => `${column} ${column.endsWith("aliases") ? "text[]" : "text"}`,
    ).join(", ");
    const assignments = COLUMNS.filter((column) => column !== "id")
      .map((column) => `${column} = EXCLUDED.${column}`)
      .join(", ");
    await execute(
      `INSERT INTO ${TABLE} (${COLUMNS.join(", ")})
      SELECT ${COLUMNS.join(", ")} FROM jsonb_to_recordset($1::jsonb) AS incoming(${definitions})
      ON CONFLICT (id) DO UPDATE SET ${assignments}`,
      [JSON.stringify(docs)],
    );
  }

  async function setup(docs) {
    if (!Array.isArray(docs)) throw failure("INVALID_DOCUMENTS");
    const ids = new Set();
    for (const doc of docs) {
      const projected = projectDocument(doc);
      if (ids.has(projected.id)) throw failure("DUPLICATE_DOCUMENT_ID");
      ids.add(projected.id);
    }
    ready = false;
    const checkedVersion = await execute("SHOW server_version_num");
    if (checkedVersion.rows[0]?.server_version_num !== "180004")
      throw failure("VERSION_MISMATCH");
    version = "18.4";
    if (!ownsSchema) {
      const existing = await execute(
        "SELECT 1 FROM pg_namespace WHERE nspname = $1",
        [SCHEMA],
      );
      if (existing.rowCount) throw failure("EXISTING_SCHEMA");
      await execute(`CREATE SCHEMA ${SCHEMA}`);
      ownsSchema = true;
    }
    await execute("CREATE EXTENSION IF NOT EXISTS pg_trgm");
    const extension = await execute(
      "SELECT extversion FROM pg_extension WHERE extname = 'pg_trgm'",
    );
    const actualExtensionVersion = extension.rows[0]?.extversion;
    if (
      typeof actualExtensionVersion !== "string" ||
      !/^\d+(?:\.\d+)*$/.test(actualExtensionVersion)
    )
      throw failure("INVALID_EXTENSION_VERSION");
    extensionVersion = actualExtensionVersion;
    await execute(
      "SELECT set_config('pg_trgm.similarity_threshold', '0.3', false)",
    );
    await execute(`DROP TABLE IF EXISTS ${TABLE}`);
    await execute(`CREATE TABLE ${TABLE} (
      id text PRIMARY KEY, kind text NOT NULL CHECK (kind IN ('inscription', 'calligraphy')),
      title text NOT NULL, aliases text[] NOT NULL,
      normalized_title text NOT NULL, normalized_aliases text[] NOT NULL,
      structured_text text NOT NULL, normalized_structured_text text NOT NULL,
      body text NOT NULL, normalized_body text NOT NULL,
      normalized_text text NOT NULL, title_alias_text text NOT NULL,
      search_vector tsvector GENERATED ALWAYS AS (
        setweight(to_tsvector('simple'::regconfig, title_alias_text), 'A') ||
        setweight(to_tsvector('simple'::regconfig, normalized_structured_text), 'B') ||
        setweight(to_tsvector('simple'::regconfig, normalized_body), 'C')
      ) STORED
    )`);
    let included = 0;
    for (let offset = 0; offset < docs.length; offset += 1000) {
      const batch = docs
        .slice(offset, offset + 1000)
        .filter((doc) => doc.visible)
        .map(projectDocument);
      await putDocuments(batch);
      included += batch.length;
    }
    for (const [name, definition] of INDEX_DEFINITIONS) {
      await execute(`CREATE INDEX ${name} ON ${TABLE} USING ${definition}`);
    }
    await execute(`ANALYZE ${TABLE}`);
    const count = await execute(`SELECT count(*) AS count FROM ${TABLE}`);
    if (numeric(count.rows[0]?.count) !== included)
      throw failure("INDEX_CONTENT_MISMATCH");
    ready = true;
    return {
      version,
      pgTrgmVersion: extensionVersion,
      numberOfDocuments: included,
      excludedSourceRows: docs.length - included,
      ftsConfiguration: "simple",
      similarityThreshold: 0.3,
    };
  }

  async function rawSearch(query, options) {
    if (!ready) throw failure("SETUP_REQUIRED");
    const search = buildSearch(query, options);
    const started = performance.now();
    if (search.empty)
      return {
        mode: search.mode,
        hits: [],
        clientTimeMs: performance.now() - started,
      };
    const result = await execute(search.text, search.values);
    if (
      result.rows.some(
        (row) =>
          typeof row.id !== "string" ||
          !SAFE_ID.test(row.id) ||
          !Number.isInteger(row.tier) ||
          row.tier < 0 ||
          row.tier > 6,
      )
    ) {
      throw failure("INVALID_SEARCH_HITS");
    }
    return {
      mode: search.mode,
      ranking: search.mode === "policy" ? "evaluation-policy" : "engine-native",
      hits: result.rows.map((row, offset) => ({
        id: row.id,
        rank: offset + 1,
        tier: row.tier,
      })),
      clientTimeMs: performance.now() - started,
    };
  }

  async function update(doc) {
    if (!ready) throw failure("SETUP_REQUIRED");
    const projected = projectDocument(doc);
    if (!doc.visible) return remove(projected.id);
    await putDocuments([projected]);
    return { status: "committed" };
  }

  async function remove(id) {
    if (!ready) throw failure("SETUP_REQUIRED");
    if (typeof id !== "string" || !SAFE_ID.test(id))
      throw failure("INVALID_DOCUMENT_ID");
    const result = await execute(`DELETE FROM ${TABLE} WHERE id = $1`, [id]);
    return { status: "committed", removed: result.rowCount };
  }

  async function stats() {
    if (!ready) throw failure("SETUP_REQUIRED");
    const sizes = await execute(`SELECT count(*) AS count,
      pg_table_size('${TABLE}'::regclass) AS table_bytes,
      pg_indexes_size('${TABLE}'::regclass) AS index_bytes,
      pg_total_relation_size('${TABLE}'::regclass) AS total_bytes,
      pg_database_size(current_database()) AS database_bytes FROM ${TABLE}`);
    const indexes =
      await execute(`SELECT c.relname AS name, pg_relation_size(c.oid) AS bytes
      FROM pg_class AS c JOIN pg_index AS i ON i.indexrelid = c.oid
      WHERE i.indrelid = '${TABLE}'::regclass ORDER BY c.relname`);
    const ftsDebug = [];
    for (const sample of ["合成山河碑", "合成人物 合成作品"]) {
      const debug = await execute(
        "SELECT alias, token, lexemes FROM ts_debug('simple'::regconfig, $1)",
        [sample],
      );
      ftsDebug.push({
        sample,
        tokens: debug.rows.map((row) => ({
          alias: row.alias,
          token: row.token,
          lexemes: row.lexemes,
        })),
      });
    }
    const row = sizes.rows[0];
    const approvedIndexes = new Set([
      "documents_pkey",
      BIGM_INDEX,
      ...INDEX_DEFINITIONS.map(([name]) => name),
    ]);
    return {
      version,
      pgTrgmVersion: extensionVersion,
      ftsConfiguration: "simple",
      similarityThreshold: 0.3,
      numberOfDocuments: numeric(row.count),
      tableSizeBytes: numeric(row.table_bytes),
      indexesSizeBytes: numeric(row.index_bytes),
      totalSizeBytes: numeric(row.total_bytes),
      databaseSizeBytes: numeric(row.database_bytes),
      indexes: indexes.rows
        .filter((item) => approvedIndexes.has(item.name))
        .map((item) => ({ name: item.name, bytes: numeric(item.bytes) })),
      ftsDebug,
    };
  }

  async function explain(query, options) {
    if (!ready) throw failure("SETUP_REQUIRED");
    const search = buildSearch(query, options);
    if (search.empty) return { mode: search.mode, empty: true };
    const result = await execute(
      `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${search.text}`,
      search.values,
    );
    const plan = result.rows[0]?.["QUERY PLAN"]?.[0];
    if (!plan?.Plan) throw failure("INVALID_EXPLAIN");
    return {
      mode: search.mode,
      plan: safePlan(plan.Plan),
      planningTimeMs: numeric(plan["Planning Time"]),
      executionTimeMs: numeric(plan["Execution Time"]),
    };
  }

  async function useBigmIndex() {
    if (!ready) throw failure("SETUP_REQUIRED");
    await execute("CREATE EXTENSION IF NOT EXISTS pg_bigm");
    const versionRow = await execute(
      "SELECT extversion FROM pg_extension WHERE extname='pg_bigm'",
    );
    const pgBigmVersion = versionRow.rows[0]?.extversion;
    if (pgBigmVersion !== "1.2") throw failure("BIGM_VERSION_MISMATCH");
    const recheck = await execute("SHOW pg_bigm.enable_recheck");
    if (recheck.rows[0]?.["pg_bigm.enable_recheck"] !== "on")
      throw failure("BIGM_RECHECK_MUST_REMAIN_ENABLED");
    await execute(`DROP INDEX ${SCHEMA}.p203_normalized_text_trgm`);
    await execute(
      `CREATE INDEX ${BIGM_INDEX} ON ${TABLE} USING gin (normalized_text gin_bigm_ops)`,
    );
    await execute(`ANALYZE ${TABLE}`);
    return { pgBigmVersion, containsIndex: BIGM_INDEX, enableRecheck: true };
  }

  async function close() {
    ready = false;
    if (!connected) return;
    try {
      await client.end();
      connected = false;
    } catch {
      throw failure("CLOSE_FAILED");
    }
  }

  return {
    setup,
    rawSearch,
    update,
    remove,
    stats,
    close,
    explain,
    useBigmIndex,
  };
}
