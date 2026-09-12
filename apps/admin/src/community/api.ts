import type {
  CommentModerationAction,
  CommentModerationState,
  ModerationEventAction,
  ModerationEventSubjectKind,
  OperatorCommentKind,
  PublicationPolicy,
} from "@moya/contracts/internal/community-operator";

/**
 * Browser-side helpers for the Owner's moderation workspace. Every call goes
 * to the same-origin Payload endpoints, which hold the operator credential
 * server-side; nothing here knows the Backend or any secret.
 */

export class OperatorFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const messages: Record<string, string> = {
  COMMUNITY_OWNER_ONLY: "此操作仅限 Owner。",
  OPERATOR_NOT_CONFIGURED: "尚未配置社区后端连接，请先设置后再操作。",
  OPERATOR_UNAUTHORIZED: "社区操作凭据无效，请重新配置后端连接。",
  OPERATOR_UNREACHABLE: "无法连接社区后端。",
  OPERATOR_UNAVAILABLE: "社区数据暂时不可用。",
  COMMAND_INVALID: "请求参数无效，未执行任何操作。",
  JSON_BODY_REQUIRED: "请求格式无效，未执行任何操作。",
  NOT_FOUND: "目标已不存在。",
  STATE_CONFLICT: "该项状态已变化（可能已被处理），本次操作未执行。",
  OPERATION_FAILED: "操作未完成，内容不会被自动修改。",
};

/** What the Owner can do next; never a stack trace, SQL or secret. */
const hints: Record<string, string> = {
  STATE_CONFLICT: "请刷新队列后再决定。",
  NOT_FOUND: "请刷新队列。",
  OPERATOR_UNAVAILABLE: "稍后可直接重试。",
  OPERATOR_UNREACHABLE: "请确认后端已启动，然后重试。",
  OPERATOR_NOT_CONFIGURED: "配置完成后刷新页面。",
  OPERATOR_UNAUTHORIZED: "配置完成后刷新页面。",
  COMMAND_INVALID: "请刷新页面后重试。",
  JSON_BODY_REQUIRED: "请刷新页面后重试。",
  OPERATION_FAILED: "可重试一次；若仍失败请刷新页面。",
};

export const failureMessage = (code: string): string =>
  messages[code] ?? messages.OPERATION_FAILED!;

export const failureHint = (code: string): string =>
  hints[code] ?? hints.OPERATION_FAILED!;

export const describeFailure = (
  error: unknown,
): { code: string; text: string } => {
  const code =
    error instanceof OperatorFailure ? error.code : "OPERATION_FAILED";
  return { code, text: `${failureMessage(code)}${failureHint(code)}` };
};

export async function call<Result>(
  name: string,
  input: unknown = {},
  signal?: AbortSignal,
): Promise<Result> {
  let response: Response;
  try {
    response = await fetch(`/api/community-moderation/${name}`, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      ...(signal === undefined ? {} : { signal }),
    });
  } catch (error) {
    if (signal?.aborted === true) throw error;
    throw new OperatorFailure(
      "OPERATOR_UNREACHABLE",
      failureMessage("OPERATOR_UNREACHABLE"),
    );
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new OperatorFailure(
      "OPERATION_FAILED",
      failureMessage("OPERATION_FAILED"),
    );
  }
  if (
    body === null ||
    typeof body !== "object" ||
    !("ok" in body) ||
    body.ok !== true
  ) {
    const code =
      body !== null &&
      typeof body === "object" &&
      "error" in body &&
      body.error !== null &&
      typeof body.error === "object" &&
      "code" in body.error &&
      typeof body.error.code === "string"
        ? body.error.code
        : "OPERATION_FAILED";
    throw new OperatorFailure(code, failureMessage(code));
  }
  return (body as unknown as { result: Result }).result;
}

export const moderationLabels: Record<CommentModerationState, string> = {
  pending: "待审核",
  visible: "已公开",
  hidden: "已隐藏",
};

export const kindLabels: Record<OperatorCommentKind, string> = {
  comment: "根评论",
  reply: "回复",
};

export const actionLabels: Record<ModerationEventAction, string> = {
  approve: "通过并公开",
  reject: "拒绝（未公开）",
  hide: "隐藏",
  unhide: "恢复公开",
  suspend: "停用账号",
  reinstate: "恢复账号",
  set_publication_policy: "切换发布模式",
};

/** Past-tense receipts for a completed comment action. */
export const doneLabels: Record<CommentModerationAction, string> = {
  approve: "已通过并公开",
  reject: "已拒绝，未公开",
  hide: "已隐藏",
  unhide: "已恢复公开",
};

export const subjectKindLabels: Record<ModerationEventSubjectKind, string> = {
  comment: "根评论",
  reply: "回复",
  user: "账号",
  setting: "发布设置",
};

export const policyLabels: Record<PublicationPolicy, string> = {
  DIRECT_PUBLICATION: "直接发布",
  PRE_MODERATION: "先审后发",
};

export const policyDescriptions: Record<PublicationPolicy, string> = {
  DIRECT_PUBLICATION: "新评论与回复通过校验后立即公开；Owner 仍可随时隐藏。",
  PRE_MODERATION: "新评论与回复进入待审核；只有 Owner 通过后才会公开。",
};

/** Which comment actions a stored state allows; nothing else is offered. */
export const applicableActions = (
  state: CommentModerationState,
): readonly CommentModerationAction[] =>
  state === "pending"
    ? ["approve", "reject"]
    : state === "visible"
      ? ["hide"]
      : ["unhide"];

const zone = "Asia/Shanghai";
const human = new Intl.DateTimeFormat("zh-CN", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const precise = new Intl.DateTimeFormat("zh-CN", {
  timeZone: zone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Beijing time, minute precision, the zone always stated once on the page. */
export const formatTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : human.format(date);
};

export const formatPreciseTime = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : `${precise.format(date)}（北京时间，UTC+8）`;
};

export const TIME_ZONE_NOTE = "时间均为北京时间（UTC+8）";

export const excerpt = (text: string, length = 80): string =>
  text.length <= length ? text : `${text.slice(0, length)}…`;

export const shortId = (id: string): string =>
  id.length <= 18 ? id : `${id.slice(0, 12)}…${id.slice(-4)}`;
