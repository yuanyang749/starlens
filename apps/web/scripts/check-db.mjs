#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";

const envFile = process.argv[2];
if (!envFile) {
  console.error("Usage: node scripts/check-db.mjs <env-file>");
  process.exit(1);
}

const envPath = resolve(process.cwd(), envFile);
if (!existsSync(envPath)) {
  console.error(`Environment file not found: ${envPath}`);
  process.exit(1);
}

const env = { ...process.env };
for (const rawLine of readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) continue;

  const index = line.indexOf("=");
  if (index === -1) continue;

  const key = line.slice(0, index).trim();
  let value = line.slice(index + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  env[key] = value;
}

if (!env.DATABASE_URL) {
  console.error(`DATABASE_URL is missing in ${envPath}`);
  process.exit(1);
}

const expectedTables = [
  "github_accounts",
  "personal_api_tokens",
  "repo_notes",
  "repo_tags",
  "starred_repos",
  "user_ai_configs",
  "users",
];

const pool = new Pool({ connectionString: env.DATABASE_URL });

try {
  const database = await pool.query("select current_database() as name, current_user as user");
  const tables = await pool.query(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1)
      order by table_name`,
    [expectedTables],
  );

  const foundTables = tables.rows.map((row) => row.table_name);
  const missingTables = expectedTables.filter((table) => !foundTables.includes(table));

  console.log(JSON.stringify({
    ok: missingTables.length === 0,
    database: database.rows[0].name,
    user: database.rows[0].user,
    tables: foundTables.length,
    missingTables,
  }));

  process.exit(missingTables.length === 0 ? 0 : 1);
} finally {
  await pool.end();
}
