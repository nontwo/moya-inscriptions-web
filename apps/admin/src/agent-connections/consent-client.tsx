"use client";

import { useState } from "react";

import type { ConsentDisplay } from "./consent";

/**
 * The consent form. One POST, one decision, and the browser then goes back to
 * the provider so IT can resume its own interaction with its own cookie.
 *
 * The ticket is a hidden value this page was rendered with. It is the CSRF
 * defence and it is bound to the transaction rather than to the session: a
 * request that cannot produce it did not come from a page the server rendered
 * to this human. Nothing here relies on `SameSite` for that, which is the
 * point — the whole flow exists because Strict withheld the cookie once
 * already.
 *
 * The Owner's cookie never travels to the provider. `credentials:
 * "same-origin"` keeps it on this origin, and the navigation afterwards
 * carries only the interaction uid.
 */
export const AgentConsentClient = ({
  display,
  ticket,
}: {
  readonly display: ConsentDisplay;
  readonly ticket: string;
}) => {
  const [state, setState] = useState<"idle" | "sending" | "failed">("idle");
  const [code, setCode] = useState<string | null>(null);

  const decide = async (decision: "approve" | "deny") => {
    setState("sending");
    setCode(null);
    try {
      const response = await fetch("/api/agent-connections/consent", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interaction: display.interaction,
          ticket,
          decision,
        }),
      });
      const payload: unknown = await response.json();
      const result =
        typeof payload === "object" && payload !== null
          ? (payload as { ok?: unknown; error?: unknown; result?: unknown })
          : {};
      if (!response.ok || result.ok !== true) {
        setCode(typeof result.error === "string" ? result.error : "REFUSED");
        setState("failed");
        return;
      }
      const resume = (result.result as { resume?: unknown }).resume;
      if (typeof resume !== "string") {
        setCode("RESUME_MISSING");
        setState("failed");
        return;
      }
      // A full navigation, not a fetch: the provider must see this as a
      // top-level request from the browser so its own interaction cookie is
      // sent. The URL is the server's, built from frozen configuration.
      window.location.assign(resume);
    } catch {
      setCode("NETWORK");
      setState("failed");
    }
  };

  return (
    <section data-agent-consent={display.interaction}>
      <h2>确认 AI 连接</h2>
      <dl>
        <dt>应用</dt>
        <dd data-agent-consent-client>{display.client}</dd>
        <dt>访问对象</dt>
        <dd data-agent-consent-resource>{display.resource}</dd>
        <dt>环境</dt>
        <dd data-agent-consent-environment>{display.environment}</dd>
        <dt>权限</dt>
        <dd data-agent-consent-scopes>
          {display.capabilities.join(" ")}（只读）
        </dd>
        {display.protocol.length > 0 ? (
          <>
            <dt>协议</dt>
            <dd data-agent-consent-protocol>{display.protocol.join(" ")}</dd>
          </>
        ) : null}
        <dt>有效期至</dt>
        <dd data-agent-consent-expires>{display.expiresAt}</dd>
      </dl>
      <p>
        同意后，这个应用可以只读地访问上述范围。它不能修改、发布或删除任何内容，
        也不能代你审批操作。你可以随时在「AI 连接」页面断开。
      </p>
      <p>
        <button
          data-agent-consent-approve
          disabled={state === "sending"}
          onClick={() => void decide("approve")}
          type="button"
        >
          同意
        </button>{" "}
        <button
          data-agent-consent-deny
          disabled={state === "sending"}
          onClick={() => void decide("deny")}
          type="button"
        >
          拒绝
        </button>
      </p>
      {state === "failed" ? (
        <p data-agent-consent-error={code ?? "REFUSED"} role="alert">
          这次授权没有完成：{code ?? "REFUSED"}。请回到应用重新发起。
        </p>
      ) : null}
    </section>
  );
};
