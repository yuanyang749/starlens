import "server-only";

// 中文注释：管理员身份通过 ADMIN_EMAILS 环境变量白名单校验，逗号分隔多个邮箱。
// 无需数据库字段，在部署层（.env）控制，和 SYSTEM_AI_* 模式一致。
export function isAdminUser(user: { email?: string | null }): boolean {
  const raw = process.env.ADMIN_EMAILS ?? "";
  if (!raw.trim()) return false;
  const admins = raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return admins.includes((user.email ?? "").toLowerCase());
}
