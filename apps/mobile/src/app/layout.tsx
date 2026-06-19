import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Starlens Mobile",
  description: "用于搜索、整理和同步 GitHub Stars 的移动工作台。",
  applicationName: "Starlens",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Starlens",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#f7f8fb",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
