import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "由艺（Yoyi）",
  description:
    "来源无关的中国文化艺术 Catalog，当前公开范围为碑刻（inscription）与书帖（calligraphy）。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
