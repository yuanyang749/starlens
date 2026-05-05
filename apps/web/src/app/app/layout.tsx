import type { ReactNode } from "react";
import { AppFrame } from "@/components/app-frame";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <AppFrame
      title="Workspace"
      description="The first milestone keeps the shell static, but the structure already matches the list-detail flow we want for search, notes, tags, and AI assistance."
    >
      {children}
    </AppFrame>
  );
}
