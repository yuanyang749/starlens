import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // "server-only" 包在测试环境中会抛错，用空模块替代
      "server-only": new URL("./test/stubs/server-only.ts", import.meta.url).pathname,
    },
  },
});
