#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const separatorIndex = process.argv.indexOf("--");
if (separatorIndex === -1 || separatorIndex < 3) {
  console.error("Usage: node scripts/with-env.mjs <env-file> -- <command> [args...]");
  process.exit(1);
}

const envPath = resolve(process.cwd(), process.argv[2]);
if (!existsSync(envPath)) {
  console.error(`Environment file not found: ${envPath}`);
  process.exit(1);
}

const command = process.argv[separatorIndex + 1];
const commandArgs = process.argv.slice(separatorIndex + 2);
if (!command) {
  console.error("Command is required after --.");
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

const child = spawn(command, commandArgs, {
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 1);
});
