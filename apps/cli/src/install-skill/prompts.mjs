// 安装向导的交互式提示
import { createInterface } from "node:readline";
import { CliError } from "../errors.mjs";

// 控制字符常量（显式使用 \xNN 转义，避免源码中直接内嵌控制字节被工具链吞掉，
// 这是此前 Ctrl+C / Backspace 失效的根因）。
const CTRL_C = "\x03"; // Ctrl+C
const DEL = "\x7f"; // 现代终端 Backspace 键
const BS = "\x08"; // Ctrl+H（部分终端）
const CR = "\r";
const LF = "\n";

export function createReadlineInterface() {
  const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  // 行缓冲队列：有 waiter 就交付，否则入队；close 时用空串唤醒所有 waiter（走默认值）。
  // suppress 标志：wizardPromptSecret 在 TTY raw mode 读取时，readline 也会收到字符并 emit
  // 伪 'line' 事件（含 token 明文）。设 suppress=true 让 'line' handler 丢弃这些事件，
  // 防止 token 内容污染后续 wizardPrompt 的输入队列。
  const state = { queue: [], waiters: [], closed: false, suppress: false };
  rl.on("line", (line) => {
    if (state.suppress) return;
    if (state.waiters.length > 0) state.waiters.shift()(line);
    else state.queue.push(line);
  });
  rl.on("close", () => {
    state.closed = true;
    while (state.waiters.length > 0) state.waiters.shift()("");
  });
  rl._starlensPromptState = state;
  return rl;
}

// 普通文本提示，支持默认值。
export async function wizardPrompt(rl, question, defaultValue) {
  const hint = defaultValue ? ` [${defaultValue}]` : "";
  process.stdout.write(`${question}${hint}: `);
  const state = rl._starlensPromptState;
  const line = await new Promise((resolve) => {
    if (state) {
      if (state.queue.length > 0) resolve(state.queue.shift());
      else if (state.closed) resolve("");
      else state.waiters.push(resolve);
    } else {
      // 兼容外部传入的、未经 createReadlineInterface 包装的 rl
      rl.question("", (answer) => resolve(answer));
    }
  });
  const trimmed = (line ?? "").trim();
  return trimmed || defaultValue || "";
}

// 隐藏输入的密钥提示（TTY 下关闭回显）。
// 修复 #1：Ctrl+C 正确退出，Backspace/DEL 正确删除。
// 修复 #13：非 TTY 复用传入的 rl，避免与主 readline 抢占 stdin。
// 修复：TTY 模式结束后 resume stdin（而非 pause），否则后续 wizardPrompt 读不到输入；
//       同时设 suppress 标志，防止 readline 在 raw mode 期间收到 token 明文并 emit 伪 'line' 事件。
export async function wizardPromptSecret(question, rl) {
  const state = rl?._starlensPromptState;

  // TTY：raw mode 逐字符读取
  if (typeof process.stdin.setRawMode === "function") {
    return new Promise((resolve) => {
      process.stdout.write(`${question}: `);
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      let input = "";

      // 抑制 readline 的伪 'line' 事件（raw mode 下 readline 会收到 token 明文）
      if (state) state.suppress = true;

      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");

      const restore = () => {
        stdin.setRawMode(wasRaw ?? false);
        stdin.removeListener("data", onData);
        // resume（而非 pause）让后续 wizardPrompt 能继续读取 stdin
        stdin.resume();
        if (state) state.suppress = false;
      };

      const onData = (char) => {
        if (char === CR || char === LF) {
          restore();
          process.stdout.write("\n");
          resolve(input.trim());
        } else if (char === CTRL_C) {
          // Ctrl+C：恢复终端模式后退出
          restore();
          process.stdout.write("\n");
          process.exit(1);
        } else if (char === DEL || char === BS) {
          // Backspace / Delete：删除最后一个码点（不劈开代理对）
          if (input.length > 0) input = Array.from(input).slice(0, -1).join("");
        } else {
          input += char;
        }
      };

      stdin.on("data", onData);
    });
  }

  // 非 TTY：复用主 rl 的行缓冲队列，避免与 wizardPrompt 抢行/丢行
  if (!rl) {
    throw new CliError("wizardPromptSecret requires a readline interface in non-TTY mode.");
  }
  process.stdout.write(`${question}: `);
  const line = await new Promise((resolve) => {
    if (state) {
      if (state.queue.length > 0) resolve(state.queue.shift());
      else if (state.closed) resolve("");
      else state.waiters.push(resolve);
    } else {
      rl.question("", (answer) => resolve(answer));
    }
  });
  process.stdout.write("\n");
  return (line ?? "").trim();
}

// 多选复选框（TTY 下方向键 + 空格 + 回车；非 TTY 下逗号分隔序号）。
// 修复 #10：非 TTY 空输入时改为报错，而非静默选中第一项（CI 安全）。
// labels 参数：UI 原语提示文本（i18n），结构：{ selectPrompt, enterNumbersPrompt, noClientSelectedError, skillOnlyLabel }
export async function wizardCheckbox(items, labels) {
  const isTTY = typeof process.stdin.setRawMode === "function";
  const ui = labels ?? {
    selectPrompt: "Select AI clients (↑↓ move, space toggle, enter confirm):",
    enterNumbersPrompt: "Enter numbers (comma-separated, e.g. 1,2): ",
    noClientSelectedError: "No client selected. Pass --client <names> for non-interactive use.",
    skillOnlyLabel: "[Skill only]",
  };

  if (!isTTY) {
    const rendered = items.map((it, i) => `  ${i + 1}) ${it.label}${it.skillOnly ? ` ${ui.skillOnlyLabel}` : ""}`).join("\n");
    console.log(rendered);
    const rl = createReadlineInterface();
    return new Promise((resolve, reject) => {
      rl.question(ui.enterNumbersPrompt, (answer) => {
        rl.close();
        const selected = answer
          .trim()
          .split(",")
          .map((s) => {
            const n = parseInt(s.trim(), 10);
            return items[n - 1]?.value ?? null;
          })
          .filter(Boolean);
        if (selected.length === 0) {
          reject(new CliError(ui.noClientSelectedError));
          return;
        }
        resolve(selected);
      });
    });
  }

  return new Promise((resolve) => {
    let cursor = 0;
    const selected = new Set([items[0].value]); // 默认选中第一项

    const RESET = "\x1b[0m";
    const BOLD = "\x1b[1m";
    const CYAN = "\x1b[36m";
    const DIM = "\x1b[2m";

    function render() {
      // 清除之前的输出行
      process.stdout.write("\x1b[" + items.length + "A\x1b[0J");
      for (let i = 0; i < items.length; i += 1) {
        const item = items[i];
        const isActive = i === cursor;
        const isSelected = selected.has(item.value);
        const icon = isSelected ? "◉" : "◯";
        const label = item.label + (item.skillOnly ? `  ${DIM}${ui.skillOnlyLabel}${RESET}` : "");
        const line = isActive ? `${BOLD}${CYAN}> ${icon} ${label}${RESET}` : `  ${icon} ${label}`;
        process.stdout.write(line + "\n");
      }
    }

    // 初次渲染
    console.log(`${ui.selectPrompt}\n`);
    for (let i = 0; i < items.length; i += 1) {
      process.stdout.write("\n");
    }
    render();

    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const onData = (chunk) => {
      if (chunk === "\x1b[A") {
        // 上箭头
        cursor = (cursor - 1 + items.length) % items.length;
        render();
      } else if (chunk === "\x1b[B") {
        // 下箭头
        cursor = (cursor + 1) % items.length;
        render();
      } else if (chunk === " ") {
        // 空格切换
        const val = items[cursor].value;
        if (selected.has(val)) selected.delete(val);
        else selected.add(val);
        render();
      } else if (chunk === CR || chunk === LF) {
        // 回车确认
        stdin.setRawMode(false);
        stdin.removeListener("data", onData);
        stdin.pause();
        process.stdout.write("\n");
        const result = items.map((it) => it.value).filter((v) => selected.has(v));
        resolve(result.length > 0 ? result : [items[0].value]);
      } else if (chunk === CTRL_C) {
        // Ctrl+C
        stdin.setRawMode(false);
        process.stdout.write("\n");
        process.exit(1);
      }
    };

    stdin.on("data", onData);
  });
}

export function maskToken(token) {
  if (!token || token.length < 8) return "***";
  return token.slice(0, 4) + "..." + token.slice(-3);
}
