import { getSessionUser } from "@/server/auth/session";
import { MobileWorkspaceRedirect } from "@/components/mobile-workspace-redirect";
import { WorkbenchView } from "@/components/workbench-view";

function isAdminEmail(email?: string | null) {
  const raw = process.env.ADMIN_EMAILS ?? "";
  if (!raw.trim() || !email) return false;
  const admins = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}

export default async function AppPage() {
  const user = await getSessionUser();

  return (
    <>
      <MobileWorkspaceRedirect />
      <WorkbenchView
        userName={user?.name ?? user?.email ?? "GitHub 用户"}
        userAvatarUrl={user?.image ?? null}
        isAdmin={isAdminEmail(user?.email)}
      />
    </>
  );
}
