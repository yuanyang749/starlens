import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "../../../../db/client";
import { assertReadOnlySelect, SQL_ROW_LIMIT } from "./sql-validator";

// 中文注释：run_readonly_query 工具的真正执行体。安全边界分三层：
// 1) assertReadOnlySelect 做语法级预校验（快速拒绝，给 AI 明确的报错去自己纠正）
// 2) SET LOCAL ROLE 切到 starlens_ai_readonly——这个角色只对 starred_repos/repo_tags/repo_notes
//    有 SELECT 权限，其余表（尤其是 users/github_accounts/personal_api_tokens/user_ai_configs）
//    完全没有授权，数据库直接拒绝，不依赖这里的代码写对
// 3) RLS 策略保证即使查询语句本身完全没写 WHERE user_id = ...，也只会返回当前用户自己的数据
//    （迁移文件：apps/web/drizzle/0006_ai_readonly_role_and_rls.sql，已用真实数据验证过隔离性）
// 全程 SET LOCAL 作用域仅限当前事务，事务结束（无论 COMMIT 还是 ROLLBACK）后连接池里的连接
// 不会带着这些会话设置被其他请求复用。

export async function runReadonlyQuery(
  userId: string,
  rawSql: string,
): Promise<Record<string, unknown>[]> {
  const validatedSql = assertReadOnlySelect(rawSql);
  const boundedSql = `SELECT * FROM (${validatedSql}) AS agent_query LIMIT ${SQL_ROW_LIMIT}`;

  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL ROLE starlens_ai_readonly`);
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await tx.execute(sql`SET TRANSACTION READ ONLY`);
    await tx.execute(sql`SET LOCAL statement_timeout = '3000'`);

    const result = await tx.execute(sql.raw(boundedSql));
    return result.rows as Record<string, unknown>[];
  });
}
