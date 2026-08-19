import type { Metadata } from "next";
import type { ReactNode } from "react";

import "@moya/design-tokens/theme.css";
import "@moya/ui/styles.css";

import { devicePlatformBootstrap } from "../product-shell/device-platform";
import { presentationPreferenceBootstrap } from "../product-shell/presentation-preferences";

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
            __html: `${presentationPreferenceBootstrap}\n${devicePlatformBootstrap}`,
          }}
        />
      </head>
      <body className="yoyi-paper yoyi-paper--visible">{children}</body>
    </html>
  );
}
