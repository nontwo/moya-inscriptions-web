// ============================================================
// LogCollector 单元测试 — 11 个用例
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { LogCollector } from "@moya/logger";
import type { LogEntry, LogLevel } from "@moya/contracts";

/** 快捷创建 context 工厂 */
function makeContext(
  overrides: Partial<LogEntry["context"]> = {},
): LogEntry["context"] {
  return {
    route: "/",
    searchQuery: "",
    userAgent: "vitest",
    screenSize: "1920x1080",
    browserInfo: "Chrome/120",
    ...overrides,
  };
}

/** 快捷创建 log 输入工厂 */
function makeInput(
  overrides: Partial<Omit<LogEntry, "id" | "timestamp">> = {},
) {
  return {
    level: "INFO" as LogLevel,
    module: "TestModule",
    function: "testFn",
    message: "test message",
    context: makeContext(),
    ...overrides,
  };
}

// ---- 每个用例前重置 collector ----
let collector: LogCollector;

beforeEach(() => {
  collector = new LogCollector();
});

// ============================================================
describe("LogCollector", () => {
  // ==========================================================
  // 用例 1：push — 添加日志并返回完整条目（含 id + timestamp）
  // ==========================================================
  it("push() 应返回含 id 和 timestamp 的完整 LogEntry", () => {
    const entry = collector.push(makeInput({ message: "hello world" }));

    expect(entry.id).toMatch(/^log_\d+_\d+$/);
    expect(entry.timestamp).toBeGreaterThan(0);
    expect(entry.timestamp).toBeLessThanOrEqual(Date.now());
    expect(entry.level).toBe("INFO");
    expect(entry.module).toBe("TestModule");
    expect(entry.function).toBe("testFn");
    expect(entry.message).toBe("hello world");
    expect(entry.context.route).toBe("/");
  });

  // ==========================================================
  // 用例 2：push — ERROR 级别应触发错误计数递增
  // ==========================================================
  it("push() ERROR 级别应递增错误计数", () => {
    expect(collector.getErrorCount()).toBe(0);

    collector.push(makeInput({ level: "INFO" }));
    expect(collector.getErrorCount()).toBe(0); // INFO 不计

    collector.push(makeInput({ level: "ERROR", message: "crash!" }));
    expect(collector.getErrorCount()).toBe(1);

    collector.push(makeInput({ level: "ERROR", message: "crash again!" }));
    expect(collector.getErrorCount()).toBe(2);
  });

  // ==========================================================
  // 用例 3：push — WARNING / DEBUG 不触发错误计数
  // ==========================================================
  it("push() WARNING 和 DEBUG 不应影响错误计数", () => {
    collector.push(makeInput({ level: "WARNING" }));
    collector.push(makeInput({ level: "DEBUG" }));
    expect(collector.getErrorCount()).toBe(0);
  });

  // ==========================================================
  // 用例 4：环形缓冲区 — 超过 500 条时自动丢弃最旧记录
  // ==========================================================
  it("push() 超过 500 条时应丢弃最旧记录（环形缓冲区）", () => {
    // 写入 510 条
    for (let i = 0; i < 510; i++) {
      collector.push(makeInput({ message: `log #${i}` }));
    }

    const all = collector.getEntries();
    expect(all.length).toBe(500); // 缓冲区上限
    // 最旧的应该是 #10
    expect(all[0].message).toBe("log #10");
    // 最新的是 #509
    expect(all[all.length - 1].message).toBe("log #509");
  });

  // ==========================================================
  // 用例 5：getEntries — 无参数返回全部日志
  // ==========================================================
  it("getEntries() 无参数应返回全部日志（从旧到新）", () => {
    collector.push(makeInput({ message: "first" }));
    collector.push(makeInput({ message: "second" }));
    collector.push(makeInput({ message: "third" }));

    const all = collector.getEntries();
    expect(all).toHaveLength(3);
    expect(all[0].message).toBe("first");
    expect(all[2].message).toBe("third");
  });

  // ==========================================================
  // 用例 6：getEntries — 按级别筛选
  // ==========================================================
  it("getEntries(level) 应按级别筛选", () => {
    collector.push(makeInput({ level: "DEBUG", message: "debug" }));
    collector.push(makeInput({ level: "INFO", message: "info1" }));
    collector.push(makeInput({ level: "ERROR", message: "error" }));
    collector.push(makeInput({ level: "INFO", message: "info2" }));

    const infos = collector.getEntries("INFO");
    expect(infos).toHaveLength(2);
    expect(infos.every((e: { level: string }) => e.level === "INFO")).toBe(
      true,
    );

    const errors = collector.getEntries("ERROR");
    expect(errors).toHaveLength(1);

    const debugs = collector.getEntries("DEBUG");
    expect(debugs).toHaveLength(1);

    const warnings = collector.getEntries("WARNING");
    expect(warnings).toHaveLength(0);
  });

  // ==========================================================
  // 用例 7：clear — 清空缓冲区 + 重置错误计数
  // ==========================================================
  it("clear() 应清空所有日志并重置错误计数", () => {
    collector.push(makeInput({ level: "ERROR" }));
    collector.push(makeInput({ level: "ERROR" }));
    collector.push(makeInput({ level: "INFO" }));
    expect(collector.getEntries()).toHaveLength(3);
    expect(collector.getErrorCount()).toBe(2);

    collector.clear();

    expect(collector.getEntries()).toHaveLength(0);
    expect(collector.getErrorCount()).toBe(0);
  });

  // ==========================================================
  // 用例 8：exportJSON — 导出 JSON 格式
  // ==========================================================
  it("exportJSON() 应返回合法的 JSON 字符串", () => {
    collector.push(makeInput({ message: "test json" }));

    const json = collector.exportJSON();
    expect(() => JSON.parse(json)).not.toThrow();

    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].message).toBe("test json");
    expect(parsed[0].level).toBe("INFO");
    expect(parsed[0].id).toBeDefined();
    expect(parsed[0].timestamp).toBeDefined();
  });

  it("exportJSON() 空缓冲区返回空数组 JSON", () => {
    const json = collector.exportJSON();
    expect(JSON.parse(json)).toEqual([]);
  });

  // ==========================================================
  // 用例 9：exportCSV — 导出 CSV 格式（含 BOM + 表头）
  // ==========================================================
  it("exportCSV() 应返回含 BOM + 表头的 CSV 字符串", () => {
    collector.push(
      makeInput({
        message: "csv test",
        module: "CSVModule",
        function: "csvFn",
      }),
    );

    const csv = collector.exportCSV();

    // BOM
    expect(csv.charCodeAt(0)).toBe(0xfeff);

    // 表头
    const lines = csv.split("\n");
    expect(lines[0]).toContain("时间");
    expect(lines[0]).toContain("级别");
    expect(lines[0]).toContain("模块");
    expect(lines[0]).toContain("函数");
    expect(lines[0]).toContain("消息");
    expect(lines[0]).toContain("路由");
    expect(lines[0]).toContain("UA");

    // 数据行
    expect(lines[1]).toContain("csv test");
    expect(lines[1]).toContain("CSVModule");
    expect(lines[1]).toContain("csvFn");
    expect(lines[1]).toContain("INFO");
  });

  it("exportCSV() 空缓冲区只返回表头", () => {
    const csv = collector.exportCSV();
    const lines = csv.split("\n");
    expect(lines).toHaveLength(2); // BOM header + empty
    expect(lines[1]).toBe("");
  });

  // ==========================================================
  // 用例 10：观察者模式 — subscribe 回调在 push 时触发
  // ==========================================================
  it("subscribe() 回调应在每次 push() 时触发", () => {
    const observer = vi.fn();
    const unsubscribe = collector.subscribe(observer);

    collector.push(makeInput({ message: "event-1" }));
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer).toHaveBeenCalledWith(
      expect.objectContaining({ message: "event-1" }),
    );

    collector.push(makeInput({ message: "event-2" }));
    expect(observer).toHaveBeenCalledTimes(2);

    // 取消订阅
    unsubscribe();
    collector.push(makeInput({ message: "event-3" }));
    expect(observer).toHaveBeenCalledTimes(2); // 不再触发
  });

  // ==========================================================
  // 用例 11：观察者模式 — subscribeErrorCount 在 ERROR 时触发
  // ==========================================================
  it("subscribeErrorCount() 回调应在 ERROR 时触发并传递最新计数", () => {
    const errorObserver = vi.fn();
    const unsubscribe = collector.subscribeErrorCount(errorObserver);

    // 第一次 ERROR
    collector.push(makeInput({ level: "ERROR", message: "e1" }));
    expect(errorObserver).toHaveBeenCalledTimes(1);
    expect(errorObserver).toHaveBeenCalledWith(1);

    // 第二次 ERROR
    collector.push(makeInput({ level: "ERROR", message: "e2" }));
    expect(errorObserver).toHaveBeenCalledTimes(2);
    expect(errorObserver).toHaveBeenCalledWith(2);

    // INFO 不触发
    collector.push(makeInput({ level: "INFO" }));
    expect(errorObserver).toHaveBeenCalledTimes(2);

    // clear 触发（重置为 0）
    collector.clear();
    expect(errorObserver).toHaveBeenCalledTimes(3);
    expect(errorObserver).toHaveBeenCalledWith(0);

    // 取消订阅
    unsubscribe();
    collector.push(makeInput({ level: "ERROR", message: "e3" }));
    expect(errorObserver).toHaveBeenCalledTimes(3); // 不再触发
  });

  // ==========================================================
  // 额外边界测试：多个观察者同时订阅
  // ==========================================================
  it("多个观察者同时订阅应全部收到通知", () => {
    const obs1 = vi.fn();
    const obs2 = vi.fn();
    const obs3 = vi.fn();

    collector.subscribe(obs1);
    collector.subscribe(obs2);
    collector.subscribe(obs3);

    collector.push(makeInput({ message: "broadcast" }));

    expect(obs1).toHaveBeenCalledTimes(1);
    expect(obs2).toHaveBeenCalledTimes(1);
    expect(obs3).toHaveBeenCalledTimes(1);
  });

  // ==========================================================
  // 额外边界测试：push 的 stack 字段保留
  // ==========================================================
  it("push() 应保留 stack 字段", () => {
    const entry = collector.push(
      makeInput({
        level: "ERROR",
        message: "stack test",
        stack: "Error: something\n  at test.ts:10",
      }),
    );

    expect(entry.stack).toBe("Error: something\n  at test.ts:10");
  });

  // ==========================================================
  // 额外边界测试：push 的 context.extra 保留
  // ==========================================================
  it("push() 应保留 context.extra 自定义字段", () => {
    const entry = collector.push(
      makeInput({
        context: makeContext({ extra: { userId: 42, action: "click" } }),
      }),
    );

    expect(entry.context.extra).toEqual({ userId: 42, action: "click" });
  });
});
