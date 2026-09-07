import { setTimeout as delay } from "node:timers/promises";
import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";
import { URL } from "node:url";

const EXPECTED_VERSION = "1.53.2";
const DOCUMENT_FIELDS = [
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
  "visible",
];
const SEARCHABLE_FIELDS = [
  "title",
  "aliases",
  "normalizedTitle",
  "normalizedAliases",
  "structuredText",
  "normalizedStructuredText",
  "body",
  "normalizedBody",
];
const RANKING_RULES = [
  "words",
  "typo",
  "proximity",
  "attributeRank",
  "sort",
  "wordPosition",
  "exactness",
  "id:asc",
];
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const PROFILES = new Set(["strict", "relaxed"]);
const KINDS = new Set(["inscription", "calligraphy"]);

function failure(category) {
  // Do not retain an upstream error as cause: fetch errors may contain secrets.
  return new Error(`MEILI_EVALUATION_${category}`);
}

function finiteNumber(value) {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function safeText(value) {
  if (
    typeof value !== "string" ||
    /(?:https?:\/\/|file:\/\/|data:)/i.test(value)
  ) {
    throw failure("INVALID_DOCUMENT_TEXT");
  }
  return value;
}

function projectDocument(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw failure("INVALID_DOCUMENT");
  }
  if (Object.keys(doc).some((field) => !DOCUMENT_FIELDS.includes(field))) {
    throw failure("UNAPPROVED_DOCUMENT_FIELD");
  }
  if (
    typeof doc.id !== "string" ||
    !SAFE_ID.test(doc.id) ||
    !KINDS.has(doc.kind) ||
    typeof doc.visible !== "boolean"
  ) {
    throw failure("INVALID_DOCUMENT_IDENTITY");
  }
  const projected = { id: doc.id, kind: doc.kind, visible: doc.visible };
  for (const field of SEARCHABLE_FIELDS) {
    if (field === "aliases" || field === "normalizedAliases") {
      if (!Array.isArray(doc[field])) throw failure("INVALID_DOCUMENT_ALIASES");
      projected[field] = doc[field].map(safeText);
    } else if (doc[field] !== undefined) {
      projected[field] = safeText(doc[field]);
    }
  }
  return projected;
}

function profileSettings(profile) {
  if (!PROFILES.has(profile)) throw failure("INVALID_PROFILE");
  return {
    searchableAttributes: SEARCHABLE_FIELDS,
    displayedAttributes: ["id"],
    filterableAttributes: ["kind", "visible"],
    sortableAttributes: ["id"],
    rankingRules: RANKING_RULES,
    localizedAttributes: [
      { attributePatterns: SEARCHABLE_FIELDS, locales: ["cmn"] },
    ],
    typoTolerance: {
      enabled: profile === "relaxed",
      minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 },
      disableOnWords: [],
      disableOnAttributes: [],
      disableOnNumbers: true,
    },
    prefixSearch: profile === "strict" ? "disabled" : "indexingTime",
    stopWords: [],
    synonyms: {},
    dictionary: [],
    pagination: { maxTotalHits: 1000 },
    proximityPrecision: "byWord",
    searchCutoffMs: 1500,
  };
}

function checkedSettings(actual, expected) {
  // Returning only the settings written by this adapter prevents unrelated
  // instance configuration, model credentials, or endpoint values escaping.
  const result = {};
  for (const field of Object.keys(expected)) {
    if (!isDeepStrictEqual(actual?.[field], expected[field])) {
      throw failure("SETTINGS_MISMATCH");
    }
    result[field] = actual[field];
  }
  return result;
}

/** Evaluation-only adapter. It never computes the Owner's business tiers. */
export function createMeiliEngine({
  url,
  ephemeralKey,
  index = "p203",
  fetch: fetchImpl = globalThis.fetch,
}) {
  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    throw failure("INVALID_ENDPOINT");
  }
  if (
    endpoint.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.pathname !== "/"
  ) {
    throw failure("NON_ISOLATED_ENDPOINT");
  }
  if (
    typeof index !== "string" ||
    !SAFE_ID.test(index) ||
    !index.startsWith("p203")
  )
    throw failure("INVALID_INDEX");
  if (
    typeof ephemeralKey !== "string" ||
    !ephemeralKey ||
    typeof fetchImpl !== "function"
  ) {
    throw failure("INVALID_CLIENT");
  }

  const indexPath = `/indexes/${encodeURIComponent(index)}`;
  let ownsIndex = false;
  let activeProfile = null;
  let recordedVersion = null;
  let recordedSettings = null;

  async function request(
    path,
    { method = "GET", body, allowMissing = false } = {},
  ) {
    let response;
    try {
      response = await fetchImpl(new URL(path, endpoint), {
        method,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: globalThis.AbortSignal.timeout(30_000),
        redirect: "error",
      });
    } catch {
      throw failure("REQUEST_FAILED");
    }
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) {
      const status = Number.isInteger(response.status) ? response.status : 0;
      throw failure(`HTTP_${status}`);
    }
    try {
      return await response.json();
    } catch {
      throw failure("INVALID_RESPONSE");
    }
  }

  async function waitTask(
    task,
    { timeoutMs = 600_000, pollIntervalMs = 100 } = {},
  ) {
    const taskUid = typeof task === "number" ? task : task?.taskUid;
    if (!Number.isSafeInteger(taskUid) || taskUid < 0)
      throw failure("INVALID_TASK");
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 600_000) {
      throw failure("INVALID_TASK_TIMEOUT");
    }
    if (
      !Number.isFinite(pollIntervalMs) ||
      pollIntervalMs < 1 ||
      pollIntervalMs > 1000
    ) {
      throw failure("INVALID_TASK_POLL_INTERVAL");
    }
    const started = performance.now();
    while (performance.now() - started < timeoutMs) {
      const result = await request(`/tasks/${taskUid}`);
      if (result.status === "succeeded") {
        return {
          taskUid,
          status: "succeeded",
          waitedMs: performance.now() - started,
        };
      }
      if (result.status === "failed" || result.status === "canceled") {
        // Task error.message can quote input documents or private configuration.
        throw failure(
          result.status === "failed" ? "TASK_FAILED" : "TASK_CANCELED",
        );
      }
      if (result.status !== "enqueued" && result.status !== "processing") {
        throw failure("INVALID_TASK_STATUS");
      }
      await delay(pollIntervalMs);
    }
    throw failure("TASK_TIMEOUT");
  }

  async function configureProfile(profile) {
    if (!ownsIndex) throw failure("SETUP_REQUIRED");
    const expected = profileSettings(profile);
    activeProfile = null;
    recordedSettings = null;
    const started = performance.now();
    await waitTask(
      await request(`${indexPath}/settings`, {
        method: "PATCH",
        body: expected,
      }),
    );
    recordedSettings = checkedSettings(
      await request(`${indexPath}/settings`),
      expected,
    );
    activeProfile = profile;
    return {
      profile,
      settings: globalThis.structuredClone(recordedSettings),
      configurationMs: performance.now() - started,
    };
  }

  async function setup(docs, { profile = "strict" } = {}) {
    if (!Array.isArray(docs)) throw failure("INVALID_DOCUMENTS");
    profileSettings(profile);
    const ids = new Set();
    for (const doc of docs) {
      const projected = projectDocument(doc);
      if (ids.has(projected.id)) throw failure("DUPLICATE_DOCUMENT_ID");
      ids.add(projected.id);
    }
    const started = performance.now();
    const version = await request("/version");
    if (version.pkgVersion !== EXPECTED_VERSION)
      throw failure("VERSION_MISMATCH");
    recordedVersion = { pkgVersion: version.pkgVersion };
    if (
      typeof version.commitSha === "string" &&
      /^[a-f0-9]{7,40}$/.test(version.commitSha)
    ) {
      recordedVersion.commitSha = version.commitSha;
    }
    if (!ownsIndex) {
      if (await request(indexPath, { allowMissing: true }))
        throw failure("EXISTING_INDEX");
      await waitTask(
        await request("/indexes", {
          method: "POST",
          body: { uid: index, primaryKey: "id" },
        }),
      );
      ownsIndex = true;
    } else {
      activeProfile = null;
      await waitTask(
        await request(`${indexPath}/documents`, { method: "DELETE" }),
      );
    }
    const configuration = await configureProfile(profile);
    activeProfile = null;
    for (let offset = 0; offset < docs.length; offset += 1000) {
      const batch = docs.slice(offset, offset + 1000).map(projectDocument);
      await waitTask(
        await request(`${indexPath}/documents`, {
          method: "POST",
          body: batch,
        }),
      );
    }
    const indexStats = await request(`${indexPath}/stats`);
    if (
      indexStats.numberOfDocuments !== docs.length ||
      indexStats.isIndexing !== false
    ) {
      throw failure("INDEX_CONTENT_MISMATCH");
    }
    activeProfile = profile;
    return {
      version: { ...recordedVersion },
      profile,
      settings: globalThis.structuredClone(recordedSettings),
      numberOfDocuments: docs.length,
      setupMs: performance.now() - started,
      configurationMs: configuration.configurationMs,
    };
  }

  async function rawSearch(query, { kind, mode = "strict", limit = 100 } = {}) {
    if (!activeProfile) throw failure("SETUP_REQUIRED");
    if (mode !== activeProfile) throw failure("PROFILE_MISMATCH");
    if (typeof query !== "string" || query.length > 1000)
      throw failure("INVALID_QUERY");
    if (kind !== undefined && !KINDS.has(kind)) throw failure("INVALID_KIND");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000)
      throw failure("INVALID_LIMIT");
    const result = await request(`${indexPath}/search`, {
      method: "POST",
      body: {
        q: query,
        limit,
        filter: ["visible = true", ...(kind ? [`kind = "${kind}"`] : [])],
        matchingStrategy: mode === "strict" ? "all" : "last",
        locales: ["cmn"],
        attributesToRetrieve: ["id"],
      },
    });
    if (
      !Array.isArray(result.hits) ||
      result.hits.some(
        (hit) => typeof hit?.id !== "string" || !SAFE_ID.test(hit.id),
      )
    ) {
      throw failure("INVALID_SEARCH_HITS");
    }
    return {
      profile: mode,
      ranking: "engine-native",
      hits: result.hits.map((hit, offset) => ({
        id: hit.id,
        rank: offset + 1,
      })),
      processingTimeMs: finiteNumber(result.processingTimeMs),
      estimatedTotalHits: finiteNumber(result.estimatedTotalHits),
      degraded: typeof result.degraded === "boolean" ? result.degraded : null,
      maxTotalHits: 1000,
    };
  }

  async function update(doc) {
    if (!activeProfile) throw failure("SETUP_REQUIRED");
    return waitTask(
      await request(`${indexPath}/documents`, {
        method: "POST",
        body: [projectDocument(doc)],
      }),
    );
  }

  async function remove(id) {
    if (!activeProfile) throw failure("SETUP_REQUIRED");
    if (typeof id !== "string" || !SAFE_ID.test(id))
      throw failure("INVALID_DOCUMENT_ID");
    return waitTask(
      await request(`${indexPath}/documents/${encodeURIComponent(id)}`, {
        method: "DELETE",
      }),
    );
  }

  async function stats() {
    if (!activeProfile) throw failure("SETUP_REQUIRED");
    const indexStats = await request(`${indexPath}/stats`);
    const globalStats = await request("/stats");
    return {
      profile: activeProfile,
      version: { ...recordedVersion },
      settings: globalThis.structuredClone(recordedSettings),
      numberOfDocuments: finiteNumber(indexStats.numberOfDocuments),
      isIndexing:
        typeof indexStats.isIndexing === "boolean"
          ? indexStats.isIndexing
          : null,
      databaseSizeBytes: finiteNumber(globalStats.databaseSize),
      usedDatabaseSizeBytes: finiteNumber(globalStats.usedDatabaseSize),
      indexDatabaseSizeBytes: finiteNumber(indexStats.databaseSize),
      indexUsedDatabaseSizeBytes: finiteNumber(indexStats.usedDatabaseSize),
    };
  }

  return {
    setup,
    configureProfile,
    rawSearch,
    update,
    remove,
    stats,
    waitTask,
  };
}
