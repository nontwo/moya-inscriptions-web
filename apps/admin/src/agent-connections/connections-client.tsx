"use client";

import { useCallback, useEffect, useState } from "react";

interface ListedConnectionView {
  readonly id: string;
  readonly client: string;
  readonly clientLabel: string | null;
  readonly oauthClientId: string;
  readonly environment: string;
  readonly preset: string;
  readonly status: string;
  readonly generation: number;
  readonly consentedAt: string | null;
  readonly revokedAt: string | null;
  readonly lastVerifiedAt: string | null;
  readonly hasCurrentGrant: boolean;
}

interface RegisteredClientView {
  readonly clientId: string;
  readonly family: string;
  readonly label: string;
}

const STATUS_LABEL: Readonly<Record<string, string>> = {
  "awaiting-consent": "等待授权",
  authorized: "已授权",
  revoked: "已断开",
};

/**
 * The `AI 连接` page.
 *
 * It shows only what the database recorded. There is deliberately no
 * "online", no green dot and no "connected now": nothing observes liveness,
 * and the nearest real fact — the last request that actually authenticated —
 * is shown as exactly that. A service self-check, a protocol success, a
 * desktop success and a phone success are four different facts, and this page
 * claims none of them on another's behalf.
 *
 * No token, key or secret is ever displayed. There is no copy button and no
 * "one-click install", because there is no credential here for a human to
 * carry: the client obtains its own through the browser consent flow.
 */
export const AgentConnectionsClient = () => {
  const [connections, setConnections] = useState<ListedConnectionView[]>([]);
  const [clients, setClients] = useState<RegisteredClientView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/agent-connections", {
        credentials: "same-origin",
      });
      const payload: unknown = await response.json();
      const body =
        typeof payload === "object" && payload !== null
          ? (payload as { ok?: unknown; error?: unknown; result?: unknown })
          : {};
      if (!response.ok || body.ok !== true) {
        setError(typeof body.error === "string" ? body.error : "REFUSED");
        return;
      }
      const result = body.result as {
        connections?: ListedConnectionView[];
        clients?: RegisteredClientView[];
      };
      setConnections(result.connections ?? []);
      setClients(result.clients ?? []);
      setError(null);
    } catch {
      setError("NETWORK");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (path: string, body: unknown) => {
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload: unknown = await response.json();
      const parsed =
        typeof payload === "object" && payload !== null
          ? (payload as { ok?: unknown; error?: unknown })
          : {};
      if (!response.ok || parsed.ok !== true)
        setError(typeof parsed.error === "string" ? parsed.error : "REFUSED");
      else setError(null);
      await load();
    } catch {
      setError("NETWORK");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section data-agent-connections>
      <h2>AI 连接</h2>
      <p>
        这里列出你授权过的 AI 应用。目前只提供<strong>只读</strong>连接：
        它们可以查询内容，不能修改、发布或删除，也不能代你审批操作。
      </p>

      {error !== null ? (
        <p data-agent-connections-error={error} role="alert">
          读取失败：{error}
        </p>
      ) : null}

      <h3>新建连接</h3>
      {clients.length === 0 ? (
        <p>没有已注册的应用。</p>
      ) : (
        <ul>
          {clients.map((client) => (
            <li key={client.clientId}>
              {client.label}{" "}
              <button
                data-agent-connections-start={client.clientId}
                disabled={busy}
                onClick={() =>
                  void post("/api/agent-connections/start", {
                    clientId: client.clientId,
                  })
                }
                type="button"
              >
                准备连接
              </button>
            </li>
          ))}
        </ul>
      )}
      <p>
        「准备连接」只创建一条尚未授权的记录，本身不授予任何权限。
        随后在应用里发起连接，浏览器会带你回到这里确认。
      </p>

      <h3>已有连接</h3>
      {connections.length === 0 ? (
        <p data-agent-connections-empty>还没有任何连接。</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>应用</th>
              <th>状态</th>
              <th>权限</th>
              <th>代数</th>
              <th>授权时间</th>
              <th>最近一次通过验证的请求</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {connections.map((connection) => (
              <tr data-agent-connection={connection.id} key={connection.id}>
                <td data-agent-connection-client>
                  {connection.clientLabel ?? connection.client}
                </td>
                <td data-agent-connection-status={connection.status}>
                  {STATUS_LABEL[connection.status] ?? connection.status}
                  {connection.status === "authorized" &&
                  !connection.hasCurrentGrant
                    ? "（尚未完成）"
                    : null}
                </td>
                <td data-agent-connection-preset={connection.preset}>
                  {connection.preset === "read-only"
                    ? "只读"
                    : connection.preset}
                </td>
                <td data-agent-connection-generation>
                  {connection.generation}
                </td>
                <td>{connection.consentedAt ?? "—"}</td>
                {/* An observation, never a liveness claim. */}
                <td data-agent-connection-last-verified>
                  {connection.lastVerifiedAt ?? "尚未观察到"}
                </td>
                <td>
                  {connection.status === "revoked" ? null : (
                    <button
                      data-agent-connection-disconnect={connection.id}
                      disabled={busy}
                      onClick={() =>
                        void post("/api/agent-connections/disconnect", {
                          id: connection.id,
                        })
                      }
                      type="button"
                    >
                      断开
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        断开会立即拒绝这条连接上的访问，包括还没过期的令牌和已经打开的会话。
        重新连接需要一次全新的授权，旧的访问不会因此恢复。
      </p>
    </section>
  );
};
