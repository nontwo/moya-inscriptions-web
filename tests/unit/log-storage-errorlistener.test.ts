// ============================================================
// LogStorage + ErrorListener 单元测试
// 注意：fake-indexeddb 跨测试共享同一数据库，
// LogStorage 模块级 dbPromise 缓存导致 clear+close 后冲突。
// 策略：用唯一 ID 隔离数据，不手动清理 DB。
// ============================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  LogCollector,
  logCollector,
  persistLog,
  cleanOldLogs,
  loadPersistedLogs,
  startPersistence,
  startErrorListener,
  logSearchError,
  logDataError,
  logInfo,
  logWarning,
} from "@moya/logger";
import type { LogEntry } from "@moya/contracts";

let seq = 0;
function uid(): string {
  return `t${Date.now()}-${seq++}`;
}

function pushEntry(
  msg: string,
  overrides: Partial<Parameters<typeof logCollector.push>[0]> = {},
): LogEntry {
  return logCollector.push({
    level: "INFO",
    module: "Test",
    function: "fn",
    message: msg,
    context: {
      route: "/",
      userAgent: "vitest",
      screenSize: "1920x1080",
      browserInfo: "Chrome/120",
    },
    ...overrides,
  });
}

beforeEach(() => {
  logCollector.clear();
  Object.defineProperty(window, "location", {
    value: { pathname: "/", search: "", hostname: "localhost" },
    writable: true,
    configurable: true,
  });
});

// ============================================================
describe("LogStorage", () => {
  it("persistLog() 写入 IndexedDB 后可加载", async () => {
    const msg = uid();
    await persistLog(pushEntry(msg));
    const loaded = await loadPersistedLogs();
    expect(loaded.find((e: LogEntry) => e.message === msg)).toBeDefined();
  });

  it("persistLog() 保留 id/timestamp/level/module", async () => {
    const msg = uid();
    const entry = pushEntry(msg);
    await persistLog(entry);

    const loaded = await loadPersistedLogs();
    const found = loaded.find((e: LogEntry) => e.message === msg)!;
    expect(found.id).toBe(entry.id);
    expect(found.timestamp).toBe(entry.timestamp);
    expect(found.level).toBe("INFO");
    expect(found.module).toBe("Test");
  });

  it("loadPersistedLogs() 返回已持久化的日志", async () => {
    const m1 = uid(),
      m2 = uid(),
      m3 = uid();
    await persistLog(pushEntry(m1));
    await persistLog(pushEntry(m2));
    await persistLog(pushEntry(m3, { level: "ERROR" }));

    const loaded = await loadPersistedLogs();
    expect(loaded.find((e: LogEntry) => e.message === m1)).toBeDefined();
    expect(loaded.find((e: LogEntry) => e.message === m2)).toBeDefined();
    expect(loaded.find((e: LogEntry) => e.message === m3)).toBeDefined();
  });

  it("loadPersistedLogs() 返回数组", async () => {
    const loaded = await loadPersistedLogs();
    expect(Array.isArray(loaded)).toBe(true);
  });

  it("cleanOldLogs() 删除超过 30 天的日志", async () => {
    const now = Date.now();
    const oldId = `old-${uid()}`;
    const newId = `new-${uid()}`;

    await persistLog({
      id: oldId,
      timestamp: now - 31 * 86400000,
      level: "INFO",
      module: "X",
      function: "f",
      message: "old-log",
      context: {
        route: "/",
        userAgent: "v",
        screenSize: "1x1",
        browserInfo: "v",
      },
    });
    await persistLog({
      id: newId,
      timestamp: now - 1 * 86400000,
      level: "INFO",
      module: "X",
      function: "f",
      message: "new-log",
      context: {
        route: "/",
        userAgent: "v",
        screenSize: "1x1",
        browserInfo: "v",
      },
    });

    await cleanOldLogs();

    const loaded = await loadPersistedLogs();
    expect(loaded.find((e: LogEntry) => e.id === oldId)).toBeUndefined();
    expect(loaded.find((e: LogEntry) => e.id === newId)).toBeDefined();
  });

  it("cleanOldLogs() 无旧数据时正常完成", async () => {
    await expect(cleanOldLogs()).resolves.toBeUndefined();
  });

  it("persistLog() 保留 stack 和 context.extra", async () => {
    const id = uid();
    const entry: LogEntry = {
      id,
      timestamp: Date.now(),
      level: "ERROR",
      module: "X",
      function: "f",
      message: "stack-test",
      stack: "Error: boom\n  at test.ts:42",
      context: {
        route: "/",
        userAgent: "v",
        screenSize: "1x1",
        browserInfo: "v",
        extra: { uid: 99 },
      },
    };
    await persistLog(entry);

    const loaded = await loadPersistedLogs();
    const found = loaded.find((e: LogEntry) => e.id === id);
    expect(found).toBeDefined();
    expect(found!.stack).toBe("Error: boom\n  at test.ts:42");
    expect(found!.context.extra).toEqual({ uid: 99 });
  });

  it("startPersistence() 应在 push 时自动写入", async () => {
    const msg = uid();
    const unsub = startPersistence();
    pushEntry(msg);
    await new Promise((r) => setTimeout(r, 500));

    const loaded = await loadPersistedLogs();
    expect(loaded.find((e: LogEntry) => e.message === msg)).toBeDefined();
    unsub();
  });

  it("startPersistence() 取消订阅后停止写入", async () => {
    const before = uid(),
      after = uid();
    const unsub = startPersistence();
    pushEntry(before);
    await new Promise((r) => setTimeout(r, 500));
    unsub();

    pushEntry(after);
    await new Promise((r) => setTimeout(r, 500));

    const loaded = await loadPersistedLogs();
    expect(loaded.find((e: LogEntry) => e.message === before)).toBeDefined();
    expect(loaded.find((e: LogEntry) => e.message === after)).toBeUndefined();
  });
});

// ============================================================
describe("ErrorListener", () => {
  it("logSearchError() 记录搜索异常（searchQuery + stack）", () => {
    logSearchError("大唐", new Error("timeout"));
    const last = logCollector.getEntries("ERROR").pop()!;
    expect(last.module).toBe("Search");
    expect(last.message).toContain("timeout");
    expect(last.context.searchQuery).toBe("大唐");
    expect(last.stack).toBeDefined();
  });

  it("logDataError() 记录数据异常", () => {
    logDataError("Repo", "getSite", new Error("404"));
    const last = logCollector.getEntries("ERROR").pop()!;
    expect(last.module).toBe("Repo");
    expect(last.function).toBe("getSite");
    expect(last.message).toContain("404");
  });

  it("logInfo() INFO 级别", () => {
    logInfo("Nav", "go", "跳转");
    const last = logCollector.getEntries("INFO").pop()!;
    expect(last.module).toBe("Nav");
    expect(last.message).toBe("跳转");
  });

  it("logWarning() WARNING 级别", () => {
    logWarning("Img", "load", "超时");
    const last = logCollector.getEntries("WARNING").pop()!;
    expect(last.module).toBe("Img");
    expect(last.message).toBe("超时");
  });

  it("logSearchError() 处理字符串异常", () => {
    logSearchError("q", "Network error");
    const last = logCollector.getEntries("ERROR").pop()!;
    expect(last.message).toContain("Network error");
    expect(last.stack).toBeUndefined();
  });

  it("logDataError() 处理对象异常", () => {
    logDataError("API", "call", { code: 500 });
    const last = logCollector.getEntries("ERROR").pop()!;
    expect(last.message).toContain("[object Object]");
    expect(last.stack).toBeUndefined();
  });

  it("logInfo/logWarning 不增加错误计数", () => {
    const before = logCollector.getErrorCount();
    logInfo("x", "y", "z");
    logWarning("x", "y", "z");
    expect(logCollector.getErrorCount()).toBe(before);
  });

  it("logSearchError() 空查询词也能记录", () => {
    logSearchError("", new Error("empty"));
    const last = logCollector.getEntries("ERROR").pop()!;
    expect(last.message).toContain("empty");
    expect(last.context.searchQuery).toBe("");
  });

  // ---- 全局监听器 ----
  it("startErrorListener() 注册 3 个监听器", () => {
    const wSpy = vi.spyOn(window, "addEventListener");
    const dSpy = vi.spyOn(document, "addEventListener");
    const c = startErrorListener();
    expect(wSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(wSpy).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );
    expect(dSpy).toHaveBeenCalledWith("error", expect.any(Function), true);
    wSpy.mockRestore();
    dSpy.mockRestore();
    c();
  });

  it("cleanup 移除 3 个监听器", () => {
    const wSpy = vi.spyOn(window, "removeEventListener");
    const dSpy = vi.spyOn(document, "removeEventListener");
    const c = startErrorListener();
    c();
    expect(wSpy).toHaveBeenCalledWith("error", expect.any(Function));
    expect(wSpy).toHaveBeenCalledWith(
      "unhandledrejection",
      expect.any(Function),
    );
    expect(dSpy).toHaveBeenCalledWith("error", expect.any(Function), true);
    wSpy.mockRestore();
    dSpy.mockRestore();
  });

  // ---- 错误捕获 ----
  it("window error 触发 GlobalError push", () => {
    const spy = vi.spyOn(logCollector, "push");
    const c = startErrorListener();
    window.dispatchEvent(
      new ErrorEvent("error", {
        message: "runtime",
        error: new Error("runtime"),
        filename: "a.js",
        lineno: 1,
        colno: 1,
      }),
    );
    const calls = spy.mock.calls.filter(
      ([e]) => e.module === "GlobalError" && e.function === "window.onerror",
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    spy.mockRestore();
    c();
  });

  it("图片 error 触发 WARNING push", () => {
    const spy = vi.spyOn(logCollector, "push");
    const c = startErrorListener();
    const img = document.createElement("img");
    img.src = "https://x.com/broken.png";
    document.body.appendChild(img);
    img.dispatchEvent(new Event("error", { bubbles: true }));
    document.body.removeChild(img);
    const calls = spy.mock.calls.filter(
      ([e]) => e.module === "Image" && e.level === "WARNING",
    );
    expect(calls.length).toBeGreaterThanOrEqual(1);
    spy.mockRestore();
    c();
  });

  // ---- 上下文收集 ----
  it("错误日志包含完整上下文字段", () => {
    logDataError("Test", "ctx", new Error("ctx"));
    const last = logCollector.getEntries("ERROR").pop()!;
    expect(last.context.route).toBeDefined();
    expect(last.context.userAgent).toBeDefined();
    expect(last.context.screenSize).toMatch(/^\d+x\d+$/);
    expect(last.context.browserInfo).toBeDefined();
  });

  it("上下文 route 反映当前 location", () => {
    Object.defineProperty(window, "location", {
      value: {
        pathname: "/detail/tang",
        search: "?q=颜",
        hostname: "localhost",
      },
      writable: true,
      configurable: true,
    });
    logInfo("Page", "view", "访问");
    const last = logCollector.getEntries("INFO").pop()!;
    expect(last.context.route).toContain("/detail/tang");
    expect(last.context.route).toContain("q=颜");
  });
});
