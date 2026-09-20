import type { ProviderBundle } from "./provider.js";

/**
 * Agent Connections V1 (Issue #141 r15 §5) — where a decision becomes a grant.
 *
 * The Admin recorded what the Owner decided; it could not finish the
 * interaction, because oidc-provider resumes an interaction from ITS own
 * cookie on ITS own origin, and the Admin is deliberately a different origin.
 * So the browser comes back here carrying nothing but the uid, and this route
 * reads the decision somebody else made.
 *
 * What it can and cannot do is a property of its SQL role, not of this file:
 * the provider role holds no privilege on `decision`, `decided_at`,
 * `granted_generation`, `human_account_id` or `connection_id`. It cannot
 * approve, cannot say who approved, and cannot re-point a decision. It may
 * mark an approved interaction spent, exactly once, and write the grant that
 * follows.
 *
 * Three checks stand between an approval and a grant, and each of them fails
 * closed:
 *
 *  1. the browser must hold this provider's own interaction cookie, and it
 *     must name THIS uid — a uid pasted into a bare browser resumes nothing;
 *  2. the consent must be approved, unspent and still within its deadline;
 *  3. the connection must still be at the generation the consent recorded.
 *     A connection revoked or re-consented while the browser was away no
 *     longer matches, and the grant is destroyed rather than bound to it.
 *
 * (3) is the r12 defect stated as a check. The generation is taken from the
 * CONSENT, never read from the connection at grant time: reading it here is
 * precisely how a token refreshed from an old grant came to resolve against
 * the current generation and be admitted.
 */

export const RESUME_PATH = /^\/interaction\/([A-Za-z0-9_-]{1,256})\/resume$/u;

export interface ResumeOutcome {
  readonly handled: boolean;
  readonly code: string;
}

/**
 * Finishes the interaction with an error the CLIENT will see, rather than
 * leaving a browser on a dead page. `access_denied` is the honest answer for
 * every refusal here: none of them tell the client anything about why, which
 * would otherwise be a probe.
 */
const deny = async (
  bundle: ProviderBundle,
  request: unknown,
  response: unknown,
  code: string,
): Promise<ResumeOutcome> => {
  await bundle.provider.interactionFinished(
    request,
    response,
    { error: "access_denied", error_description: "consent was not granted" },
    { mergeWithLastSubmission: false },
  );
  return { handled: true, code };
};

export const resumeInteraction = async (
  bundle: ProviderBundle,
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  uid: string,
): Promise<ResumeOutcome> => {
  // (1) The provider's own interaction, from the provider's own cookie. A uid
  // in a URL is a name; this is the only thing that makes it a session.
  let interaction;
  try {
    interaction = await bundle.provider.interactionDetails(request, response);
  } catch {
    response.statusCode = 400;
    response.end();
    return { handled: true, code: "INTERACTION_NOT_RESUMABLE" };
  }
  if (interaction.uid !== uid)
    return deny(bundle, request, response, "INTERACTION_MISMATCH");

  // (2) The decision, as the control plane recorded it.
  const consent = await bundle.consents.read(uid);
  if (
    consent === null ||
    consent.decision !== "approved" ||
    consent.resumedAt !== null ||
    consent.connectionId === null ||
    consent.humanAccountId === null ||
    consent.grantedGeneration === null ||
    Date.parse(consent.expiresAt) <= Date.now()
  )
    return deny(bundle, request, response, "CONSENT_NOT_GRANTED");

  // What the human was shown must be what this provider is about to grant.
  // Both sides read the frozen row rather than the live request, so a request
  // that changed underneath the review page cannot be approved by it.
  if (
    consent.oauthClientId !== (interaction.params.client_id ?? "") ||
    consent.preset !== "read-only"
  )
    return deny(bundle, request, response, "CONSENT_DOES_NOT_MATCH_REQUEST");

  const capabilities = [...consent.capabilityScopes].sort();
  // The milestone gate, again, at the last place it can still refuse. An
  // approval that reached here asking for management was already refused by
  // the Admin and by a CHECK constraint; this is the layer that would catch a
  // consent row somehow written past both.
  if (capabilities.length !== 1 || capabilities[0] !== "artvenn:read")
    return deny(bundle, request, response, "SCOPE_NOT_AVAILABLE");

  const scopes = [...capabilities, ...consent.protocolScopes];

  // (3) The connection must still be where the decision left it.
  const stored = await bundle.connections.read(consent.connectionId);
  if (
    stored === null ||
    stored.connection.status !== "authorized" ||
    stored.connection.revokedAt !== null ||
    stored.connection.generation !== consent.grantedGeneration
  )
    return deny(bundle, request, response, "CONNECTION_MOVED");

  const grant = new bundle.provider.Grant({
    accountId: consent.humanAccountId,
    clientId: consent.oauthClientId,
  });
  // Both, and the measurement is why. The provider declares the capability
  // scopes in its top-level `scopes`, so it checks them as OIDC scopes on the
  // way back: a grant carrying only the RESOURCE scope resumes into a second
  // consent prompt with `op_scopes_missing: ["artvenn:read"]` and the browser
  // bounces back to the Admin forever. Probed on the running service, r15.
  for (const scope of scopes) grant.addOIDCScope(scope);
  for (const scope of capabilities)
    grant.addResourceScope(consent.resource, scope);
  const grantId = await grant.save();

  // The immutable snapshot, with the generation the CONSENT froze.
  await bundle.connections.createGrant({
    grantId,
    connectionId: consent.connectionId,
    generationAtConsent: consent.grantedGeneration,
    oauthClientId: consent.oauthClientId,
    humanSubject: consent.humanAccountId,
    issuer: bundle.config.issuer,
    resource: consent.resource,
    capabilityScopes: capabilities,
    protocolScopes: [...consent.protocolScopes],
    presetAtConsent: "read-only",
  });

  // Conditional on that same generation. If the connection moved between the
  // read above and here, nothing is pointed anywhere: the grant exists but is
  // unreachable, and no token can be minted against a connection that does not
  // name it. Refusing late is still refusing.
  const pointed = await bundle.connections.setCurrentGrant(
    consent.connectionId,
    grantId,
    consent.grantedGeneration,
  );
  if (!pointed) return deny(bundle, request, response, "CONNECTION_MOVED");

  // Spent, exactly once. The trigger refuses a second resume even if two
  // browsers arrive together, so this is a check and a record rather than a
  // race this code has to win.
  const spent = await bundle.consents.resume({
    interactionUid: uid,
    grantId,
  });
  if (spent === null) return deny(bundle, request, response, "CONSENT_SPENT");

  await bundle.provider.interactionFinished(
    request,
    response,
    {
      login: { accountId: consent.humanAccountId },
      consent: { grantId },
    },
    { mergeWithLastSubmission: false },
  );
  return { handled: true, code: `GRANTED:${scopes.length}` };
};
