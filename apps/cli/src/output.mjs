// 输出：JSON、表格（CJK/emoji 宽度感知）、spinner
// 修复：原实现用 String.length（UTF-16 码元数）算列宽，
// CJK 字符占 2 列却算 1，导致中文/emoji 列实际溢出、表格错位。

// CJK 与全角字符宽度为 2 的范围（含谚文、平假名、片假名、CJK 统一汉字、全角符号等）
const WIDE_RANGES = /[\u1100-\u115F\u2329-\u232A\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uA960-\uA97F\uAC00-\uD7A3\uF900-\uFAFF\uFE10-\uFE19\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;
// 常见 emoji 区间
const EMOJI_RANGES = /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F02F}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}]/u;

// 计算字符串在终端中的显示宽度（按码点遍历，正确处理代理对）。
export function displayWidth(str) {
  let w = 0;
  for (const ch of String(str ?? "")) {
    if (WIDE_RANGES.test(ch) || EMOJI_RANGES.test(ch)) w += 2;
    else w += 1;
  }
  return w;
}

// 按显示宽度截断字符串，不会劈开代理对。
// 仅当显示宽度严格超过 width 时才截断（与原版 length > width 语义一致）。
export function truncate(value, width) {
  const text = String(value ?? "");
  if (displayWidth(text) <= width) return text;
  let w = 0;
  let out = "";
  for (const ch of text) {
    const cw = WIDE_RANGES.test(ch) || EMOJI_RANGES.test(ch) ? 2 : 1;
    if (w + cw > width - 1) {
      return `${out}…`;
    }
    out += ch;
    w += cw;
  }
  return out;
}

// 按显示宽度右填充（padEnd 的宽度感知版本）。
export function padEnd(value, width) {
  const text = String(value ?? "");
  const pad = Math.max(0, width - displayWidth(text));
  return text + " ".repeat(pad);
}

export function outputJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

// 渲染表格。columns: [{ key, label, maxWidth? }]；rows: [{ key: value }]。
export function printTable(rows, columns) {
  if (rows.length === 0) {
    console.log("No results.");
    return;
  }

  const tty = process.stdout.isTTY;
  const BOLD = tty ? "\x1b[1m" : "";
  const DIM = tty ? "\x1b[2m" : "";
  const RESET = tty ? "\x1b[0m" : "";

  const widths = columns.map((column) =>
    Math.min(
      column.maxWidth ?? 32,
      Math.max(
        displayWidth(column.label),
        ...rows.map((row) => displayWidth(row[column.key] ?? "")),
      ),
    ),
  );

  const line = (row) =>
    columns
      .map((column, index) => padEnd(truncate(row[column.key] ?? "", widths[index]), widths[index]))
      .join("  ")
      .trimEnd();

  console.log(BOLD + line(Object.fromEntries(columns.map((column) => [column.key, column.label]))) + RESET);
  console.log(DIM + widths.map((width) => "-".repeat(width)).join("  ") + RESET);
  for (const row of rows) console.log(line(row));
}

// 终端 spinner（仅 TTY 输出到 stderr）。
export function startSpinner(message) {
  if (!process.stderr.isTTY) return null;
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  process.stderr.write(`${frames[0]} ${message}`);
  const id = setInterval(() => {
    process.stderr.write(`\r${frames[i++ % frames.length]} ${message}`);
  }, 80);
  return id;
}

export function stopSpinner(id) {
  if (!id) return;
  clearInterval(id);
  process.stderr.write("\r\x1b[K"); // 清除 spinner 行
}
