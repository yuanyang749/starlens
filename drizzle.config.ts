import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "drizzle-kit";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  schema: resolve(projectRoot, "packages/server/src/db/schema.ts"),
  out: resolve(projectRoot, "apps/web/drizzle"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
