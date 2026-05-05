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
      title="Workspace"
      description="Search, organize, and sync your public GitHub stars from one quiet workbench."
      userName={user.name ?? user.email ?? "GitHub user"}
    >
      {children}
    </AppFrame>
  );
}
