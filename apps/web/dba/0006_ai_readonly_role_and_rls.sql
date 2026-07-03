-- ============================================================================
-- DBA 脚本(管理员执行):AI 只读角色 + 行级安全隔离
-- ----------------------------------------------------------------------------
-- 用途:为 AI Agent 的"自由 SQL 检索"工具建立只读角色和 RLS 策略,确保 AI 生成的
-- SQL 即使没有 WHERE user_id = ...,Postgres 也只会返回当前会话绑定用户的数据;
-- 对 users / github_accounts / personal_api_tokens / user_ai_configs 等敏感表
-- 完全不授权(默认拒绝),而非靠 prompt 软约束。
--
-- 为什么独立于 drizzle 迁移:
--   本脚本包含 CREATE ROLE / GRANT ROLE / ALTER ROLE 等 DBA 级操作,需要连接用户
--   拥有 CREATEROLE 权限。而应用迁移用户(DATABASE_URL 里的用户,通常为 starlens)
--   出于最小权限原则不具备该权限。将其留在 drizzle 迁移里会导致 `drizzle-kit migrate`
--   以应用用户执行时失败。因此拆出为独立 DBA 脚本,由数据库超管在首次部署或环境
--   初始化时执行一次(脚本幂等,可重复执行)。
--
-- 执行方式(用数据库超管账号):
--   # 生产 / 自托管(PostgreSQL 在 1Panel 容器内,超管账号见容器环境变量)
--   docker cp apps/web/dba/0006_ai_readonly_role_and_rls.sql <pg容器>:/tmp/0006.sql
--   docker exec <pg容器> psql -U <超管用户> -d <库名> -v ON_ERROR_STOP=1 -f /tmp/0006.sql
--
--   # 本地开发(本地 PostgreSQL 超管通常为 postgres)
--   psql -U postgres -d starlens_dev -v ON_ERROR_STOP=1 \
--     -f apps/web/dba/0006_ai_readonly_role_and_rls.sql
--
-- 注意:下面的 GRANT 写死了应用数据库用户名 starlens(与 DATABASE_URL 中的用户一致)。
--       若你的环境使用不同用户名,请替换后再执行。
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlens_ai_readonly') THEN
    CREATE ROLE starlens_ai_readonly NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

-- 让应用数据库用户(连接串里的用户)能 SET ROLE 切进去,从而执行受限的只读 SQL
GRANT starlens_ai_readonly TO starlens;

-- 角色级默认查询超时,调用方代码忘显式 SET LOCAL statement_timeout 也有兜底
ALTER ROLE starlens_ai_readonly SET statement_timeout = '3000';
-- 只读会话,禁止这条连接内出现任何写操作(权限系统本身疏漏也有这层兜底)
ALTER ROLE starlens_ai_readonly SET default_transaction_read_only = on;

GRANT USAGE ON SCHEMA public TO starlens_ai_readonly;

-- 仅这三张表跟"仓库检索"相关,且都不含敏感数据
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

-- users / github_accounts / personal_api_tokens / user_ai_configs / ai_usage_logs
-- 故意不给 starlens_ai_readonly 任何授权——Postgres 默认拒绝,不需要显式 REVOKE。
