"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SetStepNav } from "@payloadcms/ui";

import {
  TIME_ZONE_NOTE,
  call,
  describeFailure,
  formatPreciseTime,
  policyDescriptions,
  policyLabels,
} from "./api";
import styles from "./community.module.css";

import type {
  PublicationPolicy,
  PublicationPolicyState,
} from "@moya/contracts/internal/community-operator";

const policies: readonly PublicationPolicy[] = [
  "DIRECT_PUBLICATION",
  "PRE_MODERATION",
];

/**
 * The Owner-controlled publication setting. Switching affects future
 * submissions only; nothing already pending, visible or hidden changes.
 */
export const CommunitySettingsClient = () => {
  const [policy, setPolicy] = useState<PublicationPolicyState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<{
    readonly tone: "success" | "error";
    readonly text: string;
  } | null>(null);

  useEffect(() => {
    void call<PublicationPolicyState>("read-policy")
      .then((state) => {
        setPolicy(state);
        setError(null);
      })
      .catch((failure: unknown) => setError(describeFailure(failure).text));
  }, []);

  const choose = async (next: PublicationPolicy) => {
    if (policy?.policy === next || busy) return;
    setBusy(true);
    try {
      setPolicy(
        await call<PublicationPolicyState>("set-policy", { policy: next }),
      );
      setReceipt({
        tone: "success",
        text: `已切换为「${policyLabels[next]}」，仅影响此后的新评论与回复。`,
      });
    } catch (failure) {
      setReceipt({
        tone: "error",
        text: `切换未执行：${describeFailure(failure).text}`,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.workspace}>
      <SetStepNav
        nav={[
          { label: "社区", url: "/admin/community-moderation" },
          { label: "发布设置" },
        ]}
      />
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>发布设置</h1>
          <p className={styles.lead}>
            全站唯一的发布模式，由后端保存并执行。
            <Link href="/admin/community-moderation">返回审核队列</Link>
            {" · "}
            <Link href="/admin">工作台</Link>
          </p>
        </div>
      </header>

      {error !== null ? (
        <p className={styles.notice} data-tone="error" role="alert">
          {error}
        </p>
      ) : null}

      <div aria-label="发布模式" className={styles.tabs} role="radiogroup">
        {policies.map((option) => (
          <button
            aria-checked={policy?.policy === option}
            className={styles.option}
            data-policy-option={option}
            disabled={busy && policy?.policy !== option}
            key={option}
            onClick={() => void choose(option)}
            role="radio"
            type="button"
          >
            {policyLabels[option]}
          </button>
        ))}
      </div>

      {policy === null ? (
        <p className={styles.state} role="status">
          正在读取当前设置…
        </p>
      ) : (
        <div className={styles.card} data-policy-current={policy.policy}>
          <h2>当前：{policyLabels[policy.policy]}</h2>
          <p className={styles.lead}>{policyDescriptions[policy.policy]}</p>
          <p className={styles.secondary}>
            由 {policy.updatedBy} 于{" "}
            <time dateTime={policy.updatedAt}>
              {formatPreciseTime(policy.updatedAt)}
            </time>{" "}
            设置；{TIME_ZONE_NOTE}。
          </p>
          <p className={styles.lead}>
            切换只影响此后的新提交：已待审核的仍待审核，已公开的仍公开，已隐藏的仍隐藏。
            回复不会越过仍待审核或已隐藏的根评论显示。
          </p>
        </div>
      )}

      {receipt === null ? null : (
        <p className={styles.receipt} data-tone={receipt.tone} role="status">
          {receipt.text}
        </p>
      )}
    </div>
  );
};
