#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import { dirname, extname, join, normalize, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const CURRENT_DOCS_BASE = [
  "README.md",
  "README.zh-CN.md",
  "CONTRIBUTING.md",
  "docs/README.md",
  "docs/agent-integration.md",
  "docs/api-contract.md",
  "docs/database-schema.md",
  "docs/environments.md",
];

async function collectMarkdownFiles(relativeDirectory) {
  const output = [];
  const visit = async (directory) => {
    for (const entry of await readdir(join(ROOT, directory), { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) output.push(child);
    }
  };
  await visit(relativeDirectory);
  return output;
}

const CURRENT_DOCS = [...new Set([
  ...CURRENT_DOCS_BASE,
  ...await collectMarkdownFiles("apps/web/src/app/docs"),
  ...await collectMarkdownFiles("skills/starlens"),
])].sort();

const RETIRED_PATTERNS = [
  { pattern: /stars install-skill/g, replacement: "stars setup" },
  { pattern: /docs\/project-plan\.md/g, replacement: "docs/archive/project-plan.md" },
  { pattern: /docs\/sync-flow-design\.md/g, replacement: "docs/README.md" },
  { pattern: /agent-skills\/starlens/g, replacement: "skills/starlens" },
  { pattern: /8 intent types/g, replacement: "the tool-calling Agent flow" },
  { pattern: /8 种意图/g, replacement: "工具调用 Agent 链路" },
];

const errors = [];

function isExternalOrRuntimeLink(target) {
  return (
    !target
    || target.startsWith("#")
    || target.startsWith("/")
    || target.startsWith("http://")
    || target.startsWith("https://")
    || target.startsWith("mailto:")
    || target.startsWith("tel:")
    || target.includes("{")
    || target.includes("}")
  );
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function normalizeMarkdownTarget(rawTarget) {
  const withoutTitle = rawTarget.trim().replace(/^<|>$/g, "").split(/\s+[\"']/)[0];
  return decodeURIComponent(withoutTitle.split("#", 1)[0].split("?", 1)[0]);
}

for (const file of CURRENT_DOCS) {
  const absoluteFile = join(ROOT, file);
  const content = await readFile(absoluteFile, "utf8");

  for (const { pattern, replacement } of RETIRED_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) {
      errors.push(`${file}: retired text found (${pattern.source}); use ${replacement}`);
    }
  }

  const linkPattern = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of content.matchAll(linkPattern)) {
    const target = normalizeMarkdownTarget(match[1]);
    if (isExternalOrRuntimeLink(target)) continue;

    const candidate = normalize(resolve(dirname(absoluteFile), target));
    const candidateRelative = relative(ROOT, candidate);
    if (candidateRelative.startsWith("..")) {
      errors.push(`${file}: link escapes repository root: ${target}`);
      continue;
    }

    if (await pathExists(candidate)) continue;

    // Extensionless repository links may intentionally point to Markdown files.
    if (!extname(candidate) && await pathExists(`${candidate}.md`)) continue;

    errors.push(`${file}: missing relative link target: ${target}`);
  }
}

if (errors.length > 0) {
  console.error("Documentation check failed:\n");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log(`Documentation check passed (${CURRENT_DOCS.length} current files).`);
}
