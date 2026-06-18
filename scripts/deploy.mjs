#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const envFile = resolve(process.cwd(), ".deploy.env");
if (!existsSync(envFile)) {
  console.error("Missing .deploy.env — copy .deploy.env.example and fill in your values.");
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(envFile, "utf8")
    .split("\n")
    .filter(l => l.trim() && !l.startsWith("#"))
    .map(l => l.split("=").map(s => s.trim()))
    .filter(([k]) => k)
);

const host = env.DEPLOY_HOST;
const dir  = env.DEPLOY_DIR ?? "/opt/starlens";
const script = env.DEPLOY_SCRIPT ?? "deploy.sh";

if (!host) {
  console.error("DEPLOY_HOST is not set in .deploy.env");
  process.exit(1);
}

console.log(`Deploying to ${host}:${dir} ...`);
const cmd = `cd ${dir} && bash ${script}`;
spawn("ssh", [host, cmd], { stdio: "inherit" }).on("close", code => process.exit(code));
