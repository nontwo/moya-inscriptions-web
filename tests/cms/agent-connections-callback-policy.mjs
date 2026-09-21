import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import process from "node:process";
import console from "node:console";
import { URL } from "node:url";

/**
 * Agent Connections V1 (Issue #141) — what the REAL provider does with a
 * callback, measured against the policy this repository records.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE UNIT TESTS. `parseRegisteredClients`
 * decides what may be REGISTERED; `oidc-provider` decides what may be
 * REDEEMED, and those are different programs with different rules. A unit
 * test on the registry cannot see the provider's RFC 8252 behaviour, and a
 * comment claiming to know it is exactly the kind of claim this task has had
 * to retract before. So this drives the running authorization service.
 *
 * The one result that must not be quietly dropped: for a native client, the
 * provider matches a loopback redirect IGNORING THE PORT
 * (`stripLoopbackPort`), over the same three hosts, whatever the registry
 * stored. That is asserted here as ACCEPTED rather than wished away, because
 * a test that asserted the port was pinned would be asserting a property this
 * stack does not have.
 */

const issuer = process.env.AGENT_ACCEPTANCE_ISSUER ?? "";
const resource = process.env.AGENT_ACCEPTANCE_RESOURCE ?? "";
const ipClient = process.env.AGENT_ACCEPTANCE_CLIENT_ID ?? "";
const hostClient = process.env.AGENT_ACCEPTANCE_HOST_CLIENT_ID ?? "";
const hostRedirect = process.env.AGENT_ACCEPTANCE_HOST_REDIRECT ?? "";
const ipRedirect = process.env.AGENT_ACCEPTANCE_REDIRECT_URI ?? "";

/**
 * Asks the provider to authorize, and reports only whether it got as far as
 * an interaction. Never follows the redirect and never completes a flow.
 */
const attempt = async (clientId, redirectUri) => {
  const verifier = randomBytes(32).toString("base64url");
  const url = new URL(`${issuer}/auth`);
  for (const [key, value] of Object.entries({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "artvenn:read",
    resource,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    state: randomBytes(8).toString("base64url"),
  }))
    url.searchParams.set(key, value);
  const response = await globalThis.fetch(url, { redirect: "manual" });
  const location = response.headers.get("location") ?? "";
  if (response.status === 303 && !location.includes("error="))
    return "accepted";
  // A bare OAuth error code, never a body and never the URL.
  const text = response.status === 303 ? location : await response.text();
  const code =
    /error(?:=|%22:%22|":")?\s*(?:<\/strong>:\s*)?([a-z_]{3,40})/u.exec(
      text.replaceAll("\n", " "),
    );
  return `refused:${code?.[1] ?? response.status}`;
};

const completed = [];
let stage = "configuration";
try {
  for (const value of [
    issuer,
    resource,
    ipClient,
    hostClient,
    hostRedirect,
    ipRedirect,
  ])
    assert.ok(value.length > 0);

  stage = "registered-callbacks-are-accepted";
  assert.equal(await attempt(ipClient, ipRedirect), "accepted");
  assert.equal(await attempt(hostClient, hostRedirect), "accepted");
  completed.push(stage);

  stage = "a-policy-is-per-registration-not-per-brand";
  // The strict registration may not use the NAME, and the permissive one may
  // not use the ADDRESS: each is held to the shape it registered, and a
  // spelling is never rewritten into the other.
  const asName = new URL(ipRedirect);
  asName.hostname = "localhost";
  assert.match(await attempt(ipClient, asName.href), /^refused:/u);
  const asAddress = new URL(hostRedirect);
  asAddress.hostname = "127.0.0.1";
  assert.match(await attempt(hostClient, asAddress.href), /^refused:/u);
  completed.push(stage);

  stage = "everything-off-the-registered-shape-is-refused";
  for (const build of [
    (url) => {
      url.pathname = "/elsewhere";
    },
    (url) => {
      url.protocol = "https:";
    },
    (url) => {
      url.hostname = "localhost.invalid";
    },
  ]) {
    const url = new URL(hostRedirect);
    build(url);
    assert.match(await attempt(hostClient, url.href), /^refused:/u, url.href);
  }
  assert.match(
    await attempt(hostClient, "http://evil.invalid/callback"),
    /^refused:/u,
  );
  completed.push(stage);

  stage = "an-unregistered-client-is-refused-as-invalid-client";
  // Not a server error. This was a 500 `server_error` until the provider
  // adapter learned to answer "no such stored Client" instead of throwing on
  // a model it deliberately keeps no rows for — a refusal either way, but one
  // an Owner who mistyped a client id could not diagnose.
  assert.equal(
    await attempt("artvenn-unregistered-client", ipRedirect),
    "refused:invalid_client",
  );
  completed.push(stage);

  stage = "the-port-is-not-pinned-and-this-is-recorded";
  // RFC 8252 section 7.3, implemented by the provider for native clients over
  // loopback. Asserted as ACCEPTED because it is what this stack does; the
  // registry's explicit-port rule is defence in depth and a readability rule,
  // and calling it a guarantee would be false.
  for (const [client, redirect] of [
    [ipClient, ipRedirect],
    [hostClient, hostRedirect],
  ]) {
    const other = new URL(redirect);
    other.port = String(Number(other.port) + 1);
    assert.equal(await attempt(client, other.href), "accepted", other.href);
  }
  completed.push(stage);

  console.log(JSON.stringify({ ok: true, stage, completed }));
} catch (error) {
  console.log(
    JSON.stringify({
      ok: false,
      stage,
      completed,
      category:
        error instanceof Error ? error.constructor.name : "UnknownError",
    }),
  );
  process.exitCode = 1;
}
