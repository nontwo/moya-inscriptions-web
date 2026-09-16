"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { SetStepNav } from "@payloadcms/ui";

import { TIME_ZONE_NOTE, call, describeFailure, formatTime } from "./api";
import styles from "./community.module.css";

import type {
  AgentDelegation,
  AgentDelegationPage,
  AgentOperation,
  AgentOperationDetail,
  AgentOperationPage,
  AgentOperationState,
  AgentPrincipal,
  AgentPrincipalPage,
  AgentScope,
} from "@moya/contracts/internal/community-operator";

/**
 * Agent Administration V1 (Issue #141 r3, Phase B), the Owner's minimal
 * operations surface: which machine principals exist and what they may do,
 * which bounded delegations are active, and the prepared operations waiting
 * for a decision. Every button is one Owner command with its own request
 * identity; the Backend applies the same rules the MCP tools meet.
 */
const scopes: readonly AgentScope[] = [
  "users:read",
  "content:read",
  "comments:read",
  "comments:moderate",
  "featured:write",
  "operations:execute",
  "operations:undo",
];

const stateLabels: Record<AgentOperationState, string> = {
  prepared: "待批准",
  approved: "已批准",
  executing: "执行中",
  completed: "已完成",
  cancelled: "已取消",
  failed: "已失败",
};

const kindLabels = {
  "comments.moderate": "评论审核",
  "featured.set": "推荐设置",
} as const;

const actionLabels = {
  approve: "通过",
  reject: "拒绝",
  hide: "隐藏",
  unhide: "恢复显示",
} as const;

const describeOperation = (operation: AgentOperation): string =>
  operation.kind === "comments.moderate"
    ? `${kindLabels[operation.kind]}：${operation.action ? actionLabels[operation.action] : ""} ${operation.targetCount} 项`
    : `${kindLabels[operation.kind]}：${operation.targetCount} 项`;

const approvalText = (operation: AgentOperation): string =>
  operation.approval === null
    ? "尚未批准"
    : operation.approval.kind === "owner"
      ? `Owner 批准 · ${formatTime(operation.approval.at)}`
      : `委托自动批准 · ${formatTime(operation.approval.at)}`;

const progressText = (operation: AgentOperation): string =>
  `${operation.nextIndex}/${operation.targetCount} · 已应用 ${operation.tally.applied} · 冲突 ${operation.tally.conflicts} · 不存在 ${operation.tally.notFound} · 失败 ${operation.tally.failed} · 取消 ${operation.tally.cancelled}`;

type Busy = { readonly id: string; readonly action: string } | null;

export const AgentOperationsClient = () => {
  const [principals, setPrincipals] = useState<AgentPrincipal[]>([]);
  const [delegations, setDelegations] = useState<AgentDelegation[]>([]);
  const [operations, setOperations] = useState<AgentOperationPage | null>(null);
  const [detail, setDetail] = useState<AgentOperationDetail | null>(null);
  const [stateFilter, setStateFilter] = useState<AgentOperationState | "all">(
    "all",
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const sequence = useRef(0);

  // Principal form
  const [label, setLabel] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<AgentScope>>(
    new Set(),
  );
  // Delegation form
  const [delegationPrincipal, setDelegationPrincipal] = useState("");
  const [delegationKind, setDelegationKind] =
    useState<keyof typeof kindLabels>("comments.moderate");
  const [delegationMax, setDelegationMax] = useState("50");
  const [delegationHours, setDelegationHours] = useState("24");

  const load = useCallback(async () => {
    const current = (sequence.current += 1);
    try {
      const [principalPage, delegationPage, operationPage] = await Promise.all([
        call<AgentPrincipalPage>("agent-principals-read", {}),
        call<AgentDelegationPage>("agent-delegations-read", {
          includeInactive: false,
        }),
        call<AgentOperationPage>("agent-operations-read", {
          ...(stateFilter === "all" ? {} : { state: stateFilter }),
          page: 1,
          pageSize: 50,
        }),
      ]);
      if (current !== sequence.current) return;
      setPrincipals(principalPage.items);
      setDelegations(delegationPage.items);
      setOperations(operationPage);
      setError(null);
    } catch (failure) {
      if (current !== sequence.current) return;
      setError(describeFailure(failure).text);
    }
  }, [stateFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const command = async (
    id: string,
    action: string,
    run: () => Promise<unknown>,
    done: string,
  ) => {
    if (busy !== null) return;
    setBusy({ id, action });
    setNotice(null);
    try {
      await run();
      setNotice(done);
      await load();
    } catch (failure) {
      setError(describeFailure(failure).text);
    } finally {
      setBusy(null);
    }
  };

  const writePrincipal = () =>
    command(
      "principal",
      "write",
      async () => {
        const existing = principals.find((p) => p.label === label);
        await call<AgentPrincipal>("agent-principal-write", {
          requestId: crypto.randomUUID(),
          label,
          displayName: displayName || label,
          scopes: [...selectedScopes],
          enabled: true,
          expectedVersion: existing?.version ?? 0,
        });
      },
      "代理主体已保存。",
    );

  const setPrincipalEnabled = (principal: AgentPrincipal, enabled: boolean) =>
    command(
      principal.label,
      "enable",
      () =>
        call<AgentPrincipal>("agent-principal-write", {
          requestId: crypto.randomUUID(),
          label: principal.label,
          displayName: principal.displayName,
          scopes: principal.scopes,
          enabled,
          expectedVersion: principal.version,
        }),
      enabled ? "代理主体已启用。" : "代理主体已停用。",
    );

  const revokePrincipal = (principal: AgentPrincipal) =>
    command(
      principal.label,
      "revoke",
      () =>
        call<AgentPrincipal>("agent-principal-revoke", {
          requestId: crypto.randomUUID(),
          label: principal.label,
          expectedVersion: principal.version,
        }),
      "代理主体已撤销（不可恢复）。",
    );

  const createDelegation = () =>
    command(
      "delegation",
      "create",
      () =>
        call<AgentDelegation>("agent-delegation-create", {
          requestId: crypto.randomUUID(),
          principal: delegationPrincipal,
          kind: delegationKind,
          maxTargets: Number(delegationMax),
          expiresAt: new Date(
            Date.now() + Number(delegationHours) * 60 * 60 * 1000,
          ).toISOString(),
        }),
      "委托已创建。",
    );

  const revokeDelegation = (delegation: AgentDelegation) =>
    command(
      delegation.id,
      "revoke",
      () =>
        call<AgentDelegation>("agent-delegation-revoke", {
          requestId: crypto.randomUUID(),
          id: delegation.id,
        }),
      "委托已撤销。",
    );

  const operationCommand = (
    operation: AgentOperation,
    name:
      | "agent-operation-approve"
      | "agent-operation-cancel"
      | "agent-operation-execute",
    done: string,
  ) =>
    command(
      operation.id,
      name,
      () =>
        call(name, {
          requestId: crypto.randomUUID(),
          operationId: operation.id,
        }),
      done,
    );

  const openDetail = async (operation: AgentOperation) => {
    try {
      setDetail(
        await call<AgentOperationDetail>("agent-operation-read", {
          operationId: operation.id,
        }),
      );
    } catch (failure) {
      setError(describeFailure(failure).text);
    }
  };

  return (
    <div className={styles.workspace} data-agent-operations>
      <SetStepNav
        nav={[
          { label: "社区", url: "/admin/community-moderation" },
          { label: "代理操作" },
        ]}
      />
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>代理操作</h1>
          <p className={styles.lead}>
            机器主体只能对其明确列出的对象准备操作；由您批准，或在有效委托范围内自动批准；
            执行按 50 项分块持久记录，可取消，可有条件撤销。{TIME_ZONE_NOTE}。{" "}
            <Link href="/admin/community-moderation">返回审核队列</Link>
          </p>
        </div>
      </header>

      {error === null ? null : (
        <p className={styles.notice} data-tone="error" role="alert">
          {error}
        </p>
      )}
      {notice === null ? null : (
        <p className={styles.notice} data-tone="success" role="status">
          {notice}
        </p>
      )}

      <section
        className={styles.panel}
        aria-labelledby="agent-operations-title"
      >
        <div className={styles.panelHeader}>
          <h2 id="agent-operations-title">待处理与历史操作</h2>
          <label>
            状态
            <select
              onChange={(event) =>
                setStateFilter(
                  event.currentTarget.value as AgentOperationState | "all",
                )
              }
              value={stateFilter}
            >
              <option value="all">全部</option>
              {(Object.keys(stateLabels) as AgentOperationState[]).map((s) => (
                <option key={s} value={s}>
                  {stateLabels[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>操作</th>
                <th>主体</th>
                <th>状态</th>
                <th>批准</th>
                <th>进度</th>
                <th>创建时间</th>
                <th>决定</th>
              </tr>
            </thead>
            <tbody>
              {operations === null || operations.items.length === 0 ? (
                <tr>
                  <td colSpan={7}>暂无代理操作。</td>
                </tr>
              ) : (
                operations.items.map((operation) => (
                  <tr
                    data-busy={busy?.id === operation.id ? "true" : undefined}
                    data-operation-id={operation.id}
                    key={operation.id}
                  >
                    <td>
                      <button
                        className={styles.rowLink}
                        onClick={() => void openDetail(operation)}
                        type="button"
                      >
                        {describeOperation(operation)}
                      </button>
                      {operation.undoOf === null ? null : (
                        <span className={styles.summaryLine}>（撤销操作）</span>
                      )}
                    </td>
                    <td className={styles.mono}>{operation.principal}</td>
                    <td>
                      <span
                        className={styles.state}
                        data-state={operation.state}
                      >
                        {stateLabels[operation.state]}
                      </span>
                    </td>
                    <td>{approvalText(operation)}</td>
                    <td>{progressText(operation)}</td>
                    <td>{formatTime(operation.createdAt)}</td>
                    <td className={styles.actions}>
                      {operation.state === "prepared" ? (
                        <button
                          className={styles.actionButton}
                          data-primary="true"
                          disabled={busy !== null}
                          onClick={() =>
                            void operationCommand(
                              operation,
                              "agent-operation-approve",
                              "操作已批准，等待执行。",
                            )
                          }
                          type="button"
                        >
                          批准
                        </button>
                      ) : null}
                      {operation.state === "approved" ||
                      operation.state === "executing" ? (
                        <button
                          className={styles.actionButton}
                          disabled={busy !== null || operation.leaseHeld}
                          onClick={() =>
                            void operationCommand(
                              operation,
                              "agent-operation-execute",
                              "已执行一轮，查看进度。",
                            )
                          }
                          type="button"
                        >
                          立即执行
                        </button>
                      ) : null}
                      {operation.state === "prepared" ||
                      operation.state === "approved" ||
                      operation.state === "executing" ? (
                        <button
                          className={styles.actionButton}
                          data-danger="true"
                          disabled={busy !== null}
                          onClick={() =>
                            void operationCommand(
                              operation,
                              "agent-operation-cancel",
                              "已请求取消。",
                            )
                          }
                          type="button"
                        >
                          取消
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {detail === null ? null : (
          <div className={styles.card} data-operation-detail>
            <h3>
              操作详情 <span className={styles.mono}>{detail.id}</span>
            </h3>
            <p>
              {describeOperation(detail)} · {stateLabels[detail.state]} ·{" "}
              {approvalText(detail)}
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>对象</th>
                    <th>准备时状态</th>
                    <th>结果</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.targets.map((target, index) => {
                    const result = detail.results.find(
                      (r) => r.index === index,
                    );
                    const id =
                      "id" in target
                        ? target.id
                        : `${target.target.type}:${target.target.id}`;
                    const prior =
                      "id" in target
                        ? (target.prior ?? "不存在")
                        : target.prior === null
                          ? "无推荐行"
                          : `${target.prior.enabled ? "启用" : "停用"} @${target.prior.position} v${target.prior.version}`;
                    return (
                      <tr key={id}>
                        <td>{index}</td>
                        <td className={styles.mono}>{id}</td>
                        <td>{prior}</td>
                        <td>
                          {result === undefined
                            ? "未处理"
                            : `${result.outcome}${result.detail ? ` (${result.detail})` : ""}`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <button
              className={styles.secondary}
              onClick={() => setDetail(null)}
              type="button"
            >
              关闭详情
            </button>
          </div>
        )}
      </section>

      <section
        className={styles.panel}
        aria-labelledby="agent-principals-title"
      >
        <div className={styles.panelHeader}>
          <h2 id="agent-principals-title">代理主体</h2>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>标签</th>
                <th>名称</th>
                <th>权限范围</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {principals.length === 0 ? (
                <tr>
                  <td colSpan={5}>尚无代理主体。</td>
                </tr>
              ) : (
                principals.map((principal) => (
                  <tr data-principal={principal.label} key={principal.label}>
                    <td className={styles.mono}>{principal.label}</td>
                    <td>{principal.displayName}</td>
                    <td>{principal.scopes.join(", ") || "（无）"}</td>
                    <td>
                      {principal.revokedAt !== null
                        ? "已撤销"
                        : principal.enabled
                          ? "启用"
                          : "停用"}
                    </td>
                    <td className={styles.actions}>
                      {principal.revokedAt === null ? (
                        <>
                          <button
                            className={styles.actionButton}
                            disabled={busy !== null}
                            onClick={() =>
                              void setPrincipalEnabled(
                                principal,
                                !principal.enabled,
                              )
                            }
                            type="button"
                          >
                            {principal.enabled ? "停用" : "启用"}
                          </button>
                          <button
                            className={styles.actionButton}
                            data-danger="true"
                            disabled={busy !== null}
                            onClick={() => void revokePrincipal(principal)}
                            type="button"
                          >
                            撤销
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <fieldset className={styles.fieldset}>
          <legend>新建或更新代理主体</legend>
          <label>
            标签（agent-…）
            <input
              onChange={(event) => setLabel(event.currentTarget.value.trim())}
              pattern="^agent-[a-z0-9-]{2,57}$"
              value={label}
            />
          </label>
          <label>
            名称
            <input
              maxLength={80}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
              value={displayName}
            />
          </label>
          <div>
            {scopes.map((scope) => (
              <label key={scope}>
                <input
                  checked={selectedScopes.has(scope)}
                  onChange={(event) =>
                    setSelectedScopes((current) => {
                      const next = new Set(current);
                      if (event.currentTarget.checked) next.add(scope);
                      else next.delete(scope);
                      return next;
                    })
                  }
                  type="checkbox"
                />{" "}
                {scope}
              </label>
            ))}
          </div>
          <button
            className={styles.actionButton}
            data-primary="true"
            disabled={busy !== null || !/^agent-[a-z0-9-]{2,57}$/u.test(label)}
            onClick={() => void writePrincipal()}
            type="button"
          >
            保存主体
          </button>
        </fieldset>
      </section>

      <section
        className={styles.panel}
        aria-labelledby="agent-delegations-title"
      >
        <div className={styles.panelHeader}>
          <h2 id="agent-delegations-title">有效委托</h2>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>主体</th>
                <th>操作种类</th>
                <th>单次上限</th>
                <th>到期</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {delegations.length === 0 ? (
                <tr>
                  <td colSpan={5}>没有有效委托；每个操作都需要您批准。</td>
                </tr>
              ) : (
                delegations.map((delegation) => (
                  <tr data-delegation={delegation.id} key={delegation.id}>
                    <td className={styles.mono}>{delegation.principal}</td>
                    <td>{kindLabels[delegation.kind]}</td>
                    <td>{delegation.maxTargets}</td>
                    <td>{formatTime(delegation.expiresAt)}</td>
                    <td className={styles.actions}>
                      <button
                        className={styles.actionButton}
                        data-danger="true"
                        disabled={busy !== null}
                        onClick={() => void revokeDelegation(delegation)}
                        type="button"
                      >
                        撤销
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <fieldset className={styles.fieldset}>
          <legend>新建委托（有界、可撤销、到期即失效）</legend>
          <label>
            主体
            <select
              onChange={(event) =>
                setDelegationPrincipal(event.currentTarget.value)
              }
              value={delegationPrincipal}
            >
              <option value="">请选择</option>
              {principals
                .filter((p) => p.revokedAt === null)
                .map((p) => (
                  <option key={p.label} value={p.label}>
                    {p.label}
                  </option>
                ))}
            </select>
          </label>
          <label>
            操作种类
            <select
              onChange={(event) =>
                setDelegationKind(
                  event.currentTarget.value as keyof typeof kindLabels,
                )
              }
              value={delegationKind}
            >
              {(Object.keys(kindLabels) as (keyof typeof kindLabels)[]).map(
                (kind) => (
                  <option key={kind} value={kind}>
                    {kindLabels[kind]}
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            单次目标上限（1–500）
            <input
              inputMode="numeric"
              max={500}
              min={1}
              onChange={(event) => setDelegationMax(event.currentTarget.value)}
              type="number"
              value={delegationMax}
            />
          </label>
          <label>
            有效小时数
            <input
              inputMode="numeric"
              max={720}
              min={1}
              onChange={(event) =>
                setDelegationHours(event.currentTarget.value)
              }
              type="number"
              value={delegationHours}
            />
          </label>
          <button
            className={styles.actionButton}
            data-primary="true"
            disabled={
              busy !== null ||
              delegationPrincipal === "" ||
              !(Number(delegationMax) >= 1 && Number(delegationMax) <= 500) ||
              !(Number(delegationHours) >= 1)
            }
            onClick={() => void createDelegation()}
            type="button"
          >
            创建委托
          </button>
        </fieldset>
      </section>
    </div>
  );
};
