import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppFrame } from "@/components/app-frame";
import { getSessionUser } from "@/server/auth/session";

export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return (
    <AppFrame
      title="工作台"
      description="在一个安静的工作台中搜索、整理并同步你的公开 GitHub Stars。"
      userName={user.name ?? user.email ?? "GitHub 用户"}
    >
      {children}
    </AppFrame>
  );
}
