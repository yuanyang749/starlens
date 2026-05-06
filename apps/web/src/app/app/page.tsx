import { getSessionUser } from "@/server/auth/session";
import { WorkbenchView } from "@/components/workbench-view";

export default async function AppPage() {
  const user = await getSessionUser();

  return <WorkbenchView userName={user?.name ?? user?.email ?? "GitHub user"} />;
}
