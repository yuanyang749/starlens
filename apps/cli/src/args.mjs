// 参数解析：全局选项、search 选项、通用 readOption/readFlag
import { CliError } from "./errors.mjs";
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_RETRIES,
  DEFAULT_PAGE_SIZE,
  MIN_TIMEOUT_MS,
  defaultTokenPath,
} from "./config.mjs";

export const VALID_FORMATS = ["table", "json"];
export const VALID_SORTS = ["relevance", "recent", "stars", "updated"];

// 从 args 中读取某个 --name 选项（支持 --name value 与 --name=value 两种形式）。
// 返回 { value: 最后一次出现的值, rest: 其余参数 }。
export function readOption(args, name) {
  const values = [];
  const rest = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === name) {
      const value = args[index + 1];
      // 显式拒绝以 -- 开头的值，避免误吞下一个选项
      if (value === undefined || value.startsWith("--")) {
        throw new CliError(`${name} requires a value.`);
      }
      values.push(value);
      index += 1;
    } else if (arg.startsWith(`${name}=`)) {
      values.push(arg.slice(name.length + 1));
    } else {
      rest.push(arg);
    }
  }

  return { value: values.at(-1), rest };
}

// 读取布尔标志 --name（不接受值，--name=value 视为错误）。
export function readFlag(args, name) {
  let found = false;
  const rest = [];

  for (const arg of args) {
    if (arg === name) {
      found = true;
    } else if (arg.startsWith(`${name}=`)) {
      throw new CliError(`${name} does not take a value.`);
    } else {
      rest.push(arg);
    }
  }

  return { found, rest };
}

// 解析整数选项，附带范围校验。
export function parseNumber(value, fallback, name, { min = 0 } = {}) {
  if (value === undefined || value === "") return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || !Number.isInteger(number) || number < min) {
    throw new CliError(`${name} must be an integer greater than or equal to ${min}.`);
  }
  return number;
}

// 解析全局选项（--format / --api-base-url / --token-path / --timeout-ms / --retries）。
// 这些选项可出现在任意位置，因此先从 argv 中剥离出来。
export function parseGlobalOptions(args, env = process.env) {
  let rest = [...args];
  const option = (name) => {
    const parsed = readOption(rest, name);
    rest = parsed.rest;
    return parsed.value;
  };

  const format = option("--format") ?? env.STARLENS_FORMAT ?? "table";
  if (!VALID_FORMATS.includes(format)) {
    throw new CliError(`--format must be one of: ${VALID_FORMATS.join(", ")}.`);
  }

  const apiBaseUrl = (option("--api-base-url") ?? env.STARLENS_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, "");
  const tokenPath = option("--token-path") ?? env.STARLENS_TOKEN_PATH ?? defaultTokenPath();
  const timeoutMs = parseNumber(
    option("--timeout-ms") ?? env.STARLENS_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    "--timeout-ms",
    { min: MIN_TIMEOUT_MS },
  );
  const retries = parseNumber(option("--retries") ?? env.STARLENS_RETRIES, DEFAULT_RETRIES, "--retries", { min: 0 });

  return {
    args: rest,
    config: { apiBaseUrl, tokenPath, timeoutMs, retries, format },
  };
}

// 解析 search 子命令的过滤/分页选项，并做客户端校验，给出友好错误。
export function searchOptions(args) {
  let rest = [...args];
  const option = (name) => {
    const parsed = readOption(rest, name);
    rest = parsed.rest;
    return parsed.value;
  };

  const sort = option("--sort");
  if (sort !== undefined && !VALID_SORTS.includes(sort)) {
    throw new CliError(`--sort must be one of: ${VALID_SORTS.join(", ")}.`);
  }

  const favorite = option("--favorite");
  if (favorite !== undefined && !["true", "false"].includes(favorite)) {
    throw new CliError("--favorite must be true or false.");
  }

  const page = option("--page");
  if (page !== undefined) {
    parseNumber(page, undefined, "--page", { min: 1 });
  }
  const pageSize = option("--page-size") ?? DEFAULT_PAGE_SIZE;
  parseNumber(pageSize, DEFAULT_PAGE_SIZE, "--page-size", { min: 1 });

  return {
    args: rest,
    query: {
      page,
      pageSize,
      sort,
      language: option("--language"),
      owner: option("--owner"),
      tag: option("--tag"),
      favorite,
    },
  };
}
