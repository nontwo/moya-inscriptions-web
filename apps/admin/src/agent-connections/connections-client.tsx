"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import styles from "./connections.module.css";

interface ListedConnectionView {
  readonly id: string;
  readonly client: string;
  readonly clientLabel: string | null;
  readonly principalLabel: string;
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

/** What this deployment is, so a reader never has to assume. */
interface SurfaceView {
  readonly environment: string;
  readonly issuer: string;
  readonly resource: string;
  readonly authMethod: string;
}

/**
 * The `AI 连接` page.
 *
 * WHAT IT CLAIMS, AND WHAT IT REFUSES TO. It shows only what the database
 * recorded. There is no "online", no green dot and no "connected now":
 * nothing here observes liveness, and the nearest real fact — the last
 * request that actually authenticated — is shown as exactly that. A service
 * self-check, a protocol success, a desktop success and a phone success are
 * four different facts, and this page claims none of them on another's
 * behalf.
 *
 * NO SECRET REACHES THIS COMPONENT. The list endpoint sends no token, no key,
 * no cookie and no consent ticket, so there is nothing here for a copy button
 * to leak: a client obtains its own credential through the browser consent
 * flow, and a human never carries one.
 *
 * THE SHAPE. Four levels, in the order a daily user needs them: what is
 * connected, how to connect something new, the deployment's own technical
 * detail, and — in Development only — the identities this task uses to test
 * itself. Identifiers live in the detail level and never in a primary row,
 * because "which of my applications is this" is answered by a name.
 */

const PRESET_FAMILIES = ["cursor", "claude", "codex"] as const;

/**
 * The three clients the Admin offers a one-click setup for.
 *
 * PRESENTATION ONLY. The backend authorizes any registered client whatever
 * its family, and these three are cards and copy — not the support boundary.
 * A fourth vendor needs a registration, not an entry here; that is the whole
 * point of the generic registry, and `其他 MCP 客户端` below says so.
 */
const PRESETS: readonly {
  readonly family: (typeof PRESET_FAMILIES)[number];
  readonly name: string;
  readonly note: string;
}[] = [
  {
    family: "cursor",
    name: "Cursor Desktop",
    note: "在 Cursor 的 MCP 设置里添加 ArtVenn，授权后即可在对话中查询。",
  },
  {
    family: "claude",
    name: "Claude Code",
    note: "在 Claude Code 中添加 ArtVenn 作为远程 MCP 服务器，并完成浏览器授权。",
  },
  {
    family: "codex",
    name: "Codex",
    note: "在 Codex 的 MCP 配置中指向 ArtVenn，授权流程与其他客户端一致。",
  },
];

/**
 * The user-facing state of a connection.
 *
 * Deliberately small, and deliberately not the raw lifecycle enum: those
 * names appear once, in the technical detail, where somebody reading them
 * wants the database's word rather than the product's.
 */
const describeStatus = (
  connection: ListedConnectionView,
): { readonly text: string; readonly tone: string } => {
  if (connection.status === "revoked") return { text: "已断开", tone: "muted" };
  if (connection.status === "awaiting-consent")
    return { text: "等待授权", tone: "pending" };
  if (connection.status === "authorized")
    return connection.hasCurrentGrant
      ? { text: "已授权", tone: "active" }
      : // Authorized in the record, with no grant behind it: the application
        // has not finished, or its grant was destroyed. "已授权" would be a
        // promise this row cannot keep.
        { text: "需要重新授权", tone: "attention" };
  return { text: "未知 / 暂不可用", tone: "muted" };
};

const AUTH_METHOD_LABEL: Readonly<Record<string, string>> = {
  "oauth-browser-consent": "OAuth（浏览器授权）",
};

const PRESET_LABEL: Readonly<Record<string, string>> = {
  "read-only": "只读",
};

/** A timestamp a person can read, with the exact value kept in `title`. */
const whenText = (value: string | null): string => {
  if (value === null) return "—";
  const at = Date.parse(value);
  if (Number.isNaN(at)) return value;
  const seconds = Math.round((Date.now() - at) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 2_592_000) return `${Math.floor(seconds / 86_400)} 天前`;
  return new Date(at).toLocaleDateString();
};

const CopyValue = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) => {
  const [copied, setCopied] = useState(false);
  return (
    <>
      <span className={styles.mono}>{value}</span>
      <button
        className={styles.copy}
        onClick={() => {
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
        title={`复制${label}`}
        type="button"
      >
        {copied ? "已复制" : "复制"}
      </button>
    </>
  );
};

export const AgentConnectionsClient = () => {
  const [connections, setConnections] = useState<ListedConnectionView[]>([]);
  const [clients, setClients] = useState<RegisteredClientView[]>([]);
  const [surface, setSurface] = useState<SurfaceView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingDisconnect, setPendingDisconnect] =
    useState<ListedConnectionView | null>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);

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
        environment?: string;
        issuer?: string;
        resource?: string;
        authMethod?: string;
      };
      setConnections(result.connections ?? []);
      setClients(result.clients ?? []);
      setSurface(
        result.environment === undefined
          ? null
          : {
              environment: result.environment,
              issuer: result.issuer ?? "",
              resource: result.resource ?? "",
              authMethod: result.authMethod ?? "",
            },
      );
      setError(null);
    } catch {
      setError("NETWORK");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The dialog is opened as a MODAL, so the platform supplies the focus trap,
  // the backdrop and Escape. Nothing here reimplements those.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (pendingDisconnect !== null && !dialog.open) {
      try {
        dialog.showModal();
      } catch {
        // Not every environment implements the modal mode. Falling back to
        // the open attribute keeps the confirmation reachable rather than
        // leaving a destructive action with no way to confirm it.
        dialog.open = true;
      }
    }
    if (pendingDisconnect === null && dialog.open) dialog.close();
  }, [pendingDisconnect]);

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

  const nameOf = (connection: ListedConnectionView): string =>
    connection.clientLabel ?? connection.client;

  // Development-only surface. `Synthetic` is the environment this task runs,
  // and the test identities below must never reach a production-facing page.
  const isDevelopment =
    surface !== null && surface.environment !== "production";
  const presetFamilies = new Set<string>(PRESET_FAMILIES);
  const ordinaryClients = clients.filter((client) =>
    presetFamilies.has(client.family),
  );
  // Anything registered under a family the Admin offers no preset for. In this
  // deployment that is exactly the two identities this task uses to test
  // itself, and they belong behind a disclosure rather than in the list an
  // Owner reads every day.
  const utilityClients = clients.filter(
    (client) => !presetFamilies.has(client.family),
  );
  const active = connections.filter(
    (connection) => connection.status !== "revoked",
  );
  const history = connections.filter(
    (connection) => connection.status === "revoked",
  );

  const startFor = (family: string) =>
    ordinaryClients.find((client) => client.family === family);

  return (
    <section className={styles.page} data-agent-connections>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>AI 连接</h2>
          {surface === null ? null : (
            <span
              className={styles.badge}
              data-agent-connections-environment={surface.environment}
              data-tone="neutral"
            >
              {/* Capitalised for the badge only. The exact value the server
                  sent stays on the data attribute and in 高级信息, because
                  that is the one a reader may need to match against a
                  configuration file. */}
              {surface.environment.charAt(0).toUpperCase() +
                surface.environment.slice(1)}
            </span>
          )}
          <span className={styles.badge} data-tone="neutral">
            只读
          </span>
        </div>
        <p className={styles.lead}>
          连接 AI 应用访问 ArtVenn。当前仅提供只读连接：可以查询内容，
          不能修改、发布、删除或代你审批。
        </p>
      </header>

      {error !== null ? (
        <p
          className={styles.notice}
          data-agent-connections-error={error}
          role="alert"
        >
          读取失败：{error}
        </p>
      ) : null}

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>已连接</h3>
          <p className={styles.sectionNote}>
            「最近一次通过验证的请求」是最后一次成功访问的时间，不代表此刻在线。
          </p>
        </div>
        {active.length === 0 ? (
          <p className={styles.empty} data-agent-connections-empty>
            还没有已连接的应用。在下面选择一个应用开始连接。
          </p>
        ) : (
          <div className={styles.cards}>
            {active.map((connection) => {
              const status = describeStatus(connection);
              const open = expanded === connection.id;
              return (
                <article
                  className={styles.card}
                  data-agent-connection={connection.id}
                  key={connection.id}
                >
                  <div className={styles.cardMain}>
                    <div className={styles.cardTitleRow}>
                      <h4
                        className={styles.cardTitle}
                        data-agent-connection-client
                      >
                        {nameOf(connection)}
                      </h4>
                      <span
                        className={styles.badge}
                        data-agent-connection-status={connection.status}
                        data-tone={status.tone}
                      >
                        {status.text}
                      </span>
                      <span
                        className={styles.badge}
                        data-agent-connection-preset={connection.preset}
                        data-tone="neutral"
                      >
                        {PRESET_LABEL[connection.preset] ?? connection.preset}
                      </span>
                    </div>
                    <div className={styles.cardMeta}>
                      <span
                        data-agent-connection-last-verified
                        title={connection.lastVerifiedAt ?? undefined}
                      >
                        最近一次通过验证的请求：
                        {connection.lastVerifiedAt === null
                          ? "尚未观察到"
                          : whenText(connection.lastVerifiedAt)}
                      </span>
                      <span title={connection.consentedAt ?? undefined}>
                        授权时间：{whenText(connection.consentedAt)}
                      </span>
                    </div>
                    {open ? (
                      <dl className={styles.detailList}>
                        <dt>连接 ID</dt>
                        <dd>
                          <CopyValue label="连接 ID" value={connection.id} />
                        </dd>
                        <dt>OAuth 客户端</dt>
                        <dd>
                          <CopyValue
                            label="OAuth 客户端 ID"
                            value={connection.oauthClientId}
                          />
                        </dd>
                        <dt>机器身份</dt>
                        <dd>
                          <span className={styles.mono}>
                            {connection.principalLabel}
                          </span>
                        </dd>
                        <dt>代数 / 状态</dt>
                        <dd>
                          <span className={styles.mono}>
                            {connection.generation} · {connection.status}
                          </span>
                        </dd>
                      </dl>
                    ) : null}
                  </div>
                  <div className={styles.cardActions}>
                    <button
                      aria-expanded={open}
                      className={styles.button}
                      data-agent-connection-details={connection.id}
                      onClick={() => setExpanded(open ? null : connection.id)}
                      type="button"
                    >
                      {open ? "收起详情" : "查看详情"}
                    </button>
                    <button
                      className={`${styles.button} ${styles.buttonDanger}`}
                      data-agent-connection-disconnect={connection.id}
                      disabled={busy}
                      onClick={() => setPendingDisconnect(connection)}
                      type="button"
                    >
                      断开
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h3 className={styles.sectionTitle}>连接新应用</h3>
        </div>
        <div className={styles.presetGrid}>
          {PRESETS.map((preset) => {
            const registered = startFor(preset.family);
            const pending = connections.find(
              (connection) =>
                connection.oauthClientId === registered?.clientId &&
                connection.status === "awaiting-consent",
            );
            return (
              <article
                className={styles.preset}
                data-agent-connections-preset={preset.family}
                key={preset.family}
              >
                <h4 className={styles.presetName}>{preset.name}</h4>
                <p className={styles.presetNote}>{preset.note}</p>
                <div className={styles.presetFoot}>
                  {registered === undefined ? (
                    <span className={styles.badge} data-tone="muted">
                      未配置
                    </span>
                  ) : pending !== undefined ? (
                    <span className={styles.badge} data-tone="pending">
                      等待应用完成授权
                    </span>
                  ) : (
                    <button
                      className={`${styles.button} ${styles.buttonPrimary}`}
                      data-agent-connections-start={registered.clientId}
                      disabled={busy}
                      onClick={() =>
                        void post("/api/agent-connections/start", {
                          clientId: registered.clientId,
                        })
                      }
                      type="button"
                    >
                      开始连接
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
        <article className={styles.preset} data-agent-connections-other>
          <h4 className={styles.presetName}>其他 MCP 客户端</h4>
          <p className={styles.presetNote}>
            任何符合当前 MCP 和 OAuth 接入要求的客户端都可以使用同一套 ArtVenn
            工具。
          </p>
          <div className={styles.presetFoot}>
            <a
              className={styles.button}
              href="https://github.com/nontwo/moya-inscriptions-web/blob/main/docs/community/agent-connections-v1/integration.md"
              rel="noreferrer"
              target="_blank"
            >
              查看连接方式
            </a>
          </div>
        </article>
        <p className={styles.sectionNote}>
          「开始连接」只创建一条尚未授权的记录，本身不授予任何权限。
          随后在应用里完成授权，浏览器会带你回到这里确认。
        </p>
      </section>

      {history.length === 0 ? null : (
        <details className={styles.disclosure} data-agent-connections-history>
          <summary>历史连接（{history.length}）</summary>
          <div className={styles.disclosureBody}>
            {history.map((connection) => (
              <div
                className={styles.cardTitleRow}
                data-agent-connection={connection.id}
                key={connection.id}
              >
                <span className={styles.cardTitle}>{nameOf(connection)}</span>
                <span
                  className={styles.badge}
                  data-agent-connection-status={connection.status}
                  data-tone="muted"
                >
                  已断开
                </span>
                <span
                  className={styles.sectionNote}
                  title={connection.revokedAt ?? undefined}
                >
                  {whenText(connection.revokedAt)}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {isDevelopment && utilityClients.length > 0 ? (
        <details className={styles.disclosure} data-agent-connections-utilities>
          <summary>开发测试工具</summary>
          <div className={styles.disclosureBody}>
            <p className={styles.sectionNote}>
              这些是本任务用来自测的客户端身份，不是日常使用的连接方式。 仅在
              Development / Synthetic 环境显示。
            </p>
            {utilityClients.map((client) => (
              <div className={styles.cardTitleRow} key={client.clientId}>
                <span className={styles.cardTitle}>{client.label}</span>
                <span className={styles.badge} data-tone="muted">
                  测试工具
                </span>
                <button
                  className={styles.button}
                  data-agent-connections-start={client.clientId}
                  disabled={busy}
                  onClick={() =>
                    void post("/api/agent-connections/start", {
                      clientId: client.clientId,
                    })
                  }
                  type="button"
                >
                  开始连接
                </button>
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {surface === null ? null : (
        <details className={styles.disclosure} data-agent-connections-advanced>
          <summary>高级信息</summary>
          <div className={styles.disclosureBody}>
            <dl className={styles.detailList}>
              <dt>MCP 地址</dt>
              <dd>
                <CopyValue label="MCP 地址" value={surface.resource} />
              </dd>
              <dt>授权服务</dt>
              <dd>
                <CopyValue label="授权服务地址" value={surface.issuer} />
              </dd>
              <dt>环境</dt>
              <dd>
                <span className={styles.mono}>{surface.environment}</span>
              </dd>
              <dt>认证方式</dt>
              <dd>
                <span
                  className={styles.mono}
                  data-agent-connections-auth-method={surface.authMethod}
                >
                  {AUTH_METHOD_LABEL[surface.authMethod] ?? surface.authMethod}
                </span>
              </dd>
            </dl>
            <p className={styles.sectionNote}>
              这里不会显示任何令牌、密钥或凭据：客户端通过浏览器授权自行获取，
              不需要你复制任何东西。
            </p>
          </div>
        </details>
      )}

      <dialog
        className={styles.dialog}
        data-agent-connections-confirm
        onCancel={() => setPendingDisconnect(null)}
        onClose={() => setPendingDisconnect(null)}
        ref={dialogRef}
      >
        {pendingDisconnect === null ? null : (
          <div className={styles.dialogBody}>
            <h3 className={styles.dialogTitle}>
              断开 {nameOf(pendingDisconnect)}？
            </h3>
            <p className={styles.dialogText}>
              断开后，这个连接会立即失去 ArtVenn 访问权限。Cursor
              中保存的本地配置不会被删除，之前已经读取到的信息也不会被撤回。
              重新连接需要重新授权。
            </p>
            <div className={styles.dialogActions}>
              <button
                className={styles.button}
                data-agent-connections-confirm-cancel
                onClick={() => setPendingDisconnect(null)}
                type="button"
              >
                取消
              </button>
              <button
                className={`${styles.button} ${styles.buttonDanger}`}
                data-agent-connections-confirm-accept={pendingDisconnect.id}
                disabled={busy}
                onClick={() => {
                  const id = pendingDisconnect.id;
                  setPendingDisconnect(null);
                  void post("/api/agent-connections/disconnect", { id });
                }}
                type="button"
              >
                确认断开
              </button>
            </div>
          </div>
        )}
      </dialog>
    </section>
  );
};
