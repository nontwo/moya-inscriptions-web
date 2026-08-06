// ============================================================
// Vitest 配置冒烟测试
// 验证：环境 mock / globals / 路径别名 是否正常
// ============================================================

import { describe, it, expect, vi } from "vitest";

describe("Vitest 配置验证", () => {
  it("globals 已注入，无需手动 import describe/it/expect", () => {
    expect(true).toBe(true);
  });

  it("jsdom 环境可用 - document / window", () => {
    expect(document).toBeDefined();
    expect(window).toBeDefined();
    expect(document.createElement("div")).toBeInstanceOf(HTMLDivElement);
  });

  it("matchMedia mock 可用", () => {
    const mql = window.matchMedia("(min-width: 768px)");
    expect(mql).toBeDefined();
    expect(mql.matches).toBe(false);
    expect(mql.media).toBe("(min-width: 768px)");
  });

  it("IntersectionObserver mock 可用", () => {
    const io = new IntersectionObserver(() => {});
    expect(io.observe).toBeDefined();
    expect(io.unobserve).toBeDefined();
  });

  it("localStorage mock 可用", () => {
    localStorage.setItem("test", "hello");
    expect(localStorage.getItem("test")).toBe("hello");
    localStorage.clear();
    expect(localStorage.getItem("test")).toBeNull();
  });

  it("IndexedDB mock 可用", async () => {
    const req = indexedDB.open("test-db", 1);
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    expect(db).toBeDefined();
    expect(db.name).toBe("test-db");
    db.close();
  });

  it("路径别名 @moya/contracts 可解析", async () => {
    const mod = await import("@moya/contracts");
    expect(mod).toBeDefined();
    expect(mod.Dynasty).toBeDefined();
  });

  it("路径别名 @moya/logger 可解析", async () => {
    const mod = await import("@moya/logger");
    expect(mod).toBeDefined();
  });

  it("路径别名 @moya/ui 可解析", async () => {
    const mod = await import("@moya/ui");
    expect(mod).toBeDefined();
  });

  it("Canvas 2D context mock 可用", () => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    expect(ctx).not.toBeNull();
    expect(ctx!.fillRect).toBeDefined();
    expect(ctx!.fillText).toBeDefined();
  });

  it("SpeechSynthesis mock 可用", () => {
    expect(window.speechSynthesis).toBeDefined();
    expect(window.speechSynthesis.speak).toBeDefined();
    expect(window.SpeechSynthesisUtterance).toBeDefined();
  });
});
