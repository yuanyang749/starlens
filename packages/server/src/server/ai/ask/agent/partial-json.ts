// partial-JSON 提取器
// 职责：从流式累积的 submit_answer 工具参数 JSON 中提取 "answer" 字段的字符串值。
// 用于 SSE 流式端点——submit_answer 的 arguments 是逐 chunk 到达的不完整 JSON，
// 需要在不完整状态下尽可能提取已到达的 answer 文本，实现逐字流式输出。
//
// 不引入第三方依赖，用状态机实现。仅处理我们需要的一种结构：{"answer": "...", "repoIds": [...]}
// answer 字段必须是字符串，且通常是第一个 key。

// 中文注释：从累积的（可能不完整的）JSON 字符串中提取 answer 字段的字符串值内容。
// 返回已接收的 answer 文本（已反转义），若 answer 字段尚未开始或尚未到字符串内容则返回 null。
export function extractAnswerString(accumulated: string): string | null {
  // 定位 "answer" 键
  const keyPattern = /"answer"\s*:\s*"/;
  const keyMatch = accumulated.match(keyPattern);
  if (!keyMatch) return null;
  if (keyMatch.index === undefined) return null;

  const contentStart = keyMatch.index + keyMatch[0].length;
  return readJsonStringContent(accumulated, contentStart);
}

// 中文注释：从 startPos 开始读取 JSON 字符串内容（已跳过开头的引号），
// 处理转义序列，直到遇到未转义的闭合引号或字符串结束（不完整）。
function readJsonStringContent(text: string, startPos: number): string {
  let result = "";
  let i = startPos;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "\\") {
      // 转义序列：需要至少 2 个字符
      if (i + 1 >= text.length) break; // 转义不完整，停止
      const next = text[i + 1];
      switch (next) {
        case '"': result += '"'; break;
        case "\\": result += "\\"; break;
        case "/": result += "/"; break;
        case "n": result += "\n"; break;
        case "t": result += "\t"; break;
        case "r": result += "\r"; break;
        case "b": result += "\b"; break;
        case "f": result += "\f"; break;
        case "u": {
          // \uXXXX 需要 4 个十六进制字符
          const hex = text.slice(i + 2, i + 6);
          if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
            // 不完整或非法，停止
            i = text.length;
            continue;
          }
          result += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        default: result += next; break;
      }
      i += 2;
      continue;
    }
    if (ch === '"') {
      // 未转义的闭合引号——字符串完整结束
      break;
    }
    result += ch;
    i += 1;
  }
  return result;
}
