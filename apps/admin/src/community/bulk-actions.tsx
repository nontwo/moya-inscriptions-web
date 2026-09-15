"use client";
import { useRef, useState } from "react";
import { call, describeFailure, outcomeUnknown } from "./api";
import styles from "./community.module.css";

export interface SelectedOperation {
  readonly id: string;
  readonly label: string;
  readonly name: "set-featured" | "moderate-work" | "recommend-user";
  readonly input: Record<string, unknown>;
}

/** At most one current page, serial commands and per-item results. A lost
 * response retains its exact request identity; retries never repeat successes.
 */
export const BulkActions = ({
  count,
  disabled,
  choices,
  prepare,
  onBusy,
  onComplete,
}: {
  count: number;
  disabled: boolean;
  choices: readonly { value: string; label: string; confirm?: boolean }[];
  prepare: (action: string) => SelectedOperation[];
  onBusy: (busy: boolean) => void;
  onComplete: () => Promise<void>;
}) => {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<SelectedOperation[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const run = async (operations: SelectedOperation[]) => {
    if (lock.current || operations.length === 0 || operations.length > 50)
      return;
    lock.current = true;
    setBusy(true);
    onBusy(true);
    const retry: SelectedOperation[] = [],
      lines: string[] = [];
    try {
      for (const op of operations) {
        try {
          await call(op.name, op.input);
          lines.push(`${op.label}：已完成`);
        } catch (error) {
          lines.push(`${op.label}：${describeFailure(error).text}`);
          if (outcomeUnknown(error)) retry.push(op);
        }
        setResults([...lines]);
      }
      setPending(retry);
      await onComplete();
    } finally {
      lock.current = false;
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <section aria-label="批量操作" className={styles.bulkBar}>
      <div className={styles.actions}>
        <span>已选择 {count} 项（当前页）</span>
        {choices.map((choice) => (
          <button
            key={choice.value}
            type="button"
            className={styles.actionButton}
            disabled={disabled || busy || count === 0 || pending.length > 0}
            onClick={() => {
              if (
                choice.confirm &&
                !window.confirm(
                  `${choice.label}所选 ${count} 项？将按现有管理规则限制访问，保留内容与审计记录。`,
                )
              )
                return;
              const ops = prepare(choice.value).map((op) => ({
                ...op,
                input: { ...op.input, requestId: crypto.randomUUID() },
              }));
              void run(ops);
            }}
          >
            {choice.label}
          </button>
        ))}
        {pending.length > 0 ? (
          <button
            type="button"
            className={styles.actionButton}
            disabled={busy || disabled}
            onClick={() => void run(pending)}
          >
            重试未确认的 {pending.length} 项
          </button>
        ) : null}
      </div>
      {results.length > 0 ? (
        <ul role="status">
          {results.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
};
