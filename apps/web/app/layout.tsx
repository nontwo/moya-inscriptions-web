import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "由艺｜摩崖碑刻数字档案",
  description: "中国摩崖与石刻资料的移动优先数字档案。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className="yoyi-paper">{children}</body>
    </html>
  );
}
