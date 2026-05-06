import type { ReactNode } from "react";

export function AppFrame({
  children,
}: {
  children: ReactNode;
  title: string;
  description: string;
  userName: string;
}) {
  return <div className="app-shell">{children}</div>;
}
