// 中文注释：run_readonly_query 工具的 SQL 预校验——只是第一道防线（更快、更清晰的报错反馈给
// AI 自己纠正），真正的安全边界是 packages/server/src/db/client.ts 里的只读角色 + RLS
// （见 apps/web/drizzle/0006_ai_readonly_role_and_rls.sql）。这里挡不住的东西，数据库角色权限
// 和行级安全策略会挡住。

// 中文注释：只挑真正有意义的关键词，避免误伤"begin/commit"这类可能出现在合法搜索词里的普通单词——
// 这些命令本身对只读角色也做不了什么，挡它们意义不大，反而容易误杀正常查询。
const DANGEROUS_KEYWORD_PATTERN =
  /\b(insert|update|delete|drop|alter|grant|revoke|truncate|create|copy|execute|call|vacuum|listen|notify|set|reset)\b/i;

export const SQL_ROW_LIMIT = 200;

export function assertReadOnlySelect(rawSql: string): string {
  const trimmed = rawSql.trim();

  if (!trimmed) {
    throw new Error("SQL query must not be empty.");
  }

  // 只允许最多一个可选的结尾分号，禁止语句堆叠（多条语句拼接执行）
  const withoutTrailingSemicolon = trimmed.endsWith(";") ? trimmed.slice(0, -1) : trimmed;
  if (withoutTrailingSemicolon.includes(";")) {
    throw new Error("Only a single SQL statement is allowed (no \";\" in the middle of the query).");
  }

  if (!/^(select|with)\b/i.test(withoutTrailingSemicolon.trimStart())) {
    throw new Error("Only SELECT (or WITH ... SELECT) statements are allowed.");
  }

  if (DANGEROUS_KEYWORD_PATTERN.test(withoutTrailingSemicolon)) {
    throw new Error("Query contains a keyword that is not allowed in a read-only search query.");
  }

  return withoutTrailingSemicolon;
}
