import { describe, expect, it } from "vitest";
import {
  buildRepoSummary,
  buildRepoSummaryDetails,
  buildSearchDocument,
  extractReadmeExcerpt,
} from "@/server/repos/text";

describe("repo text utilities", () => {
  it("extracts a compact README excerpt without markdown noise", () => {
    const excerpt = extractReadmeExcerpt(`
# Example

![logo](logo.png)

Use \`example\` to render **large lists** quickly.

\`\`\`ts
console.log("noise");
\`\`\`
`);

    expect(excerpt).toContain("Example");
    expect(excerpt).toContain("large lists");
    expect(excerpt).not.toContain("console.log");
    expect(excerpt).not.toContain("![logo]");
  });

  it("removes malformed HTML fragments from README excerpts", () => {
    const excerpt = extractReadmeExcerpt(`
<p align="center" <a href="https://librechat.ai">
<img src="client/public/assets/logo.svg"
<h1 align="center">LibreChat</h1>
`);

    expect(excerpt).toContain("LibreChat");
    expect(excerpt).not.toContain("<p");
    expect(excerpt).not.toContain("<img");
  });

  it("prefers a clear GitHub description for repo summary", () => {
    expect(
      buildRepoSummary({
        description: "React components for efficiently rendering large lists.",
        topics: ["react", "virtualization"],
        readmeExcerpt: "Long fallback",
      }),
    ).toBe("React components for efficiently rendering large lists.");
  });

  it("reports the text source used by generated summaries", () => {
    expect(
      buildRepoSummaryDetails({
        description: "",
        topics: ["react", "performance"],
        readmeExcerpt: "README fallback text",
        fullName: "owner/repo",
      }),
    ).toMatchObject({ source: "github_topics" });
  });

  it("builds search documents from metadata, tags, and notes", () => {
    const document = buildSearchDocument({
      fullName: "bvaughn/react-window",
      ownerLogin: "bvaughn",
      description: "Large list rendering",
      topics: ["react", "performance"],
      repoSummary: "Virtualized list library",
      tags: ["frontend"],
      note: "Use for table virtualization",
    });

    expect(document).toContain("bvaughn/react-window");
    expect(document).toContain("frontend");
    expect(document).toContain("table virtualization");
  });
});
