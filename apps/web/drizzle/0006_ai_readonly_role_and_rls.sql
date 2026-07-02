-- 中文注释：给 AI Agent 的"自由 SQL 检索"工具用的只读角色 + 行级安全隔离。
-- 目标：即使 AI 生成的 SQL 完全没写 WHERE user_id = ...，Postgres 自己也只会返回当前会话
-- 绑定用户的数据；对 users / github_accounts / personal_api_tokens / user_ai_configs 这些敏感表
-- 完全不授权（默认拒绝），不是靠 prompt 里"请不要查"这种软约束。

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlens_ai_readonly') THEN
    CREATE ROLE starlens_ai_readonly NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

-- 让当前连接用的应用角色（本地/生产都是这条连接字符串里的那个用户）能 SET ROLE 切进去
GRANT starlens_ai_readonly TO CURRENT_USER;

-- 角色级默认查询超时，就算调用方代码忘了显式 SET LOCAL statement_timeout 也有兜底
ALTER ROLE starlens_ai_readonly SET statement_timeout = '3000';
-- 只读会话，禁止这条连接内出现任何写操作（哪怕权限系统本身出现配置疏漏也有这层兜底）
ALTER ROLE starlens_ai_readonly SET default_transaction_read_only = on;

GRANT USAGE ON SCHEMA public TO starlens_ai_readonly;

-- 仅这三张表跟"仓库检索"相关，且都不含敏感数据
GRANT SELECT ON starred_repos, repo_tags, repo_notes TO starlens_ai_readonly;

ALTER TABLE starred_repos ENABLE ROW LEVEL SECURITY;
ALTER TABLE repo_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE repo_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_readonly_user_isolation ON starred_repos;
CREATE POLICY ai_readonly_user_isolation ON starred_repos
  FOR SELECT
  TO starlens_ai_readonly
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS ai_readonly_user_isolation ON repo_tags;
CREATE POLICY ai_readonly_user_isolation ON repo_tags
  FOR SELECT
  TO starlens_ai_readonly
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

DROP POLICY IF EXISTS ai_readonly_user_isolation ON repo_notes;
CREATE POLICY ai_readonly_user_isolation ON repo_notes
  FOR SELECT
  TO starlens_ai_readonly
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- 中文注释：users / github_accounts / personal_api_tokens / user_ai_configs / ai_usage_logs
-- 故意不给 starlens_ai_readonly 任何授权——Postgres 默认拒绝，不需要显式 REVOKE。
