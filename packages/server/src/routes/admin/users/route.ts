import { count, eq, sql, sum } from "drizzle-orm";
import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getSessionUser } from "@starlens/server/server/auth/session";
import { isAdminUser } from "@starlens/server/server/auth/admin";
import { getDb } from "@starlens/server/db/client";
import { aiUsageLogs, starredRepos, users } from "@starlens/server/db/schema";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isAdminUser(user)) return fail("forbidden", "Admin access required.", 403);

  const db = getDb();

  // 中文注释：一次 JOIN 同时聚合星标数和 token 用量，避免 N+1 查询。
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      starredCount: count(starredRepos.id),
      totalTokens: sum(
        sql<number>`coalesce(${aiUsageLogs.promptTokens}, 0) + coalesce(${aiUsageLogs.completionTokens}, 0)`,
      ),
    })
    .from(users)
    .leftJoin(starredRepos, eq(starredRepos.userId, users.id))
    .leftJoin(aiUsageLogs, eq(aiUsageLogs.userId, users.id))
    .groupBy(users.id)
    .orderBy(sql`${users.createdAt} desc`);

  return ok(rows.map((row) => ({
    ...row,
    starredCount: Number(row.starredCount ?? 0),
    totalTokens: Number(row.totalTokens ?? 0),
  })));
}
