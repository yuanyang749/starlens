#!/usr/bin/env node

const helpText = [
  "Starlens CLI scaffold is ready.",
  "Planned commands:",
  "  stars login --token <token>",
  "  stars sync",
  "  stars search \"<query>\"",
  "  stars show <repo-or-id>",
  "  stars open <repo-or-id>",
  "  stars ask \"<question>\"",
].join("\n");

console.log(helpText);
