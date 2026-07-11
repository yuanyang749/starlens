#!/usr/bin/env node

// CLI 入口：仅在直接执行时运行 main()。
// 修复 #6：用 pathToFileURL 规范化比较，Windows 上 file:///C:/... 与 C:\... 不再失配。
// 修复 #28：非 Error 抛出时打印字符串而非 undefined。
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { CliError } from "./errors.mjs";
import { main } from "./main.mjs";

function isMainEntry() {
  try {
    const realPath = realpathSync(process.argv[1]);
    const realUrl = pathToFileURL(realPath).href;
    return import.meta.url === realUrl;
  } catch {
    return false;
  }
}

if (isMainEntry()) {
  main().catch((error) => {
    if (error instanceof CliError) {
      console.error(error.message);
    } else if (error instanceof Error) {
      console.error(error.stack || error.message);
    } else {
      console.error(String(error));
    }
    process.exitCode = error?.exitCode ?? 1;
  });
}

export { main } from "./main.mjs";
export { CliError } from "./errors.mjs";
export { appendTomlSection } from "./install-mcp/mcp-config.mjs";
