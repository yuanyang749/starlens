// 仓库解析与写操作辅助
// 修复 #4：写操作不再静默选中"搜索唯一结果"。requireExact=true 时
// 必须命中精确 fullName/id，否则报错，避免误改错误的仓库。
import { spawn } from "node:child_process";
import { CliError } from "./errors.mjs";
import { apiRequest } from "./api.mjs";

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

// 判断输入是否为 owner/repo 格式（且不像 UUID）。
function looksLikeOwnerRepo(repoOrId) {
  return /^[^/]+\/[^/]+$/.test(repoOrId) && !UUID_RE.test(repoOrId);
}

// 解析仓库：先尝试按 id 直接查询，再回退到搜索。
// - requireExact=false（读操作 show/open）：允许"搜索唯一结果"自动命中
// - requireExact=true（写操作 favorite/note/tag）：必须精确匹配 fullName 或 id
export async function resolveRepo(repoOrId, config, { requireExact = false } = {}) {
  // owner/repo 格式不像 UUID，直接走搜索路径，避免浪费一次必然 404 的请求
  if (!looksLikeOwnerRepo(repoOrId)) {
    try {
      return await apiRequest(`/api/repos/${encodeURIComponent(repoOrId)}`, { config });
    } catch (error) {
      if (!(error instanceof CliError) || error.status !== 404) {
        throw error;
      }
    }
  }

  const result = await apiRequest("/api/search", {
    config,
    query: { q: repoOrId, page: 1, pageSize: 10, sort: "relevance" },
  });
  const normalized = repoOrId.toLowerCase();
  const items = result.items ?? [];
  const exact = items.find(
    (repo) => repo.fullName?.toLowerCase() === normalized || repo.id === repoOrId,
  );

  if (exact) return exact;

  // 读操作允许：搜索结果恰好 1 条时自动命中
  if (!requireExact && items.length === 1) {
    return items[0];
  }

  // 写操作或无唯一结果：给出明确错误
  if (items.length === 0) {
    throw new CliError(`Repository was not found: ${repoOrId}`);
  }
  throw new CliError(
    `Multiple repositories matched "${repoOrId}". Specify an exact "owner/repo" or repo id. ` +
      `Candidates: ${items.slice(0, 5).map((r) => r.fullName).join(", ")}`,
  );
}

// 写操作辅助：先尝试按 id PATCH，404 则 resolveRepo（requireExact）后重试。
export async function patchRepoCuration(repoOrId, updates, config) {
  try {
    return await apiRequest(`/api/repos/${encodeURIComponent(repoOrId)}`, {
      method: "PATCH",
      body: updates,
      config,
    });
  } catch (error) {
    if (!(error instanceof CliError) || error.status !== 404) {
      throw error;
    }
  }

  const repo = await resolveRepo(repoOrId, config, { requireExact: true });
  return apiRequest(`/api/repos/${encodeURIComponent(repo.id)}`, {
    method: "PATCH",
    body: updates,
    config,
  });
}

export async function addTag(repoOrId, tag, config) {
  try {
    return await apiRequest(`/api/repos/${encodeURIComponent(repoOrId)}/tags`, {
      method: "POST",
      body: { tag },
      config,
    });
  } catch (error) {
    if (!(error instanceof CliError) || error.status !== 404) {
      throw error;
    }
  }

  const repo = await resolveRepo(repoOrId, config, { requireExact: true });
  return apiRequest(`/api/repos/${encodeURIComponent(repo.id)}/tags`, {
    method: "POST",
    body: { tag },
    config,
  });
}

export async function removeTag(repoOrId, tag, config) {
  try {
    return await apiRequest(`/api/repos/${encodeURIComponent(repoOrId)}/tags/${encodeURIComponent(tag)}`, {
      method: "DELETE",
      config,
    });
  } catch (error) {
    if (!(error instanceof CliError) || error.status !== 404) {
      throw error;
    }
  }

  const repo = await resolveRepo(repoOrId, config, { requireExact: true });
  return apiRequest(`/api/repos/${encodeURIComponent(repo.id)}/tags/${encodeURIComponent(tag)}`, {
    method: "DELETE",
    config,
  });
}

// 跨平台打开 URL。
export function openUrl(url) {
  const commands = {
    darwin: ["open", [url]],
    win32: ["cmd", ["/c", "start", "", url]],
    linux: ["xdg-open", [url]],
  };
  const [command, args] = commands[process.platform] ?? commands.linux;

  return new Promise((resolveOpen, rejectOpen) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", () => rejectOpen(new CliError(`Could not open URL automatically. Open it manually: ${url}`)));
    child.on("close", (code) => {
      if (code && code !== 0) {
        rejectOpen(new CliError(`Could not open URL automatically. Open it manually: ${url}`));
        return;
      }
      resolveOpen();
    });
  });
}
