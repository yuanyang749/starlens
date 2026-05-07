import { describe, expect, it } from "vitest";
import { sanitizeSummaryText } from "@/components/workbench/workbench-formatters";

describe("workbench summary formatter", () => {
  it("strips malformed HTML-like fragments from AI summary text", () => {
    const sanitized = sanitizeSummaryText(`
<p align="center" <a href="https://librechat.ai">
<img src="client/public/assets/logo.svg"
<h1 align="center">LibreChat</h1>
English README.zh.md
`);

    expect(sanitized).toContain("LibreChat");
    expect(sanitized).toContain("English README.zh.md");
    expect(sanitized).not.toContain("<p");
    expect(sanitized).not.toContain("<img");
  });
});
