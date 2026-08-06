// ============================================================
// 全局错误捕获监听器
// 捕获：window.onerror, unhandledrejection, React Error Boundary
// 自动收集上下文：路由、搜索词、UA、屏幕尺寸
// ============================================================

import type { LogContext } from "@moya/contracts";
import { logCollector } from "./LogCollector";

function getContext(): LogContext {
  return {
    route: window.location.pathname + window.location.search,
    searchQuery:
      new URLSearchParams(window.location.search).get("q") || undefined,
    userAgent: navigator.userAgent,
    screenSize: `${window.innerWidth}x${window.innerHeight}`,
    browserInfo: `${navigator.language} | ${navigator.platform}`,
  };
}

/** 启动全局错误监听 */
export function startErrorListener(): () => void {
  // window.onerror
  const errorHandler = (
    event: Event | string,
    source?: string,
    lineno?: number,
    colno?: number,
    error?: Error,
  ) => {
    logCollector.push({
      level: "ERROR",
      module: "GlobalError",
      function: "window.onerror",
      message: error?.message || String(event),
      stack: error?.stack,
      context: {
        ...getContext(),
        extra: { source, lineno, colno },
      },
    });
  };
  window.addEventListener("error", errorHandler);

  // unhandledrejection
  const rejectionHandler = (event: PromiseRejectionEvent) => {
    logCollector.push({
      level: "ERROR",
      module: "GlobalError",
      function: "unhandledrejection",
      message: event.reason?.message || String(event.reason),
      stack: event.reason?.stack,
      context: getContext(),
    });
  };
  window.addEventListener("unhandledrejection", rejectionHandler);

  // 图片加载错误
  const imgErrorHandler = (event: Event) => {
    const img = event.target as HTMLImageElement;
    if (img?.src) {
      logCollector.push({
        level: "WARNING",
        module: "Image",
        function: "onerror",
        message: `图片加载失败: ${img.src}`,
        context: getContext(),
      });
    }
  };
  document.addEventListener("error", imgErrorHandler, true);

  return () => {
    window.removeEventListener("error", errorHandler);
    window.removeEventListener("unhandledrejection", rejectionHandler);
    document.removeEventListener("error", imgErrorHandler, true);
  };
}

/** 记录搜索异常 */
export function logSearchError(query: string, error: unknown) {
  logCollector.push({
    level: "ERROR",
    module: "Search",
    function: "searchSites",
    message: `搜索异常: ${error instanceof Error ? error.message : String(error)}`,
    stack: error instanceof Error ? error.stack : undefined,
    context: {
      ...getContext(),
      searchQuery: query,
    },
  });
}

/** 记录数据加载异常 */
export function logDataError(module: string, fn: string, error: unknown) {
  logCollector.push({
    level: "ERROR",
    module,
    function: fn,
    message: `数据加载异常: ${error instanceof Error ? error.message : String(error)}`,
    stack: error instanceof Error ? error.stack : undefined,
    context: getContext(),
  });
}

/** 记录操作日志 */
export function logInfo(module: string, fn: string, message: string) {
  logCollector.push({
    level: "INFO",
    module,
    function: fn,
    message,
    context: getContext(),
  });
}

/** 记录警告 */
export function logWarning(module: string, fn: string, message: string) {
  logCollector.push({
    level: "WARNING",
    module,
    function: fn,
    message,
    context: getContext(),
  });
}
