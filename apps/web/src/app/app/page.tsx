import { getSessionUser } from "@/server/auth/session";
import { MobileWorkspaceRedirect } from "@/components/mobile-workspace-redirect";
import { WorkbenchView } from "@/components/workbench-view";

export default async function AppPage() {
  const user = await getSessionUser();

  return (
    <>
      <MobileWorkspaceRedirect />
      <WorkbenchView
        userName={user?.name ?? user?.email ?? "GitHub 用户"}
        userAvatarUrl={user?.image ?? null}
      />
    </>
  );
}
