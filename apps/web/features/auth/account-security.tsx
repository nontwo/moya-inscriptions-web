"use client";

import { useEffect, useRef, useState } from "react";

import { authRequest } from "./auth-api";
import type { AuthAccountView } from "./auth-api";

import styles from "./auth-flow.module.css";

type Channel = "email" | "phone";
type Action = "link" | "replace" | "unlink";
type Step = "proof" | "identifier" | "factor";

interface FactorFlow {
  readonly action: Action;
  readonly target: Channel;
  readonly proof: Channel;
  readonly step: Step;
  readonly challengeId: string;
  readonly continuation: string;
  readonly reauthToken: string;
  readonly expectedVersion: number;
  readonly masked: string;
}

const labels = { email: "邮箱", phone: "手机号" } as const;
const states = {
  unbound: "未绑定",
  verified: "已验证",
  unavailable: "当前不可用",
  pending: "操作进行中",
} as const;
const reasons: Record<string, string> = {
  AUTH_CHANNEL_UNAVAILABLE: "这个登录方式当前不可用。",
  AUTH_INVALID_IDENTIFIER: "请检查邮箱或手机号格式。",
  AUTH_CODE_EXHAUSTED: "尝试次数已用完，请稍后再试。",
  AUTH_CODE_INVALID: "验证码不正确。",
  AUTH_CODE_EXPIRED: "验证码已过期，请重新获取。",
  AUTH_CODE_SUPERSEDED: "这是较早的验证码，请使用最新的一封。",
  AUTH_PROOF_REJECTED: "这次验证已失效，请重新开始。",
  AUTH_IDENTIFIER_CONFLICT: "这个联系方式无法绑定到当前账户。",
  AUTH_LAST_FACTOR: "至少需要保留一种可用的登录方式。",
  AUTH_STALE_VERSION: "账户信息已变化，请刷新后再试。",
  AUTH_UNAUTHENTICATED: "请重新登录。",
  AUTH_DELIVERY_FAILED: "验证消息没有发出，请稍后重试。",
  AUTH_DELIVERY_UNKNOWN: "发送结果不确定，请稍后再试，不要立刻重复提交。",
  AUTH_PROVENANCE_REJECTED: "这条验证记录不能在当前环境使用。",
};

const messageOf = (body: unknown): string => {
  if (typeof body !== "object" || body === null || !("error" in body))
    return "请求失败，请稍后重试。";
  const error = body.error;
  if (typeof error !== "object" || error === null || !("message" in error))
    return "请求失败，请稍后重试。";
  return reasons[String(error.message)] ?? "请求失败，请稍后重试。";
};

const digits = (value: string): string => value.replace(/\D/gu, "").slice(0, 6);

const proofFor = (
  account: AuthAccountView,
  target: Channel,
): Channel | null => {
  const other: Channel = target === "email" ? "phone" : "email";
  if (account[other].usable) return other;
  if (account[target].usable) return target;
  return null;
};

const emptyFlow = (
  action: Action,
  target: Channel,
  proof: Channel,
  expectedVersion: number,
): FactorFlow => ({
  action,
  target,
  proof,
  step: "proof",
  challengeId: "",
  continuation: "",
  reauthToken: "",
  expectedVersion,
  masked: "",
});

export const AccountSecurity = () => {
  const generation = useRef(0);
  const [account, setAccount] = useState<AuthAccountView | null>(null);
  const [note, setNote] = useState("");
  const [flow, setFlow] = useState<FactorFlow | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    const current = ++generation.current;
    void authRequest("account")
      .then((result) => {
        if (current !== generation.current) return;
        if (
          result.status === 200 &&
          typeof result.body === "object" &&
          result.body !== null &&
          "userId" in result.body
        )
          setAccount(result.body as AuthAccountView);
        else setNote("登录方式暂未开放，或当前没有可用会话。");
      })
      .catch(() => {
        if (current === generation.current)
          setNote("登录方式暂未开放，或当前没有可用会话。");
      });
  };

  useEffect(() => {
    const current = ++generation.current;
    void authRequest("account")
      .then((result) => {
        if (current !== generation.current) return;
        if (
          result.status === 200 &&
          typeof result.body === "object" &&
          result.body !== null &&
          "userId" in result.body
        )
          setAccount(result.body as AuthAccountView);
        else setNote("登录方式暂未开放，或当前没有可用会话。");
      })
      .catch(() => {
        if (current === generation.current)
          setNote("登录方式暂未开放，或当前没有可用会话。");
      });
  }, []);

  const begin = (action: Action, target: Channel) => {
    if (account === null) return;
    const proof = proofFor(account, target);
    if (proof === null) {
      setError("请先保留一种可用的登录方式。");
      return;
    }
    setError("");
    setCode("");
    setIdentifier("");
    setFlow(null);
    void sendProof(emptyFlow(action, target, proof, account[target].version));
  };

  const sendProof = async (currentFlow: FactorFlow) => {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    const result = await authRequest("challenges", {
      body: {
        channel: currentFlow.proof,
        purpose: "reauthenticate",
        idempotencyKey: crypto.randomUUID(),
      },
    });
    if (current !== generation.current) return;
    setBusy(false);
    if (result.status !== 200) {
      setError(messageOf(result.body));
      return;
    }
    const body = result.body as {
      challengeId?: string;
      continuationToken?: string;
      maskedTarget?: string;
    };
    const continuation = body.continuationToken ?? currentFlow.continuation;
    if (!continuation) {
      setError("请稍后再获取验证码。");
      return;
    }
    setFlow({
      ...currentFlow,
      step: "proof",
      challengeId: body.challengeId ?? "",
      continuation,
      masked: body.maskedTarget ?? "",
    });
    setCode("");
  };

  const sendFactor = async (currentFlow: FactorFlow, value: string) => {
    const current = ++generation.current;
    setBusy(true);
    setError("");
    const result = await authRequest("challenges", {
      body: {
        channel: currentFlow.target,
        purpose: currentFlow.action === "replace" ? "replace" : "link",
        identifier: value,
        reauthToken: currentFlow.reauthToken,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    if (current !== generation.current) return;
    setBusy(false);
    if (result.status !== 200) {
      setError(messageOf(result.body));
      return;
    }
    const body = result.body as {
      challengeId?: string;
      continuationToken?: string;
      maskedTarget?: string;
    };
    setFlow({
      ...currentFlow,
      step: "factor",
      challengeId: body.challengeId ?? "",
      continuation: body.continuationToken ?? "",
      masked: body.maskedTarget ?? "",
    });
    setCode("");
  };

  const applyAccount = (body: unknown) => {
    if (
      typeof body === "object" &&
      body !== null &&
      "account" in body &&
      typeof body.account === "object" &&
      body.account !== null
    ) {
      setAccount(body.account as AuthAccountView);
      return;
    }
    load();
  };

  const submit = async () => {
    if (flow === null) return;
    if (flow.step === "identifier") {
      await sendFactor(flow, identifier);
      return;
    }
    const current = ++generation.current;
    setBusy(true);
    setError("");
    if (flow.step === "proof") {
      const result = await authRequest("challenges/verify", {
        body: {
          challengeId: flow.challengeId,
          code,
          continuationToken: flow.continuation,
          idempotencyKey: crypto.randomUUID(),
        },
      });
      if (current !== generation.current) return;
      setBusy(false);
      if (result.status !== 200) {
        setError(messageOf(result.body));
        return;
      }
      const body = result.body as { outcome?: string; reauthToken?: string };
      if (body.outcome !== "reauthenticated" || !body.reauthToken) {
        setError("这次验证不能继续，请重新开始。");
        return;
      }
      const proved = { ...flow, reauthToken: body.reauthToken };
      setCode("");
      if (flow.action === "unlink") {
        const unlinked = await authRequest("factors/unlink", {
          body: {
            channel: flow.target,
            reauthToken: body.reauthToken,
            expectedVersion: flow.expectedVersion,
            idempotencyKey: crypto.randomUUID(),
          },
        });
        if (current !== generation.current) return;
        if (unlinked.status !== 200) {
          setError(messageOf(unlinked.body));
          return;
        }
        applyAccount(unlinked.body);
        setFlow(null);
        return;
      }
      setFlow({ ...proved, step: "identifier" });
      return;
    }
    const result = await authRequest("factors/complete", {
      body: {
        challengeId: flow.challengeId,
        code,
        continuationToken: flow.continuation,
        reauthToken: flow.reauthToken,
        expectedVersion: flow.expectedVersion,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    if (current !== generation.current) return;
    setBusy(false);
    if (result.status !== 200) {
      setError(messageOf(result.body));
      return;
    }
    applyAccount(result.body);
    setFlow(null);
    setCode("");
    setIdentifier("");
  };

  return (
    <section aria-label="登录与安全">
      <h3>登录与安全</h3>
      {account === null ? (
        <p className="phase4-muted">{note || "正在读取登录方式。"}</p>
      ) : (
        (["email", "phone"] as const).map((channel) => {
          const factor = account[channel];
          const available = account.capabilities[channel].available;
          return (
            <p key={channel}>
              {labels[channel]}：{states[factor.state]}
              {factor.masked ? ` ${factor.masked}` : ""}
              {available && factor.state === "unbound" ? (
                <>
                  {" "}
                  <button type="button" onClick={() => begin("link", channel)}>
                    绑定
                  </button>
                </>
              ) : null}
              {available &&
              (factor.state === "verified" || factor.state === "pending") ? (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => begin("replace", channel)}
                  >
                    更换
                  </button>{" "}
                  <button
                    type="button"
                    onClick={() => begin("unlink", channel)}
                  >
                    解除
                  </button>
                </>
              ) : null}
            </p>
          );
        })
      )}
      {flow ? (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <p className={styles.muted}>
            {flow.action === "unlink"
              ? `解除${labels[flow.target]}前，先验证当前的${labels[flow.proof]}。`
              : flow.step === "identifier"
                ? `输入要${flow.action === "replace" ? "更换" : "绑定"}的${labels[flow.target]}。这会留在当前账户。`
                : flow.step === "factor"
                  ? `验证码已发往 ${flow.masked}。`
                  : `验证码已发往当前的${labels[flow.proof]}${flow.masked ? ` ${flow.masked}` : ""}。`}
          </p>
          {flow.step === "identifier" ? (
            <label className={styles.field}>
              {labels[flow.target]}
              <input
                autoComplete={flow.target === "email" ? "email" : "tel"}
                inputMode={flow.target === "email" ? "email" : "tel"}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                required
              />
            </label>
          ) : (
            <label className={styles.field}>
              验证码
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onPaste={(event) => {
                  const next = digits(event.clipboardData.getData("text"));
                  if (next.length === 0) return;
                  event.preventDefault();
                  setCode(next);
                }}
                onChange={(event) => setCode(digits(event.target.value))}
                required
              />
            </label>
          )}
          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          <div className={styles.actions}>
            <button className="yoyi-button" type="submit" disabled={busy}>
              {busy
                ? "处理中"
                : flow.step === "identifier"
                  ? "发送验证码"
                  : "继续"}
            </button>
            <button
              type="button"
              onClick={() => {
                generation.current += 1;
                setFlow(null);
                setError("");
                setBusy(false);
              }}
            >
              取消
            </button>
          </div>
        </form>
      ) : null}
      <button
        type="button"
        onClick={() => {
          void authRequest("sign-out", { method: "POST", body: {} }).then(
            () => {
              window.location.assign("/");
            },
          );
        }}
      >
        退出登录
      </button>
    </section>
  );
};
