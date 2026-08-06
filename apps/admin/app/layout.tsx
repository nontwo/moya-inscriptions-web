import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "摩崖碑刻数字平台 - 管理端",
  description: "摩崖碑刻数字平台的管理端。管理碑刻、书家、图片和站点内容。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <div className="min-h-screen bg-rice-50">
          <AdminHeader />
          <div className="flex">
            <AdminSidebar />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}

function AdminHeader() {
  return (
    <header className="bg-white border-b border-rice-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h1 className="font-serif text-xl text-ink-600 font-bold">
          摩崖碑刻数字平台
        </h1>
        <span className="text-xs bg-vermilion-100 text-vermilion-600 px-2 py-0.5 rounded-full">
          管理端
        </span>
      </div>
      <div className="flex items-center gap-4 text-sm text-ink-400">
        <span>阶段 0 · 开发模式</span>
        <div className="w-8 h-8 rounded-full bg-rice-200" />
      </div>
    </header>
  );
}

function AdminSidebar() {
  const items = [
    { label: "仪表盘", href: "/", active: true },
    { label: "碑刻管理", href: "/sites", active: false },
    { label: "书家管理", href: "/calligraphers", active: false },
    { label: "图片管理", href: "/images", active: false },
    { label: "分类管理", href: "/categories", active: false },
    { label: "数据导入", href: "/import", active: false },
    { label: "系统设置", href: "/settings", active: false },
  ];

  return (
    <nav className="w-56 min-h-[calc(100vh-57px)] bg-white border-r border-rice-200 py-4">
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.href}>
            <a
              href={item.href}
              className={`block px-4 py-2 text-sm transition-colors ${
                item.active
                  ? "bg-vermilion-50 text-vermilion-600 border-r-2 border-vermilion-500"
                  : "text-ink-400 hover:bg-rice-50 hover:text-ink-600"
              }`}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
