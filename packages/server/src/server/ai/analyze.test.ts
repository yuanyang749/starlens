// analyze_repo 纯函数单元测试
// 中文注释：只测 parseAiOutput / buildAnalyzeSystemPrompt / buildAnalyzeUserPrompt 三个纯函数，
// 不依赖 DB 也不调用 AI provider——主入口 analyzeRepo 涉及 DB + 网络的集成测试留待后续。
import { describe, expect, it } from "vitest";
import {
  buildAnalyzeSystemPrompt,
  buildAnalyzeUserPrompt,
  parseAiOutput,
  type RepoSnapshot,
} from "./analyze";

const fallback: RepoSnapshot = {
  id: "repo-1",
  fullName: "owner/repo",
  description: "A test repo description",
  htmlUrl: "https://github.com/owner/repo",
  stargazersCount: 100,
  language: "TypeScript",
  topics: ["ai", "tools"],
  readmeExcerpt: "readme content here",
  repoSummary: "repo summary text",
  isStarred: true,
};

describe("parseAiOutput", () => {
  it("returns fallback when raw is null", () => {
    // null 输入：summary 取 repoSummary || description || fullName
    const result = parseAiOutput(null, fallback);
    expect(result.summary).toBe("repo summary text");
    expect(result.suitableFor).toBe("");
    expect(result.suggestedTags).toEqual([]);
    expect(result.suggestedNote).toBe("");
  });

  it("parses valid JSON string into structured output", () => {
    // 合法 JSON：四个字段都正确解析
    const raw = JSON.stringify({
      summary: "一个测试仓库",
      suitableFor: "适合用于测试",
      suggestedTags: ["test", "demo"],
      suggestedNote: "值得收藏用于回归测试",
    });
    const result = parseAiOutput(raw, fallback);
    expect(result.summary).toBe("一个测试仓库");
    expect(result.suitableFor).toBe("适合用于测试");
    expect(result.suggestedTags).toEqual(["test", "demo"]);
    expect(result.suggestedNote).toBe("值得收藏用于回归测试");
  });

  it("strips markdown code fence before parsing", () => {
    // ```json ... ``` 包裹：应剥离 code fence 后解析
    const raw = "```json\n{\"summary\":\"fenced\",\"suitableFor\":\"\",\"suggestedTags\":[\"x\"],\"suggestedNote\":\"\"}\n```";
    const result = parseAiOutput(raw, fallback);
    expect(result.summary).toBe("fenced");
    expect(result.suggestedTags).toEqual(["x"]);
  });

  it("strips code fence without json language hint", () => {
    // 不带 json 语言标记的 ``` 围栏也要能剥离
    const raw = "```\n{\"summary\":\"plain-fence\",\"suitableFor\":\"\",\"suggestedTags\":[],\"suggestedNote\":\"\"}\n```";
    const result = parseAiOutput(raw, fallback);
    expect(result.summary).toBe("plain-fence");
  });

  it("falls back to repoSummary when raw is non-JSON", () => {
    // 非 JSON 字符串：降级为 fallback，不抛错
    const result = parseAiOutput("not a json string", fallback);
    expect(result.summary).toBe("repo summary text");
    expect(result.suitableFor).toBe("");
    expect(result.suggestedTags).toEqual([]);
    expect(result.suggestedNote).toBe("");
  });

  it("truncates suggestedTags to 5 entries", () => {
    // suggestedTags 超过 5 个时截断到 5
    const raw = JSON.stringify({
      summary: "s",
      suitableFor: "",
      suggestedTags: ["a", "b", "c", "d", "e", "f", "g"],
      suggestedNote: "",
    });
    const result = parseAiOutput(raw, fallback);
    expect(result.suggestedTags).toHaveLength(5);
    expect(result.suggestedTags).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("filters out non-string elements in suggestedTags", () => {
    // suggestedTags 非字符串元素被过滤
    const raw = JSON.stringify({
      summary: "s",
      suitableFor: "",
      suggestedTags: ["valid", 123, null, true, { x: 1 }, "also-valid"],
      suggestedNote: "",
    });
    const result = parseAiOutput(raw, fallback);
    expect(result.suggestedTags).toEqual(["valid", "also-valid"]);
  });

  it("filters out empty/whitespace-only tags", () => {
    // 空白字符串标签被过滤
    const raw = JSON.stringify({
      summary: "s",
      suitableFor: "",
      suggestedTags: ["keep", "   ", ""],
      suggestedNote: "",
    });
    const result = parseAiOutput(raw, fallback);
    expect(result.suggestedTags).toEqual(["keep"]);
  });

  it("lowercases all suggestedTags", () => {
    // suggestedTags 被转为小写
    const raw = JSON.stringify({
      summary: "s",
      suitableFor: "",
      suggestedTags: ["React", "TypeScript", "AI-Tools"],
      suggestedNote: "",
    });
    const result = parseAiOutput(raw, fallback);
    expect(result.suggestedTags).toEqual(["react", "typescript", "ai-tools"]);
  });

  it("uses fallback when summary is empty string", () => {
    // summary 为空字符串时用 fallback（repoSummary || description || fullName）
    const raw = JSON.stringify({
      summary: "",
      suitableFor: "still parsed",
      suggestedTags: [],
      suggestedNote: "",
    });
    const result = parseAiOutput(raw, fallback);
    expect(result.summary).toBe("repo summary text");
    expect(result.suitableFor).toBe("still parsed");
  });

  it("uses fallback description when repoSummary is empty", () => {
    // repoSummary 为空时 fallback 到 description
    const fallbackNoSummary: RepoSnapshot = { ...fallback, repoSummary: "" };
    const result = parseAiOutput(null, fallbackNoSummary);
    expect(result.summary).toBe("A test repo description");
  });

  it("uses fallback fullName when both repoSummary and description are empty", () => {
    // repoSummary 和 description 都空时 fallback 到 fullName
    const fallbackSparse: RepoSnapshot = { ...fallback, repoSummary: "", description: "" };
    const result = parseAiOutput(null, fallbackSparse);
    expect(result.summary).toBe("owner/repo");
  });

  it("strips <think> blocks before parsing", () => {
    // provider 的 stripThinkBlocks 会移除 <think>...</think>，parseAiOutput 内部调用它
    const raw = "<think>let me think</think>\n{\"summary\":\"after-think\",\"suitableFor\":\"\",\"suggestedTags\":[],\"suggestedNote\":\"\"}";
    const result = parseAiOutput(raw, fallback);
    expect(result.summary).toBe("after-think");
  });
});

describe("buildAnalyzeSystemPrompt", () => {
  it("mentions JSON output format and suggestedTags field", () => {
    // system prompt 必须包含 JSON 与 suggestedTags 关键字
    const prompt = buildAnalyzeSystemPrompt();
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("suggestedTags");
  });

  it("mentions max 5 tags constraint", () => {
    // 严格规则中应有"最多 5 个"的约束
    const prompt = buildAnalyzeSystemPrompt();
    expect(prompt).toContain("5");
  });
});

describe("buildAnalyzeUserPrompt", () => {
  it("includes fullName, stars, and language", () => {
    // user prompt 必须包含 fullName、stars、language
    const prompt = buildAnalyzeUserPrompt(fallback);
    expect(prompt).toContain("owner/repo");
    expect(prompt).toContain("Stars: 100");
    expect(prompt).toContain("TypeScript");
  });

  it("includes description, repoSummary, readmeExcerpt, and topics when present", () => {
    // 各字段存在时都应进入 prompt
    const prompt = buildAnalyzeUserPrompt(fallback);
    expect(prompt).toContain("A test repo description");
    expect(prompt).toContain("repo summary text");
    expect(prompt).toContain("readme content here");
    expect(prompt).toContain("ai, tools");
  });

  it("omits description/repoSummary/readme lines when absent", () => {
    // 字段为空时不应出现对应行
    const sparse: RepoSnapshot = {
      ...fallback,
      description: "",
      repoSummary: "",
      readmeExcerpt: "",
      topics: [],
    };
    const prompt = buildAnalyzeUserPrompt(sparse);
    expect(prompt).not.toContain("简介:");
    expect(prompt).not.toContain("摘要:");
    expect(prompt).not.toContain("README 摘录");
    expect(prompt).not.toContain("Topics:");
  });

  it("truncates readmeExcerpt to 1500 characters", () => {
    // 超过 1500 字符的 README 摘录应被截断
    const longExcerpt = "x".repeat(3000);
    const snapshot: RepoSnapshot = { ...fallback, readmeExcerpt: longExcerpt };
    const prompt = buildAnalyzeUserPrompt(snapshot);
    // 截断后 README 摘录部分应为前 1500 字符
    expect(prompt).toContain("x".repeat(1500));
    expect(prompt).not.toContain("x".repeat(1501));
  });

  it("shows unknown language label when language is empty", () => {
    // language 为空时显示 unknown
    const snapshot: RepoSnapshot = { ...fallback, language: "" };
    const prompt = buildAnalyzeUserPrompt(snapshot);
    expect(prompt).toContain("unknown");
  });
});
