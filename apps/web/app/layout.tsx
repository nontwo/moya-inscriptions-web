import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@moya/design-tokens/theme.css";
import "@moya/ui/styles.css";

import { presentationPreferenceBootstrap } from "../features/home/presentation-preferences";

import "./globals.css";

export const metadata: Metadata = {
  title: "摩崖碑刻数字平台",
  description: "中国摩崖与石刻资料的移动优先数字档案。",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: presentationPreferenceBootstrap,
          }}
        />
      </head>
      <body className="yoyi-paper yoyi-paper--visible">{children}</body>
    </html>
  );
}
