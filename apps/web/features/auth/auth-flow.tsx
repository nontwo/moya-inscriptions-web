"use client";

import { useEffect, useId, useRef, useState } from "react";

import { authRequest, safeReturnPath } from "./auth-api";
import type { AuthCapabilitiesView } from "./auth-api";

import styles from "./auth-flow.module.css";

type Channel = "email" | "phone";
type Step = "identifier" | "code" | "profile";

const reasons: Record<string, string> = {
  AUTH_CHANNEL_UNAVAILABLE: "这个登录方式当前不可用。",
  AUTH_INVALID_IDENTIFIER: "请检查邮箱或手机号格式。",
  AUTH_INVALID_DISPLAY_NAME: "昵称需要 1 到 40 个字符。",
  AUTH_AGREEMENT_REQUIRED: "请先确认注册说明。",
  AUTH_RATE_LIMITED: "发送过于频繁，请稍后再试。",
  AUTH_CODE_EXHAUSTED: "尝试次数已用完，请稍后再试。",
  AUTH_CODE_INVALID: "验证码不正确。",
  AUTH_CODE_EXPIRED: "验证码已过期，请重新获取。",
  AUTH_CODE_SUPERSEDED: "这是较早的验证码，请使用最新的一封。",
  AUTH_PROOF_REJECTED: "这次验证已失效，请重新开始。",
  AUTH_IDENTIFIER_CONFLICT: "这个联系方式无法绑定到当前账户。",
  AUTH_LAST_FACTOR: "至少需要保留一种可用的登录方式。",
  AUTH_STALE_VERSION: "账户信息已变化，请刷新后再试。",
  AUTH_ACCOUNT_SUSPENDED: "这个账户已停用。",
  AUTH_UNAUTHENTICATED: "请重新登录。",
  AUTH_DELIVERY_FAILED: "验证消息没有发出，请稍后重试。",
  AUTH_DELIVERY_UNKNOWN: "发送结果不确定，请稍后再试，不要立刻重复提交。",
  AUTH_PROVENANCE_REJECTED: "这条验证记录不能在当前环境使用。",
  AUTH_NOT_CONFIGURED: "登录服务暂时不可用。",
};

const messageOf = (body: unknown): string => {
  if (typeof body !== "object" || body === null || !("error" in body))
    return "请求失败，请稍后重试。";
  const error = body.error;
  if (typeof error !== "object" || error === null || !("message" in error))
    return "请求失败，请稍后重试。";
  return reasons[String(error.message)] ?? "请求失败，请稍后重试。";
};

const newKey = () => crypto.randomUUID();

export const AuthFlow = ({
  mode,
  returnTo,
}: {
  readonly mode: "sign-in" | "register";
  readonly returnTo: string;
}) => {
  const titleId = useId();
  const codeRef = useRef<HTMLInputElement>(null);
  const flow = useRef(0);
  const [capabilities, setCapabilities] = useState<AuthCapabilitiesView | null>(
    null,
  );
  const [channel, setChannel] = useState<Channel>("email");
  const [step, setStep] = useState<Step>(
    mode === "register" ? "identifier" : "identifier",
  );
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [challengeId, setChallengeId] = useState("");
  const [continuation, setContinuation] = useState("");
  const [handoff, setHandoff] = useState("");
  const [masked, setMasked] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const destination = safeReturnPath(returnTo);

  useEffect(() => {
    const current = flow.current;
    void authRequest("capabilities").then((result) => {
      if (current !== flow.current) return;
      if (
        result.status === 200 &&
        typeof result.body === "object" &&
        result.body !== null
      )
        setCapabilities(result.body as AuthCapabilitiesView);
    });
  }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  const phoneAvailable = capabilities?.phone.available === true;
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const purpose =
    mode === "register" || step === "profile" ? "register" : "sign_in";

  const send = async () => {
    const current = ++flow.current;
    setBusy(true);
    setError("");
    const result = await authRequest("challenges", {
      body: {
        channel,
        purpose:
          step === "profile"
            ? "register"
            : mode === "register"
              ? "register"
              : "sign_in",
        identifier,
        idempotencyKey: newKey(),
      },
    });
    if (current !== flow.current) return;
    setBusy(false);
    if (
      result.status !== 200 ||
      typeof result.body !== "object" ||
      result.body === null
    ) {
      setError(messageOf(result.body));
      return;
    }
    const body = result.body as {
      challengeId?: string;
      maskedTarget?: string;
      resendAvailableAt?: string;
      continuationToken?: string;
    };
    setChallengeId(body.challengeId ?? "");
    setMasked(body.maskedTarget ?? "");
    if (body.continuationToken) setContinuation(body.continuationToken);
    setResendAt(
      body.resendAvailableAt
        ? Date.parse(body.resendAvailableAt)
        : Date.now() + 60_000,
    );
    setStep("code");
    setCode("");
  };

  const verify = async () => {
    const current = ++flow.current;
    setBusy(true);
    setError("");
    const result = await authRequest("challenges/verify", {
      body: {
        challengeId,
        code,
        continuationToken: continuation,
        idempotencyKey: newKey(),
      },
    });
    if (current !== flow.current) return;
    setBusy(false);
    if (
      result.status !== 200 ||
      typeof result.body !== "object" ||
      result.body === null
    ) {
      setError(messageOf(result.body));
      return;
    }
    const body = result.body as {
      outcome?: string;
      handoffToken?: string;
    };
    setCode("");
    if (body.outcome === "signed_in" || body.outcome === "registered") {
      window.location.assign(destination);
      return;
    }
    if (body.outcome === "registration_required" && body.handoffToken) {
      setHandoff(body.handoffToken);
      setStep("profile");
      return;
    }
    if (body.outcome === "already_registered") {
      window.location.assign(
        `/login?return=${encodeURIComponent(destination)}`,
      );
      return;
    }
    setError("这次验证不能继续，请重新开始。");
  };

  const confirm = async () => {
    const current = ++flow.current;
    setBusy(true);
    setError("");
    const result = await authRequest("registrations", {
      body: {
        handoffToken: handoff,
        displayName,
        agreement: true,
        idempotencyKey: newKey(),
      },
    });
    if (current !== flow.current) return;
    setBusy(false);
    if (result.status !== 201) {
      setError(messageOf(result.body));
      return;
    }
    setCode("");
    setHandoff("");
    window.location.assign(destination);
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href={destination}>返回</a>
        <h1 id={titleId}>{mode === "register" ? "注册" : "登录"}</h1>
      </header>
      <p className={styles.muted}>
        由于艺 /
        ArtVenn。邮箱是主要登录方式。验证码不会显示在页面响应里，请到本地收件箱查看。
      </p>
      {capabilities?.developmentOnly ? (
        <p className={styles.notice}>这是开发环境登录，不是实名认证。</p>
      ) : null}
      <form
        className={styles.form}
        aria-labelledby={titleId}
        onSubmit={(event) => {
          event.preventDefault();
          if (step === "identifier") void send();
          else if (step === "code") void verify();
          else if (agreed) void confirm();
          else setError(reasons.AUTH_AGREEMENT_REQUIRED ?? "");
        }}
      >
        <div className={styles.channels} role="group" aria-label="登录方式">
          <button
            type="button"
            aria-pressed={channel === "email"}
            onClick={() => setChannel("email")}
          >
            邮箱
          </button>
          <button
            type="button"
            aria-pressed={channel === "phone"}
            disabled={!phoneAvailable}
            onClick={() => phoneAvailable && setChannel("phone")}
          >
            手机
          </button>
        </div>
        {!phoneAvailable && capabilities !== null ? (
          <p className={styles.muted}>手机登录当前不可用。</p>
        ) : null}
        {step === "identifier" ? (
          <label className={styles.field}>
            {channel === "email" ? "邮箱" : "手机号"}
            <input
              autoComplete={channel === "email" ? "email" : "tel"}
              inputMode={channel === "email" ? "email" : "tel"}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              required
            />
          </label>
        ) : null}
        {step === "code" ? (
          <>
            <p>
              验证码已发往 {masked}。
              <button type="button" onClick={() => setStep("identifier")}>
                修改
              </button>
            </p>
            <label className={styles.field}>
              验证码
              <input
                ref={codeRef}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                value={code}
                onPaste={(event) => {
                  const digits = event.clipboardData
                    .getData("text")
                    .replace(/\D/gu, "")
                    .slice(0, 6);
                  if (digits.length === 0) return;
                  event.preventDefault();
                  setCode(digits);
                }}
                onChange={(event) =>
                  setCode(event.target.value.replace(/\D/gu, "").slice(0, 6))
                }
                required
              />
            </label>
          </>
        ) : null}
        {step === "profile" ? (
          <>
            <p>
              这个{channel === "email" ? "邮箱" : "手机号"}
              还没有账户。确认昵称和说明后才会创建。
            </p>
            <label className={styles.field}>
              昵称
              <input
                value={displayName}
                maxLength={40}
                onChange={(event) => setDisplayName(event.target.value)}
                required
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(event) => setAgreed(event.target.checked)}
              />
              我已阅读
              <a href="/login/agreements">开发环境注册说明</a>
            </label>
          </>
        ) : null}
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actions}>
          {step === "code" ? (
            <button
              type="button"
              disabled={busy || remaining > 0}
              onClick={() => void send()}
            >
              {remaining > 0 ? `${remaining} 秒后可重发` : "重新发送"}
            </button>
          ) : null}
          <button
            className="yoyi-button"
            type="submit"
            disabled={busy || (step === "profile" && !agreed)}
          >
            {busy
              ? "处理中"
              : step === "profile"
                ? "创建账户"
                : step === "code"
                  ? "继续"
                  : "发送验证码"}
          </button>
          <a href={destination}>取消</a>
        </div>
      </form>
      <div className={styles.links}>
        {mode === "register" ? (
          <a href={`/login?return=${encodeURIComponent(destination)}`}>
            已有账户，去登录
          </a>
        ) : (
          <a href={`/register?return=${encodeURIComponent(destination)}`}>
            没有账户，去注册
          </a>
        )}
        <a href="/dev/community">开发测试账号</a>
        <p className={styles.muted}>
          当前目的：{purpose === "register" ? "注册" : "登录"}
          。登录后不会自动发布内容。
        </p>
      </div>
    </main>
  );
};
