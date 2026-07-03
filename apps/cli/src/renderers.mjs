// 各命令的输出渲染（table / json 两种格式）
import { outputJson, printTable } from "./output.mjs";

export function renderLogin({ tokenPath }, format) {
  const data = { status: "logged_in", tokenPath };
  if (format === "json") return outputJson(data);
  console.log(`Logged in. Token saved to ${tokenPath}`);
}

export function renderLogout({ tokenPath }, format) {
  const data = { status: "logged_out", tokenPath };
  if (format === "json") return outputJson(data);
  console.log(`Logged out. Token removed from ${tokenPath}`);
}

export function renderStatus(data, format) {
  if (format === "json") return outputJson(data);
  printTable(
    [
      { field: "API base URL", value: data.apiBaseUrl },
      { field: "Token path", value: data.tokenPath },
      { field: "Token configured", value: data.tokenConfigured ? "yes" : "no" },
    ],
    [
      { key: "field", label: "Field", maxWidth: 24 },
      { key: "value", label: "Value", maxWidth: 96 },
    ],
  );
}

export function renderSync(data, format) {
  if (format === "json") return outputJson(data);
  printTable(
    [
      {
        status: data.status ?? "started",
        startedAt: data.startedAt ?? "",
        finishedAt: data.finishedAt ?? "",
        fetched: data.counts?.fetched ?? "",
        insertedOrUpdated: data.counts?.insertedOrUpdated ?? "",
        unstarred: data.counts?.unstarred ?? "",
      },
    ],
    [
      { key: "status", label: "Status" },
      { key: "startedAt", label: "Started", maxWidth: 28 },
      { key: "finishedAt", label: "Finished", maxWidth: 28 },
      { key: "fetched", label: "Fetched" },
      { key: "insertedOrUpdated", label: "Upserted" },
      { key: "unstarred", label: "Unstarred" },
    ],
  );
}

export function renderSearch(data, format) {
  if (format === "json") return outputJson(data);
  printTable(
    (data.items ?? []).map((repo) => ({
      fullName: repo.fullName,
      language: repo.language ?? "",
      stars: repo.stargazersCount ?? 0,
      favorite: repo.isFavorite ? "yes" : "no",
      tags: (repo.tags ?? []).join(","),
      summary: repo.repoSummary || repo.description || "",
    })),
    [
      { key: "fullName", label: "Repository", maxWidth: 32 },
      { key: "language", label: "Language", maxWidth: 16 },
      { key: "stars", label: "Stars", maxWidth: 10 },
      { key: "favorite", label: "Favorite", maxWidth: 10 },
      { key: "tags", label: "Tags", maxWidth: 20 },
      { key: "summary", label: "Summary", maxWidth: 56 },
    ],
  );
  const page = data.page ?? 1;
  console.log(`\nPage ${page} · ${data.total ?? 0} total`);
  if (data.hasMore) {
    console.log(`→ next page: --page ${page + 1}`);
  }
}

export function renderRepo(repo, format) {
  if (format === "json") return outputJson(repo);
  printTable(
    [
      { field: "Repository", value: repo.fullName ?? "" },
      { field: "Language", value: repo.language ?? "" },
      { field: "Stars", value: repo.stargazersCount ?? 0 },
      { field: "Favorite", value: repo.isFavorite ? "yes" : "no" },
      { field: "Tags", value: (repo.tags ?? []).join(", ") },
      { field: "Summary", value: repo.repoSummary || repo.description || "" },
      { field: "Note", value: repo.note ?? "" },
      { field: "URL", value: repo.htmlUrl ?? "" },
    ],
    [
      { key: "field", label: "Field", maxWidth: 16 },
      { key: "value", label: "Value", maxWidth: 96 },
    ],
  );
}

export function renderAsk(data, format) {
  if (format === "json") return outputJson(data);
  console.log(data.answer ?? "No answer.");
  const candidates = data.candidates ?? data.matches ?? [];
  if (candidates.length > 0) {
    console.log("");
    const hasReason = candidates.some((item) => typeof item.reason === "string" && item.reason.trim() !== "");
    const rows = candidates.map((item) => ({
      repo: item.fullName ?? item.repoId ?? item.id ?? "",
      reason: item.reason ?? "",
    }));
    const columns = hasReason
      ? [
          { key: "repo", label: "Repository", maxWidth: 48 },
          { key: "reason", label: "Reason", maxWidth: 72 },
        ]
      : [{ key: "repo", label: "Repository", maxWidth: 48 }];
    printTable(rows, columns);
  }
}

export function renderTags(data, format) {
  if (format === "json") return outputJson(data);
  printTable(
    (data.tags ?? []).map((tag) => ({ tag })),
    [{ key: "tag", label: "Tag", maxWidth: 48 }],
  );
}

// 修复：version / help 也尊重 --format json（它们是全局选项）。
export function renderVersion(version, format) {
  if (format === "json") return outputJson({ version });
  console.log(version);
}

export function renderHelp(text, format) {
  if (format === "json") return outputJson({ help: text });
  console.log(text);
}
