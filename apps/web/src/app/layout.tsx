import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Starlens",
  description: "A calm workbench for finding and organizing your GitHub stars.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
