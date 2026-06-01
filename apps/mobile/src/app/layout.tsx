import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Starlens Mobile",
  description: "Mobile workbench for searching and organizing GitHub stars.",
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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
