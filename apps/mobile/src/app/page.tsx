import { getSessionUser } from "@starlens/server/server/auth/session";
import { isAdminUser } from "@starlens/server/server/auth/admin";
import { MobileSignIn } from "@/components/mobile-sign-in";
import { MobileWorkbench } from "@/components/mobile-workbench";

export default async function MobilePage() {
  const user = await getSessionUser();

  if (!user) {
    return <MobileSignIn />;
  }

  const isAdmin = isAdminUser({ email: user.email });

  return (
    <MobileWorkbench
      userName={user.name ?? user.email ?? "GitHub 用户"}
      userAvatarUrl={user.image ?? null}
      isAdmin={isAdmin}
    />
  );
}
