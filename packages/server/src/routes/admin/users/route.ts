import { fail, ok, unauthorized } from "@starlens/server/lib/api-response";
import { getSessionUser } from "@starlens/server/server/auth/session";
import { isAdminUser } from "@starlens/server/server/auth/admin";
import { getDb } from "@starlens/server/db/client";
import { users } from "@starlens/server/db/schema";
import { desc, sql } from "drizzle-orm";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return unauthorized();
  if (!isAdminUser(user)) return fail("forbidden", "Admin access required.", 403);

  const db = getDb();

  // 中文注释：相关子查询使用裸 SQL 列引用（users.id）而非 Drizzle 列对象，
  // 避免 Drizzle 将外层列引用当作参数绑定导致 user_id = NULL 的 bug。
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      avatarUrl: users.avatarUrl,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      starredCount: sql<number>`(
        select count(*)::int from starred_repos
        where starred_repos.user_id = users.id
          and starred_repos.is_starred = true
      )`,
      totalTokens: sql<number>`(
        select coalesce(sum(prompt_tokens + completion_tokens), 0)::int
        from ai_usage_logs
        where ai_usage_logs.user_id = users.id
      )`,
    })
    .from(users)
    .orderBy(desc(users.createdAt));

  return ok(rows.map((row) => ({
    ...row,
    starredCount: Number(row.starredCount ?? 0),
    totalTokens: Number(row.totalTokens ?? 0),
  })));
}
