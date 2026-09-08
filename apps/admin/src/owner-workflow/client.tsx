"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Gutter, Button } from "@payloadcms/ui";
import type {
  EditorialApprovalResult,
  EditorialMutationResult,
  OwnerDraftPage,
  OwnerDraftSummary,
  OwnerHistoryPage,
} from "@moya/contracts/internal/editorial";

const labels: Record<string, string> = {
  title: "标题",
  summary: "摘要",
  periodLabel: "时代标签",
  dynasty: "朝代",
  dateText: "年代",
  province: "省",
  prefecture: "市",
  county: "县",
  currentLocation: "现址",
  currentCustodian: "保管方",
  description: "简介",
  scriptStyle: "书体",
  transcription: "释文",
  historicalContext: "历史背景",
  scholarlyResearch: "研究",
  aliases: "别名",
  provenance: "内部来源",
  contributors: "作者与书者",
  sourceCitations: "公开引用",
  media: "图片",
  ownerNote: "内部备注",
  catalogId: "目录身份",
  sourceId: "来源身份",
  kind: "类别",
};
const fieldLabels = (fields: string[]) =>
  fields.map((field) => labels[field] ?? "内容").join("、");

const errorMessage = (code: string) =>
  ({
    REVISION_CONFLICT: "记录已被他人修改。请刷新并重新审核当前版本。",
    CONTENT_INVALID: "所选记录仍有缺失或不合法字段，请先完成编辑。",
    APPROVAL_SCOPE_INVALID:
      "所选自动化账号没有全部记录的编辑范围，请在账号页调整授权范围。",
    APPROVAL_ACCOUNT_INVALID: "请选择有效的自动化账号。",
    OWNER_WORKFLOW_ONLY: "此操作仅限 Owner。",
    AUTHORIZATION_REQUIRED: "登录已过期，请重新登录。",
    RESTORE_OWNER_ONLY: "只有 Owner 可以恢复历史版本。",
    CONCURRENT_OPERATION_BUSY: "记录正在保存，请稍后刷新重试。",
  })[code] ?? "操作未完成。请刷新后重试；内容不会被自动覆盖。";

class WorkflowFailure extends Error {}

async function call<T>(name: string, input: unknown): Promise<T> {
  const response = await fetch(`/api/editorial/${name}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  const body: unknown = await response.json();
  if (
    !body ||
    typeof body !== "object" ||
    !("ok" in body) ||
    body.ok !== true
  ) {
    let code = "OPERATION_FAILED";
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "code" in body.error &&
      typeof body.error.code === "string"
    ) {
      code = body.error.code;
    }
    throw new WorkflowFailure(errorMessage(code));
  }
  if (!response.ok || !("result" in body))
    throw new WorkflowFailure(errorMessage("OPERATION_FAILED"));
  return body.result as T;
}

export const OwnerWorkflowClient = () => {
  const [data, setData] = useState<OwnerDraftPage | null>(null);
  const [selected, setSelected] = useState<OwnerDraftSummary[]>([]);
  const [automationId, setAutomationId] = useState("");
  const [history, setHistory] = useState<OwnerHistoryPage | null>(null);
  const [versionId, setVersionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [failure, setFailure] = useState("");

  const load = useCallback(async (page = 1) => {
    setBusy(true);
    setFailure("");
    try {
      const next = await call<OwnerDraftPage>("owner-drafts", {
        page,
        pageSize: 20,
      });
      setData(next);
      setSelected([]);
      setHistory(null);
      setVersionId("");
    } catch (error) {
      setFailure(
        error instanceof WorkflowFailure
          ? error.message
          : errorMessage("OPERATION_FAILED"),
      );
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const approve = async () => {
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      const result = await call<EditorialApprovalResult>("approve-batch", {
        automationUserId: Number(automationId),
        items: selected.map(({ id, revision }) => ({ id, revision })),
      });
      setNotice(
        `已批准批次 #${result.approvalId}，共 ${result.itemCount} 条。自动化可执行这些已审核版本；后续内容变动会使对应批准失效。`,
      );
      setSelected([]);
    } catch (error) {
      setFailure(
        error instanceof WorkflowFailure
          ? error.message
          : errorMessage("OPERATION_FAILED"),
      );
    } finally {
      setBusy(false);
    }
  };

  const loadHistory = async (id: number, page = 1) => {
    setBusy(true);
    setFailure("");
    setVersionId("");
    setHistory(null);
    try {
      setHistory(await call<OwnerHistoryPage>("owner-history", { id, page }));
    } catch (error) {
      setFailure(
        error instanceof WorkflowFailure
          ? error.message
          : errorMessage("OPERATION_FAILED"),
      );
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (!history) return;
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      const result = await call<EditorialMutationResult>("restore-draft", {
        versionId: Number(versionId),
        expectedRevision: history.currentRevision,
      });
      setNotice(
        `已恢复为新草稿，当前版本 ${result.revision}。已发布页面保持原样；请审核恢复内容后再发布。`,
      );
      setHistory(null);
      setVersionId("");
      await load(data?.page ?? 1);
    } catch (error) {
      setFailure(
        error instanceof WorkflowFailure
          ? error.message
          : errorMessage("OPERATION_FAILED"),
      );
    } finally {
      setBusy(false);
    }
  };

  const selectable =
    data?.docs.filter((row) => row.missingFields.length === 0) ?? [];
  const allSelected =
    selectable.length > 0 &&
    selectable.every((row) => selected.some(({ id }) => id === row.id));
  return (
    <Gutter>
      <h1>批次审核与历史恢复</h1>
      <p>
        先查看记录与变更字段，再批准当前所见版本。无图记录可以发布；缺失或不合法字段需先完成编辑。
      </p>
      {notice && <p role="status">{notice}</p>}
      {failure && <p role="alert">{failure}</p>}
      <Button disabled={busy} onClick={() => void load(data?.page ?? 1)}>
        刷新当前版本
      </Button>
      <p>
        {data
          ? `共 ${data.totalDocs} 条记录，第 ${data.page} / ${Math.max(1, data.totalPages)} 页`
          : "正在读取记录…"}
      </p>
      <label>
        <input
          type="checkbox"
          checked={allSelected}
          disabled={busy || selectable.length === 0}
          onChange={(event) =>
            setSelected(event.target.checked ? selectable : [])
          }
        />
        选择本页全部可批准记录
      </label>
      <ul>
        {data?.docs.map((row) => (
          <li key={row.id}>
            <label>
              <input
                type="checkbox"
                aria-label={`选择 ${row.title ?? "未填写标题"}`}
                disabled={busy || row.missingFields.length > 0}
                checked={selected.some(({ id }) => id === row.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, row]
                      : selected.filter(({ id }) => id !== row.id),
                  )
                }
              />
              {row.title ?? "未填写标题"} · 版本 {row.revision} ·{" "}
              {row.status === "published" ? "已发布" : "草稿"}
            </label>
            <p>目录身份：{row.catalogId}</p>
            <p>
              与已发布内容相比：
              {row.changedFields.length
                ? fieldLabels(row.changedFields)
                : "无内容差异"}
            </p>
            {row.missingFields.length > 0 && (
              <p>待补充或修正：{fieldLabels(row.missingFields)}</p>
            )}
            <Link href={`/admin/collections/catalogs/${row.id}`}>
              查看并编辑记录
            </Link>
            {" · "}
            <Link href={`/admin/collections/catalogs/${row.id}/versions`}>
              查看版本差异
            </Link>{" "}
            <Button
              buttonStyle="secondary"
              disabled={busy}
              onClick={() => void loadHistory(row.id)}
            >
              历史恢复
            </Button>
          </li>
        ))}
      </ul>
      <Button
        buttonStyle="secondary"
        disabled={busy || !data || data.page <= 1}
        onClick={() => void load((data?.page ?? 1) - 1)}
      >
        上一页
      </Button>
      <Button
        buttonStyle="secondary"
        disabled={busy || !data || data.page >= data.totalPages}
        onClick={() => void load((data?.page ?? 1) + 1)}
      >
        下一页
      </Button>
      <fieldset disabled={busy}>
        <legend>批准所选批次</legend>
        <label>
          获准执行的自动化账号{" "}
          <select
            value={automationId}
            onChange={(event) => setAutomationId(event.target.value)}
          >
            <option value="">请选择账号</option>
            {data?.automationUsers.map(({ id, label }) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <p>
          已选 {selected.length}{" "}
          条。批准自动绑定当前所见版本，无需填写版本号或校验值。
        </p>
        <Button
          disabled={busy || selected.length === 0 || !automationId}
          onClick={() => void approve()}
        >
          批准所选批次
        </Button>
      </fieldset>
      {history && (
        <fieldset disabled={busy}>
          <legend>恢复历史版本</legend>
          <p>
            <Link href={`/admin/collections/catalogs/${history.id}`}>
              目标记录 #{history.id}
            </Link>
          </p>
          <p>
            当前版本 {history.currentRevision}
            。恢复会生成一个新草稿，不会更改已发布页面。
          </p>
          <label>
            要恢复的历史内容{" "}
            <select
              value={versionId}
              onChange={(event) => setVersionId(event.target.value)}
            >
              <option value="">请选择历史版本</option>
              {history.docs.map((version) => (
                <option key={version.id} value={version.id}>
                  版本 {version.revision} · {version.title ?? "未填写标题"} ·{" "}
                  {version.status === "published" ? "已发布" : "草稿"} ·{" "}
                  {version.createdAt}
                </option>
              ))}
            </select>
          </label>
          <p>
            历史第 {history.page} / {Math.max(1, history.totalPages)} 页
          </p>
          <Button
            buttonStyle="secondary"
            disabled={busy || history.page <= 1}
            onClick={() => void loadHistory(history.id, history.page - 1)}
          >
            较新版本
          </Button>
          <Button
            buttonStyle="secondary"
            disabled={busy || history.page >= history.totalPages}
            onClick={() => void loadHistory(history.id, history.page + 1)}
          >
            较早版本
          </Button>
          <Button disabled={busy || !versionId} onClick={() => void restore()}>
            恢复所选版本为新草稿
          </Button>
          <Button
            buttonStyle="secondary"
            onClick={() => {
              setHistory(null);
              setVersionId("");
            }}
          >
            关闭历史恢复
          </Button>
        </fieldset>
      )}
    </Gutter>
  );
};
