"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Gutter } from "@payloadcms/ui";
import type {
  CommentModerationState,
  ModerationResult,
  OperatorComment,
  OperatorCommentPage,
  PublicationPolicy,
  PublicationPolicyState,
  UserModerationResult,
} from "@moya/contracts/internal/community-operator";

const errorMessage = (code: string) =>
  ({
    COMMUNITY_OWNER_ONLY: "此操作仅限 Owner。",
    OPERATOR_NOT_CONFIGURED: "尚未配置社区操作凭据，请先设置后端连接。",
    OPERATOR_UNAUTHORIZED: "社区操作凭据无效，请重新配置。",
    OPERATOR_UNREACHABLE: "无法连接后端，请稍后重试。",
    COMMAND_INVALID: "操作参数无效。",
    JSON_BODY_REQUIRED: "请求格式无效。",
    NOT_FOUND: "目标已不存在，请刷新。",
  })[code] ?? "操作未完成，请刷新后重试；内容不会被自动修改。";

class OperatorFailure extends Error {}

async function call<T>(name: string, input: unknown = {}): Promise<T> {
  const response = await fetch(`/api/community-moderation/${name}`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = (await response.json()) as
    { ok: true; result: T } | { ok: false; error: { code: string } };
  if (!payload.ok) throw new OperatorFailure(errorMessage(payload.error.code));
  return payload.result;
}

const moderationLabels: Record<CommentModerationState, string> = {
  pending: "待审核",
  visible: "已公开",
  hidden: "已隐藏",
};

const policyLabels: Record<PublicationPolicy, string> = {
  PRE_MODERATION: "先审后发（新评论进入待审核）",
  DIRECT_PUBLICATION: "直接发布（通过校验后立即公开）",
};

const filters: readonly (CommentModerationState | "all")[] = [
  "pending",
  "visible",
  "hidden",
  "all",
];

const filterLabels: Record<string, string> = {
  pending: "待审核",
  visible: "已公开",
  hidden: "已隐藏",
  all: "全部",
};

export const CommunityModerationClient = () => {
  const [policy, setPolicy] = useState<PublicationPolicyState | null>(null);
  const [page, setPage] = useState<OperatorCommentPage | null>(null);
  const [filter, setFilter] = useState<CommentModerationState | "all">(
    "pending",
  );
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async (next: CommentModerationState | "all") => {
    setBusy(true);
    try {
      const [policyState, comments] = await Promise.all([
        call<PublicationPolicyState>("read-policy"),
        call<OperatorCommentPage>("read-comments", {
          ...(next === "all" ? {} : { moderation: next }),
        }),
      ]);
      setPolicy(policyState);
      setPage(comments);
      setMessage(null);
    } catch (error) {
      setMessage(
        error instanceof OperatorFailure ? error.message : errorMessage(""),
      );
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  const switchPolicy = async (next: PublicationPolicy) => {
    setBusy(true);
    try {
      setPolicy(
        await call<PublicationPolicyState>("set-policy", { policy: next }),
      );
      setMessage("发布策略已更新，仅影响此后的新评论。");
    } catch (error) {
      setMessage(
        error instanceof OperatorFailure ? error.message : errorMessage(""),
      );
    } finally {
      setBusy(false);
    }
  };

  const moderate = async (
    comment: OperatorComment,
    action: "approve" | "hide" | "unhide",
  ) => {
    setBusy(true);
    try {
      await call<ModerationResult>("moderate-comment", {
        id: comment.id,
        action,
      });
      await load(filter);
    } catch (error) {
      setMessage(
        error instanceof OperatorFailure ? error.message : errorMessage(""),
      );
      setBusy(false);
    }
  };

  const moderateAuthor = async (
    comment: OperatorComment,
    action: "suspend" | "reinstate",
  ) => {
    setBusy(true);
    try {
      const result = await call<UserModerationResult>("moderate-user", {
        id: comment.author.id,
        action,
      });
      setMessage(
        action === "suspend"
          ? `已停用该账号并撤销 ${result.revokedSessions} 个会话；既有评论状态不变。`
          : "已恢复该账号。",
      );
      await load(filter);
    } catch (error) {
      setMessage(
        error instanceof OperatorFailure ? error.message : errorMessage(""),
      );
      setBusy(false);
    }
  };

  return (
    <Gutter>
      <h1>社区评论与发布策略</h1>
      <section aria-labelledby="community-policy">
        <h2 id="community-policy">发布策略</h2>
        <p>
          当前：
          {policy === null ? "读取中…" : policyLabels[policy.policy]}
          {policy === null
            ? null
            : `（${policy.updatedBy} 于 ${policy.updatedAt}）`}
        </p>
        <p>
          切换只影响此后的新评论：已待审核、已公开、已隐藏的内容都不会被批量改变。
        </p>
        {(["PRE_MODERATION", "DIRECT_PUBLICATION"] as const).map((option) => (
          <Button
            key={option}
            disabled={busy || policy?.policy === option}
            onClick={() => void switchPolicy(option)}
          >
            {policyLabels[option]}
          </Button>
        ))}
      </section>

      <section aria-labelledby="community-comments">
        <h2 id="community-comments">评论</h2>
        <div role="group" aria-label="筛选">
          {filters.map((option) => (
            <Button
              key={option}
              disabled={busy || filter === option}
              onClick={() => {
                setFilter(option);
              }}
            >
              {filterLabels[option]}
            </Button>
          ))}
        </div>
        {message === null ? null : <p role="status">{message}</p>}
        {page === null ? (
          <p>读取中…</p>
        ) : page.items.length === 0 ? (
          <p>没有符合条件的评论。</p>
        ) : (
          <ol>
            {page.items.map((comment) => (
              <li key={comment.id}>
                <p>
                  <strong>{comment.author.displayName}</strong>（@
                  {comment.author.handle}
                  {comment.author.status === "suspended"
                    ? "，已停用"
                    : ""}）· {comment.kind === "reply" ? "回复" : "评论"} ·{" "}
                  {moderationLabels[comment.moderation]} · {comment.createdAt}
                </p>
                <p>{comment.text}</p>
                <p>目录记录：{comment.catalogId}</p>
                {comment.moderation === "pending" ? (
                  <Button
                    disabled={busy}
                    onClick={() => void moderate(comment, "approve")}
                  >
                    通过并公开
                  </Button>
                ) : null}
                {comment.moderation === "visible" ? (
                  <Button
                    disabled={busy}
                    onClick={() => void moderate(comment, "hide")}
                  >
                    隐藏
                  </Button>
                ) : null}
                {comment.moderation === "hidden" ? (
                  <Button
                    disabled={busy}
                    onClick={() => void moderate(comment, "unhide")}
                  >
                    取消隐藏
                  </Button>
                ) : null}
                <Button
                  disabled={busy}
                  onClick={() =>
                    void moderateAuthor(
                      comment,
                      comment.author.status === "suspended"
                        ? "reinstate"
                        : "suspend",
                    )
                  }
                >
                  {comment.author.status === "suspended"
                    ? "恢复账号"
                    : "停用账号"}
                </Button>
              </li>
            ))}
          </ol>
        )}
        {page === null ? null : (
          <p>
            第 {page.page} / {page.totalPages} 页，共 {page.total} 条。
          </p>
        )}
      </section>
    </Gutter>
  );
};
