import "@/app/styles/mobile-workbench.css";
import { redirect } from "next/navigation";
import { MobileWorkbench } from "@starlens/mobile/components/mobile-workbench";
import { DesktopWorkspaceRedirect } from "@/components/mobile-workspace-redirect";
import { getSessionUser } from "@/server/auth/session";

export default async function MobileWorkspacePage() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/");
  }

  return (
    <>
      <DesktopWorkspaceRedirect />
      <MobileWorkbench
        basePath="/mobile"
        userName={user.name ?? user.email ?? "GitHub user"}
        userAvatarUrl={user.image ?? null}
      />
    </>
  );
}
