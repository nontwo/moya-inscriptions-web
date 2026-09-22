"use client";

import { useEffect, useState } from "react";

import { authRequest } from "./auth-api";
import type { AuthAccountView } from "./auth-api";

const labels = { email: "邮箱", phone: "手机号" } as const;
const states = {
  unbound: "未绑定",
  verified: "已验证",
  unavailable: "当前不可用",
  pending: "操作进行中",
} as const;

export const AccountSecurity = () => {
  const [account, setAccount] = useState<AuthAccountView | null>(null);
  const [note, setNote] = useState("");
  useEffect(() => {
    let current = true;
    void authRequest("account")
      .then((result) => {
        if (!current) return;
        if (
          result.status === 200 &&
          typeof result.body === "object" &&
          result.body !== null
        )
          setAccount(result.body as AuthAccountView);
        else setNote("登录方式暂未开放，或当前没有可用会话。");
      })
      .catch(() => {
        if (current) setNote("登录方式暂未开放，或当前没有可用会话。");
      });
    return () => {
      current = false;
    };
  }, []);
  return (
    <section aria-label="登录与安全">
      <h3>登录与安全</h3>
      {account === null ? (
        <p className="phase4-muted">{note || "正在读取登录方式。"}</p>
      ) : null}
      {account
        ? (["email", "phone"] as const).map((channel) => {
            const factor = account[channel];
            return (
              <p key={channel}>
                {labels[channel]}：{states[factor.state]}
                {factor.masked ? ` ${factor.masked}` : ""}
                {factor.state === "unbound" &&
                account.capabilities[channel].available ? (
                  <>
                    {" "}
                    <a
                      href={`/login?return=${encodeURIComponent("/#profile")}`}
                    >
                      绑定
                    </a>
                  </>
                ) : null}
              </p>
            );
          })
        : null}
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
