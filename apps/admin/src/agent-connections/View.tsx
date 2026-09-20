import { DefaultTemplate } from "@payloadcms/next/templates";
import type { AdminViewServerProps } from "payload";

import { isOwner } from "../editorial/access";
import { AgentConnectionsClient } from "./connections-client";
import { AgentConsentClient } from "./consent-client";
import { ConsentError, describeConsent, mintConsentTicket } from "./consent";
import { connectionsEnabled } from "./composition";
import { resolveConnection } from "./resolve";
import { consentRuntime } from "./runtime";

/**
 * Agent Connections V1 (Issue #141 r15 §5, §9) — the two Owner-only views.
 *
 * `AgentConsentView` is the REVIEW page: the second half of the two-step the
 * measured cookie behaviour forces. The landing outside `/admin` authenticated
 * nobody; this page does, because the human took a same-origin step of their
 * own and the browser sent the `SameSite=Strict` session with it.
 *
 * Arming happens HERE, on the server, during the render that the Owner's
 * session authenticated, and from the row the PROVIDER wrote rather than from
 * anything the request supplied.
 *
 * Be exact about what that is: it IS a write during a GET page render, and a
 * prefetch of this link would perform it. An independent review was right that
 * an earlier version of this sentence said the opposite. What makes it safe is
 * not the method but the two gates above it — the Owner check precedes it, and
 * on the cross-site navigation the `SameSite=Strict` session is absent, so a
 * prefetch from anywhere but an authenticated Admin page arms nothing. Re-arming
 * is also idempotent in effect: it replaces the previous ticket and cannot
 * touch a decided or expired interaction.
 */

const Shell = ({
  children,
  props,
}: {
  readonly children: React.ReactNode;
  readonly props: AdminViewServerProps;
}) => {
  const { req, visibleEntities } = props.initPageResult;
  return (
    <DefaultTemplate {...props} req={req} visibleEntities={visibleEntities}>
      {isOwner(req) ? children : <p role="alert">此工作区仅限 Owner。</p>}
    </DefaultTemplate>
  );
};

/** A refusal that names a code and nothing else. */
const Refused = ({ code }: { readonly code: string }) => (
  <section data-agent-consent-refused={code}>
    <h2>无法确认这次授权</h2>
    <p role="alert">{code}</p>
    <p>请回到应用重新发起连接。</p>
  </section>
);

const firstParam = (
  value: string | string[] | undefined,
): string | undefined => (Array.isArray(value) ? value[0] : value);

export const AgentConnectionsView = (props: AdminViewServerProps) => (
  <Shell props={props}>
    {connectionsEnabled() ? (
      <AgentConnectionsClient />
    ) : (
      <p role="alert">AI 连接未启用。</p>
    )}
  </Shell>
);

export const AgentConsentView = async (props: AdminViewServerProps) => {
  const body = await consentBody(props);
  return <Shell props={props}>{body}</Shell>;
};

/**
 * Everything the review does before it renders anything. Kept out of the
 * component so each refusal is one `return`, and so the arming write happens
 * exactly once per render rather than once per React pass.
 */
const consentBody = async (
  props: AdminViewServerProps,
): Promise<React.ReactNode> => {
  const { req } = props.initPageResult;
  // The Owner check is repeated here rather than left to the shell: the shell
  // decides what is DISPLAYED, and this decides what is WRITTEN. A view that
  // armed an interaction before its wrapper refused to show it would have
  // bound a consent to somebody the page never let in.
  if (!isOwner(req)) return null;
  const runtime = consentRuntime();
  if (runtime === null) return <Refused code="NOT_ENABLED" />;

  const interaction = firstParam(props.searchParams?.interaction);
  if (interaction === undefined) return <Refused code="INTERACTION_REQUIRED" />;

  const userId = req.user?.id;
  if (typeof userId !== "string" && typeof userId !== "number")
    return <Refused code="OWNER_ONLY" />;
  const humanAccountId = `payload-user-${String(userId)}`;

  try {
    const consent = await runtime.consents.read(interaction);
    // A uid nobody opened, or one already decided, reveals nothing beyond
    // "not available": a prober must not be able to tell a live interaction
    // from a spent one.
    if (consent === null || consent.decision !== null)
      return <Refused code="INTERACTION_NOT_AVAILABLE" />;

    const display = describeConsent({
      interactionUid: consent.interactionUid,
      oauthClientId: consent.oauthClientId,
      resource: consent.resource,
      capabilityScopes: consent.capabilityScopes,
      protocolScopes: consent.protocolScopes,
      preset: consent.preset,
      expiresAt: consent.expiresAt,
      environment: runtime.environment,
      now: new Date(),
    });
    // The resource the human is about to be shown must be the one this Admin
    // is the resource server for. Refused, never rewritten to agree.
    if (display.resource !== runtime.resource)
      return <Refused code="RESOURCE_NOT_AVAILABLE" />;

    const connection = await resolveConnection(
      runtime,
      humanAccountId,
      display.client,
    );
    const { ticket, digest } = mintConsentTicket();
    const armed = await runtime.consents.arm({
      interactionUid: display.interaction,
      ticketDigest: digest,
      connectionId: connection.id,
      humanAccountId,
    });
    if (armed === null) return <Refused code="INTERACTION_NOT_AVAILABLE" />;

    return <AgentConsentClient display={display} ticket={ticket} />;
  } catch (error) {
    return (
      <Refused
        code={
          error instanceof ConsentError ? error.code : "CONSENT_UNAVAILABLE"
        }
      />
    );
  }
};
