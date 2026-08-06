// ============================================================
// 日志收集器 - 环形缓冲区 + 观察者模式
// ============================================================

import type { LogEntry, LogLevel, LogContext } from "@moya/contracts";

const MAX_BUFFER_SIZE = 500;

type LogObserver = (entry: LogEntry) => void;
type ErrorCountObserver = (count: number) => void;

export class LogCollector {
  private buffer: LogEntry[] = [];
  private observers: Set<LogObserver> = new Set();
  private errorCountObservers: Set<ErrorCountObserver> = new Set();
  private errorCount = 0;
  private idCounter = 0;

  /** 添加日志条目 */
  push(entry: Omit<LogEntry, "id" | "timestamp">): LogEntry {
    const full: LogEntry = {
      ...entry,
      id: `log_${Date.now()}_${this.idCounter++}`,
      timestamp: Date.now(),
    };

    // 环形缓冲区
    if (this.buffer.length >= MAX_BUFFER_SIZE) {
      this.buffer.shift();
    }
    this.buffer.push(full);

    // 更新错误计数
    if (full.level === "ERROR") {
      this.errorCount++;
      this.notifyErrorCount();
    }

    // 通知所有观察者
    this.notify(full);

    // 开发环境下同时输出到控制台
    if (
      typeof window !== "undefined" &&
      window.location.hostname === "localhost"
    ) {
      const style =
        full.level === "ERROR"
          ? "color:red;font-weight:bold"
          : full.level === "WARNING"
            ? "color:orange"
            : full.level === "INFO"
              ? "color:blue"
              : "color:gray";
      console.log(
        `%c[${full.level}] ${full.module}.${full.function}: ${full.message}`,
        style,
      );
    }

    return full;
  }

  /** 获取所有日志（从旧到新） */
  getEntries(level?: LogLevel): LogEntry[] {
    if (!level) return [...this.buffer];
    return this.buffer.filter((e) => e.level === level);
  }

  /** 获取错误计数 */
  getErrorCount(): number {
    return this.errorCount;
  }

  /** 清空缓冲区 */
  clear(): void {
    this.buffer = [];
    this.errorCount = 0;
    this.notifyErrorCount();
  }

  /** 导出为 JSON */
  exportJSON(): string {
    return JSON.stringify(this.buffer, null, 2);
  }

  /** 导出为 CSV */
  exportCSV(): string {
    const header = "时间,级别,模块,函数,消息,路由,UA\n";
    const rows = this.buffer.map((e) => {
      const time = new Date(e.timestamp).toISOString();
      return `"${time}","${e.level}","${e.module}","${e.function}","${e.message}","${e.context.route}","${e.context.userAgent}"`;
    });
    return "\uFEFF" + header + rows.join("\n");
  }

  /** 订阅日志更新 */
  subscribe(observer: LogObserver): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  /** 订阅错误计数更新 */
  subscribeErrorCount(observer: ErrorCountObserver): () => void {
    this.errorCountObservers.add(observer);
    return () => this.errorCountObservers.delete(observer);
  }

  private notify(entry: LogEntry): void {
    this.observers.forEach((obs) => obs(entry));
  }

  private notifyErrorCount(): void {
    this.errorCountObservers.forEach((obs) => obs(this.errorCount));
  }
}

/** 全局单例 */
export const logCollector =
  typeof window !== "undefined" ? new LogCollector() : new LogCollector();
