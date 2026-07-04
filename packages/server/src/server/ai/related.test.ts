// find_related 纯函数单元测试
// 中文注释：只测 parseAiRelatedOutput 纯函数。resolveTargetRepo/recallBy* 依赖 DB，
// 主入口 findRelated 还涉及 AI provider——这些留作集成测试。
import { describe, expect, it } from "vitest";
import { parseAiRelatedOutput } from "./related";

describe("parseAiRelatedOutput", () => {
  it("returns null when raw is null", () => {
    // null 输入：返回 null
    expect(parseAiRelatedOutput(null)).toBeNull();
  });

  it("parses valid JSON with items array", () => {
    // 合法 JSON：items 数组正确解析，relation 字段被保留
    const raw = JSON.stringify({
      items: [
        { id: "repo-1", relation: "同 owner" },
        { id: "repo-2", relation: "同 topic: rag" },
      ],
    });
    const result = parseAiRelatedOutput(raw);
    expect(result).not.toBeNull();
    expect(result?.items).toHaveLength(2);
    expect(result?.items[0]).toEqual({ id: "repo-1", relation: "同 owner" });
    expect(result?.items[1]).toEqual({ id: "repo-2", relation: "同 topic: rag" });
  });

  it("returns null when raw is non-JSON", () => {
    // 非 JSON 字符串：返回 null
    expect(parseAiRelatedOutput("not json at all")).toBeNull();
  });

  it("returns null when parsed value has no items array", () => {
    // 解析成功但 items 不是数组：返回 null
    const raw = JSON.stringify({ items: "string" });
    expect(parseAiRelatedOutput(raw)).toBeNull();
  });

  it("filters out non-object elements in items", () => {
    // items 中非对象元素被过滤
    const raw = JSON.stringify({
      items: [
        { id: "valid", relation: "ok" },
        "string",
        42,
        null,
        { id: "also-valid", relation: "ok2" },
      ],
    });
    const result = parseAiRelatedOutput(raw);
    expect(result?.items).toEqual([
      { id: "valid", relation: "ok" },
      { id: "also-valid", relation: "ok2" },
    ]);
  });

  it("filters out items where id or relation is not a string", () => {
    // items 中 id/relation 非字符串的被过滤
    const raw = JSON.stringify({
      items: [
        { id: 1, relation: "numeric id" },          // id 非字符串
        { id: "valid", relation: 99 },               // relation 非字符串
        { id: "missing-relation" },                  // relation 缺失
        { id: "keep", relation: "valid relation" },  // 完整
      ],
    });
    const result = parseAiRelatedOutput(raw);
    expect(result?.items).toEqual([{ id: "keep", relation: "valid relation" }]);
  });

  it("trims relation strings", () => {
    // relation 会被 trim
    const raw = JSON.stringify({
      items: [{ id: "x", relation: "  padded relation  " }],
    });
    const result = parseAiRelatedOutput(raw);
    expect(result?.items[0]?.relation).toBe("padded relation");
  });

  it("strips markdown code fence before parsing", () => {
    // ```json ... ``` 包裹：剥离后解析
    const raw = "```json\n{\"items\":[{\"id\":\"a\",\"relation\":\"b\"}]}\n```";
    const result = parseAiRelatedOutput(raw);
    expect(result?.items).toEqual([{ id: "a", relation: "b" }]);
  });

  it("strips <think> blocks before parsing", () => {
    // <think>...</think> 块被剥离后再解析
    const raw = "<think>thinking</think>{\"items\":[{\"id\":\"a\",\"relation\":\"b\"}]}";
    const result = parseAiRelatedOutput(raw);
    expect(result?.items).toEqual([{ id: "a", relation: "b" }]);
  });

  it("accepts empty items array", () => {
    // 空 items 数组：合法响应（候选都不相关）
    const raw = JSON.stringify({ items: [] });
    const result = parseAiRelatedOutput(raw);
    expect(result?.items).toEqual([]);
  });
});
