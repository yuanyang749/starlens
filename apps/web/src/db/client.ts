import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let db: DbClient | null = null;

export function getDb() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to use the database.");
  }

  if (!db) {
    // 连接池配置:配合 PostgreSQL max_connections=100
    // 单进程 max=20,留余量给其他客户端(1Panel、migrator 等)
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 20,                      // 连接池最大连接数
      idleTimeoutMillis: 30000,     // 空闲连接 30 秒后释放
      connectionTimeoutMillis: 2000, // 建连超时 2 秒,快速失败
    });
    db = drizzle(pool, { schema });
  }

  return db;
}
