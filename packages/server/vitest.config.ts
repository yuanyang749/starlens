import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // 中文注释：默认只跑纯函数单测（src/**/*.test.ts），集成测试用 .integration.test.ts 后缀并通过
    // `pnpm test:integration` 单独触发。setupFiles 加载 .env，让集成测试能拿到 DATABASE_URL 等。
    include: ["src/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
  },
  resolve: {
    alias: {
      // "server-only" 包在测试环境中会抛错，用空模块替代
      "server-only": new URL("./test/stubs/server-only.ts", import.meta.url).pathname,
    },
  },
});
