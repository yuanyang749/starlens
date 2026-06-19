import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getSessionUser } from "@starlens/server/server/auth/session";
import { isAdminUser } from "@starlens/server/server/auth/admin";
import { getDb } from "@starlens/server/db/client";
import { aiUsageLogs, starredRepos, users } from "@starlens/server/db/schema";
import { eq, sql } from "drizzle-orm";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isAdminUser(user)) return fail("forbidden", "Admin access required.", 403);

  const db = getDb();

  // 中文注释：用相关子查询分别聚合，避免双 LEFT JOIN 产生笛卡尔积导致数值被放大。
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      starredCount: sql<number>`(
        select count(*) from ${starredRepos}
        where ${starredRepos.userId} = ${users.id}
          and ${starredRepos.isStarred} = true
      )`,
      totalTokens: sql<number>`(
        select coalesce(sum(${aiUsageLogs.promptTokens} + ${aiUsageLogs.completionTokens}), 0)
        from ${aiUsageLogs}
        where ${aiUsageLogs.userId} = ${users.id}
      )`,
    })
    .from(users)
    .orderBy(sql`${users.createdAt} desc`);

  return ok(rows.map((row) => ({
    ...row,
    starredCount: Number(row.starredCount ?? 0),
    totalTokens: Number(row.totalTokens ?? 0),
  })));
}
