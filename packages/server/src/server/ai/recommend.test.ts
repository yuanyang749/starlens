// recommend_for_task 纯函数单元测试
// 中文注释：只测 parseAiRecommendOutput 和 buildRecommendSystemPrompt 两个纯函数。
// hasStarredRepos 依赖 DB，主入口 recommendForTask 还涉及 searchReposRanked + AI provider，
// 这些集成测试需要 DB mock，留作后续。
import { describe, expect, it } from "vitest";
import { buildRecommendSystemPrompt, parseAiRecommendOutput } from "./recommend";

describe("parseAiRecommendOutput", () => {
  it("returns null when raw is null", () => {
    // null 输入：直接返回 null
    expect(parseAiRecommendOutput(null)).toBeNull();
  });

  it("parses valid JSON with items array", () => {
    // 合法 JSON：items 数组正确解析
    const raw = JSON.stringify({
      items: [
        { id: "repo-1", reason: "适合做 RAG" },
        { id: "repo-2", reason: "向量数据库实现" },
      ],
    });
    const result = parseAiRecommendOutput(raw);
    expect(result).not.toBeNull();
    expect(result?.items).toHaveLength(2);
    expect(result?.items[0]).toEqual({ id: "repo-1", reason: "适合做 RAG" });
    expect(result?.items[1]).toEqual({ id: "repo-2", reason: "向量数据库实现" });
  });

  it("strips markdown code fence before parsing", () => {
    // ```json ... ``` 包裹：剥离后解析
    const raw = "```json\n{\"items\":[{\"id\":\"x\",\"reason\":\"y\"}]}\n```";
    const result = parseAiRecommendOutput(raw);
    expect(result?.items).toEqual([{ id: "x", reason: "y" }]);
  });

  it("returns null when raw is non-JSON", () => {
    // 非 JSON 字符串：返回 null（不抛错）
    expect(parseAiRecommendOutput("totally not json")).toBeNull();
  });

  it("returns null when parsed value has no items array", () => {
    // 解析成功但 items 不是数组：返回 null
    const raw = JSON.stringify({ items: "not-an-array" });
    expect(parseAiRecommendOutput(raw)).toBeNull();
  });

  it("filters out non-object elements in items", () => {
    // items 中非对象元素被过滤（字符串、数字、null 等）
    const raw = JSON.stringify({
      items: [
        { id: "valid", reason: "ok" },
        "string-item",
        123,
        null,
        { id: "also-valid", reason: "ok2" },
      ],
    });
    const result = parseAiRecommendOutput(raw);
    expect(result?.items).toEqual([
      { id: "valid", reason: "ok" },
      { id: "also-valid", reason: "ok2" },
    ]);
  });

  it("filters out items where id or reason is not a string", () => {
    // items 中 id/reason 非字符串的被过滤
    const raw = JSON.stringify({
      items: [
        { id: 123, reason: "numeric id" },        // id 非字符串
        { id: "valid", reason: 456 },              // reason 非字符串
        { id: "missing-reason" },                  // reason 缺失
        { id: "keep", reason: "valid reason" },    // 完整
      ],
    });
    const result = parseAiRecommendOutput(raw);
    expect(result?.items).toEqual([{ id: "keep", reason: "valid reason" }]);
  });

  it("trims reason strings", () => {
    // reason 会被 trim
    const raw = JSON.stringify({
      items: [{ id: "x", reason: "  padded reason  " }],
    });
    const result = parseAiRecommendOutput(raw);
    expect(result?.items[0]?.reason).toBe("padded reason");
  });

  it("accepts empty items array", () => {
    // 空 items 数组：返回空 items（候选都不相关时的合法响应）
    const raw = JSON.stringify({ items: [] });
    const result = parseAiRecommendOutput(raw);
    expect(result?.items).toEqual([]);
  });

  it("strips <think> blocks before parsing", () => {
    // <think>...</think> 块被剥离后再解析
    const raw = "<think>reasoning</think>\n{\"items\":[{\"id\":\"a\",\"reason\":\"b\"}]}";
    const result = parseAiRecommendOutput(raw);
    expect(result?.items).toEqual([{ id: "a", reason: "b" }]);
  });
});

describe("buildRecommendSystemPrompt", () => {
  it("mentions JSON output format and items field", () => {
    // system prompt 必须包含 JSON 与 items 关键字
    const prompt = buildRecommendSystemPrompt();
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("items");
  });

  it("instructs the model to only pick from candidates", () => {
    // system prompt 必须约束"只能从候选列表中选择"
    const prompt = buildRecommendSystemPrompt();
    expect(prompt).toContain("候选");
  });
});
