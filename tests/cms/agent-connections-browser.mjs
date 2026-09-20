import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";
import http from "node:http";
import { chromium } from "@playwright/test";

/**
 * Agent Connections V1 (Issue #141 r15 §8, §10) — the acceptance sequence, in
 * a real browser against a real `next dev` Admin and a real authorization
 * listener.
 *
 * The browser does the half only a browser can do: the cross-site landing the
 * provider redirects to, the same-origin step the human takes, the Owner
 * session the review page authenticates, and the consent POST. Everything
 * after consent is the CLIENT's half and is done here over plain HTTP,
 * because that is what a client does — it holds a PKCE verifier and speaks
 * JSON-RPC, it does not run in the Owner's tab.
 *
 * Nothing sensitive reaches stdout. Stage names are fixed words; the two
 * tokens are written to a mode-restricted handoff file the orchestrator reads
 * after it restarts the services, exactly as the existing Owner-browser
 * harness hands its access state across a process boundary.
 */

const READ_ONLY_TOOLS = [
  "artvenn_comments_query",
  "artvenn_comments_read",
  "artvenn_content_search",
  "artvenn_users_find",
];

let browser;
let callbacks;
let stage = "configuration";
const completed = [];
let backendToolRead = "NOT_RUN";
let refusalCode = null;

const origin = process.env.AGENT_ACCEPTANCE_ADMIN_ORIGIN ?? "";
const issuer = process.env.AGENT_ACCEPTANCE_ISSUER ?? "";
const resource = process.env.AGENT_ACCEPTANCE_RESOURCE ?? "";
const clientId = process.env.AGENT_ACCEPTANCE_CLIENT_ID ?? "";
const redirectUri = process.env.AGENT_ACCEPTANCE_REDIRECT_URI ?? "";

/** One JSON-RPC call to the Payload MCP endpoint. */
const mcp = async (token, body, sessionId) => {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${token}`,
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const response = await globalThis.fetch(`${origin}/api/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
  });
  const text = await response.text();
  // The endpoint may answer as JSON or as a single SSE frame.
  const payload = text.startsWith("event:")
    ? JSON.parse(
        text
          .split("\n")
          .find((line) => line.startsWith("data:"))
          ?.slice(5) ?? "{}",
      )
    : text
      ? JSON.parse(text)
      : {};
  return {
    status: response.status,
    sessionId: response.headers.get("mcp-session-id") ?? sessionId,
    payload,
  };
};

/**
 * The client's loopback callback, which is what a native client actually runs.
 *
 * Without it the browser's final hop lands on a closed port: the redirect is
 * real, so something has to answer it, and reading a code out of a failed
 * navigation would be reading a browser error rather than a delivered code.
 */
const callbackListener = async () => {
  const delivered = [];
  const waiting = [];
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", redirectUri);
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    const result = {
      code: url.searchParams.get("code"),
      error: url.searchParams.get("error"),
    };
    const next = waiting.shift();
    if (next) next(result);
    else delivered.push(result);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(Number(new URL(redirectUri).port), "127.0.0.1", resolve);
  });
  return {
    take: () =>
      delivered.length
        ? Promise.resolve(delivered.shift())
        : new Promise((resolve) => waiting.push(resolve)),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
};

const exchange = async (code, verifier) =>
  (
    await globalThis.fetch(`${issuer}/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new globalThis.URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: verifier,
        resource,
      }),
    })
  ).json();

try {
  assert.equal(process.env.CMS_ENVIRONMENT, "synthetic");
  for (const value of [origin, issuer, resource, clientId, redirectUri])
    assert.ok(value.length > 0);
  for (const value of [origin, issuer])
    assert.ok(
      ["localhost", "127.0.0.1"].includes(new URL(value).hostname),
      "acceptance runs on loopback only",
    );
  // The whole design rests on these being different hosts: cookies are
  // host-scoped and not port-scoped.
  assert.notEqual(new URL(origin).hostname, new URL(issuer).hostname);

  const access = JSON.parse(
    await readFile(process.env.CMS_QA_ACCESS_FILE, "utf8"),
  );

  stage = "launch";
  callbacks = await callbackListener();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  stage = "owner-signs-in";
  await page.goto(`${origin}/admin/login`);
  await page.locator('input[name="email"]').fill(access.ownerEmail);
  await page.locator('input[name="password"]').fill(access.ownerPassword);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL((url) => url.pathname === "/admin");

  /** The client's half of one connection: PKCE, consent, code, token. */
  const connect = async (first) => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const authorize = new URL(`${issuer}/auth`);
    for (const [key, value] of Object.entries({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: "artvenn:read offline_access",
      resource,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: randomBytes(8).toString("base64url"),
      // Without an explicit consent prompt `offline_access` does not survive
      // and no refresh token is issued at all.
      prompt: "consent",
    }))
      authorize.searchParams.set(key, value);

    // A real cross-site navigation: the browser starts on the issuer's host
    // and the provider sends it to the Admin's.
    await page.goto(authorize.href);
    await page.waitForURL((url) => url.origin === origin);

    if (first) {
      stage = "landing-is-unauthenticated";
      // The landing rendered, and it is NOT the admin shell: the Owner is
      // signed in, yet this navigation carried no session and the page did
      // not bounce them to a login they do not need.
      await page
        .locator("[data-agent-consent-landing]")
        .waitFor({ state: "visible" });
      assert.ok(!new URL(page.url()).pathname.startsWith("/admin"));
      assert.equal(
        await page.locator("[data-agent-consent-continue]").count(),
        1,
      );
      completed.push(stage);

      stage = "owner-continues-same-origin";
    }
    // The step the human takes. Same-origin, so the browser sends the
    // SameSite=Strict session it withheld a moment ago.
    await page.locator("[data-agent-consent-continue]").click();
    await page.waitForURL((url) =>
      url.pathname.startsWith("/admin/agent-connections/consent"),
    );
    if (first) completed.push(stage);

    if (first) {
      stage = "review-shows-the-request";
      await page.locator("[data-agent-consent]").waitFor({ state: "visible" });
      assert.equal(
        (await page.locator("[data-agent-consent-client]").innerText()).trim(),
        clientId,
      );
      assert.equal(
        (
          await page.locator("[data-agent-consent-resource]").innerText()
        ).trim(),
        resource,
      );
      assert.match(
        await page.locator("[data-agent-consent-scopes]").innerText(),
        /artvenn:read/u,
      );
      // Management is never offered.
      assert.doesNotMatch(
        await page.locator("[data-agent-consent-scopes]").innerText(),
        /artvenn:manage/u,
      );
      completed.push(stage);
      stage = "consent-approved";
    }

    await page.locator("[data-agent-consent-approve]").click();
    const arrival = await Promise.race([
      callbacks.take(),
      // The form renders a bare refusal code. Surfacing it is safe -- it names
      // a rule, never a value -- and without it a failure here says only
      // "the browser did not go where it was told".
      page
        .locator("[data-agent-consent-error]")
        .waitFor({ state: "visible", timeout: 30_000 })
        .then(async () => ({
          code: null,
          error: await page
            .locator("[data-agent-consent-error]")
            .getAttribute("data-agent-consent-error"),
        })),
    ]);
    if (arrival.error) refusalCode = arrival.error;
    assert.equal(arrival.error, null);
    assert.ok(arrival.code);
    if (first) completed.push(stage);
    const code = arrival.code;

    const tokens = await exchange(code, verifier);
    assert.equal(tokens.error, undefined);
    assert.match(tokens.access_token ?? "", /^artvenn_ct_/u);
    return tokens.access_token;
  };

  const firstToken = await connect(true);
  stage = "token-issued";
  completed.push(stage);

  stage = "mcp-initialize";
  const initialize = await mcp(firstToken, {
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "artvenn-acceptance", version: "0" },
    },
  });
  assert.equal(initialize.status, 200);
  assert.ok(initialize.payload.result);
  const session = initialize.sessionId;
  completed.push(stage);

  stage = "mcp-tools-list-is-read-only";
  const listed = await mcp(
    firstToken,
    { method: "tools/list", params: {} },
    session,
  );
  assert.equal(listed.status, 200);
  const names = (listed.payload.result?.tools ?? [])
    .map((tool) => tool.name)
    .sort();
  assert.deepEqual(names, READ_ONLY_TOOLS);
  completed.push(stage);

  stage = "mcp-forbidden-tool-denied";
  // The real management tools of the OTHER preset, plus an editorial tool
  // from the separate policy domain. A read-only connection must reach none
  // of them, however its token is shaped.
  for (const name of [
    "artvenn_operations_execute",
    "artvenn_comments_prepare",
    "artvenn_featured_prepare",
    "editorial_query",
  ]) {
    const forbidden = await mcp(
      firstToken,
      { method: "tools/call", params: { name, arguments: {} } },
      session,
    );
    // Denied, whatever shape the denial takes: a transport refusal, a
    // JSON-RPC error, or an MCP tool result flagged `isError`. What must NOT
    // happen is a successful call.
    const denied =
      forbidden.status !== 200 ||
      forbidden.payload.error !== undefined ||
      forbidden.payload.result?.isError === true;
    assert.ok(denied, name);
  }
  completed.push(stage);

  stage = "revoked-token-denied";
  await page.goto(`${origin}/admin/agent-connections`);
  await page.locator("[data-agent-connections]").waitFor({ state: "visible" });
  const disconnect = page.locator("[data-agent-connection-disconnect]").first();
  await disconnect.waitFor({ state: "visible" });
  await disconnect.click();
  await page
    .locator('[data-agent-connection-status="revoked"]')
    .first()
    .waitFor({ state: "visible" });
  // The SAME token, on its next request. Nothing was deleted and no clock was
  // consulted.
  //
  // Be exact about WHICH rule denies it: the canonical deny is the
  // connection's revoked STATUS, which `admitGrant` refuses on before it ever
  // compares generations. Measured: with the revoke's generation bump removed,
  // this step still passes, because status alone is enough here. The
  // generation is what keeps the old token denied AFTER a reconnect, and that
  // is the step below, not this one.
  const afterRevoke = await mcp(
    firstToken,
    { method: "tools/list", params: {} },
    session,
  );
  assert.ok(
    afterRevoke.status === 401 ||
      afterRevoke.status === 403 ||
      afterRevoke.payload.error !== undefined,
  );
  completed.push(stage);

  stage = "reconnect-issues-new-access";
  const secondToken = await connect(false);
  assert.notEqual(secondToken, firstToken);
  const reconnected = await mcp(secondToken, {
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "artvenn-acceptance", version: "0" },
    },
  });
  assert.equal(reconnected.status, 200);
  completed.push(stage);

  stage = "old-token-still-denied";
  // `initialize`, not `tools/list`. An independent review pointed out that the
  // earlier version omitted the session id that every other `tools/list` in
  // this file passes, so a transport-level refusal for a MISSING SESSION would
  // have satisfied the assertion even with a fully valid token — the stage
  // could not fail for its own name. `initialize` needs no session, so the
  // only thing left that can refuse it is the boundary.
  const stale = await mcp(firstToken, {
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "artvenn-acceptance-stale", version: "0" },
    },
  });
  assert.ok(stale.status !== 200 || stale.payload.error !== undefined);
  // And the positive control, so "denied" is not just "everything is denied".
  const live = await mcp(secondToken, {
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "artvenn-acceptance-live", version: "0" },
    },
  });
  assert.equal(live.status, 200);
  completed.push(stage);

  // Handed across the restart in a mode-restricted file, never on stdout.
  await writeFile(
    process.env.AGENT_ACCEPTANCE_TOKEN_FILE,
    JSON.stringify({ stale: firstToken, live: secondToken }),
    { mode: 0o600 },
  );

  console.log(JSON.stringify({ ok: true, stage, completed, backendToolRead }));
} catch (error) {
  console.log(
    JSON.stringify({
      ok: false,
      stage,
      completed,
      refusalCode,
      category:
        error instanceof Error ? error.constructor.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
} finally {
  await browser?.close();
  await callbacks?.close();
}
