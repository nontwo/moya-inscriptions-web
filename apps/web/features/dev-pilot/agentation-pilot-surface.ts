/**
 * Whether the Development-only Agentation pilot is composed, and where it
 * sends annotations.
 *
 * The pilot is opt-in and local: it exists only when `next dev` runs with
 * `MOYA_AGENTATION_ENDPOINT` set to a loopback HTTP origin (the
 * `agentation-mcp` server, port 4747 by default). A Production build
 * (`next build` inlines `NODE_ENV=production`) resolves to `null` whatever the
 * environment says, so the Formal surface composes no toolbar and opens no
 * connection. Annotation text is task input for an agent, never scope
 * authority; the resolver only decides composition.
 */
export interface AgentationPilotSurface {
  /** Loopback origin the toolbar posts annotations to, without a path. */
  readonly endpoint: string;
}

const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Accepts `http://127.0.0.1:<port>` style origins only. */
export const parseLoopbackEndpoint = (
  value: string | undefined,
): string | null => {
  if (value === undefined || value.trim() === "") return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "http:" ||
    !loopbackHosts.has(url.hostname) ||
    url.port === "" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (url.pathname !== "/" && url.pathname !== "")
  )
    return null;
  return url.origin;
};

export const resolveAgentationPilotSurface = (
  nodeEnv: string | undefined = process.env.NODE_ENV,
  endpoint: string | undefined = process.env.MOYA_AGENTATION_ENDPOINT,
): AgentationPilotSurface | null => {
  if (nodeEnv !== "development") return null;
  const origin = parseLoopbackEndpoint(endpoint);
  return origin === null ? null : { endpoint: origin };
};
