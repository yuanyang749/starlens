import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(__dirname, "..", "index.mjs");

function runCli(args, env = {}, input = "") {
  return new Promise((resolveRun) => {
    const child = spawn(process.execPath, [cliPath, ...args], {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
    child.on("close", (code) => resolveRun({ code, stdout, stderr }));
  });
}

async function withApiServer(handler, callback) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body,
    });
    handler(request, response);
  });

  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const { port } = server.address();

  try {
    await callback(`http://127.0.0.1:${port}`, requests);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

test("login --token stores the bearer token at the configured token path", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");

  try {
    const result = await runCli(["login", "--token", "stl_test_token", "--token-path", tokenPath, "--format", "json"]);

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { status: "logged_in", tokenPath });
    assert.equal(await readFile(tokenPath, "utf8"), "stl_test_token\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("login --token-stdin stores the bearer token without using argv", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");

  try {
    const result = await runCli(["login", "--token-stdin", "--token-path", tokenPath, "--format", "json"], {}, "stl_stdin_token\n");

    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { status: "logged_in", tokenPath });
    assert.equal(await readFile(tokenPath, "utf8"), "stl_stdin_token\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("status reports token configuration and logout removes the stored token", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");

  try {
    await runCli(["login", "--token", "stl_status_token", "--token-path", tokenPath]);

    const before = await runCli(["status", "--token-path", tokenPath, "--format", "json"]);
    assert.equal(before.code, 0, before.stderr);
    assert.equal(JSON.parse(before.stdout).tokenConfigured, true);

    const logout = await runCli(["logout", "--token-path", tokenPath, "--format", "json"]);
    assert.equal(logout.code, 0, logout.stderr);
    assert.deepEqual(JSON.parse(logout.stdout), { status: "logged_out", tokenPath });

    const after = await runCli(["status", "--token-path", tokenPath, "--format", "json"]);
    assert.equal(after.code, 0, after.stderr);
    assert.equal(JSON.parse(after.stdout).tokenConfigured, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("help documents the 30 second default API timeout", async () => {
  const result = await runCli(["--help"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /default: 30000/);
});

test("version prints the CLI package version", async () => {
  const result = await runCli(["version"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout.trim(), /^\d+\.\d+\.\d+/);
});

test("version --format json emits a json object", async () => {
  const result = await runCli(["version", "--format", "json"]);
  assert.equal(result.code, 0, result.stderr);
  const parsed = JSON.parse(result.stdout);
  assert.match(parsed.version, /^\d+\.\d+\.\d+/);
});

test("search calls /api/search with a Bearer token and emits json results", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_search_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      assert.equal(request.method, "GET");
      assert.match(request.url, /^\/api\/search\?/);
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        data: {
          items: [{ fullName: "owner/repo", language: "TypeScript", stargazersCount: 42, isFavorite: true, tags: ["tooling"], repoSummary: "A useful repo" }],
          page: 1,
          pageSize: 20,
          total: 1,
          hasMore: false,
        },
      }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli([
        "search",
        "agent tools",
        "--api-base-url",
        apiBaseUrl,
        "--token-path",
        tokenPath,
        "--format",
        "json",
      ]);

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests[0].authorization, "Bearer stl_search_token");
      const url = new URL(requests[0].url, apiBaseUrl);
      assert.equal(url.searchParams.get("q"), "agent tools");
      assert.equal(JSON.parse(result.stdout).items[0].fullName, "owner/repo");
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("sync follows running pages with a Bearer token and renders the completed result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_sync_token", "--token-path", tokenPath]);

  try {
    let syncCalls = 0;
    await withApiServer((request, response) => {
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/api/sync");
      syncCalls += 1;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        data: {
          status: syncCalls === 1 ? "running" : "success",
          startedAt: "2026-05-05T12:00:00.000Z",
          finishedAt: syncCalls === 1 ? null : "2026-05-05T12:00:03.000Z",
          counts: { fetched: 3, insertedOrUpdated: 2, unstarred: 1 },
        },
      }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli(["sync", "--api-base-url", apiBaseUrl, "--token-path", tokenPath]);

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests[0].authorization, "Bearer stl_sync_token");
      assert.equal(requests.length, 2);
      assert.match(result.stdout, /Status/);
      assert.match(result.stdout, /success/);
      assert.match(result.stdout, /Fetched/);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("show fetches a repo by id and renders json", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_show_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      assert.equal(request.method, "GET");
      assert.equal(request.url, "/api/repos/repo-1");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        data: {
          id: "repo-1",
          fullName: "owner/repo",
          htmlUrl: "https://github.com/owner/repo",
          language: "TypeScript",
          stargazersCount: 42,
          isFavorite: false,
          tags: ["tooling"],
          repoSummary: "A useful repo",
          note: "Check later",
        },
      }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli([
        "show",
        "repo-1",
        "--api-base-url",
        apiBaseUrl,
        "--token-path",
        tokenPath,
        "--format",
        "json",
      ]);

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests[0].authorization, "Bearer stl_show_token");
      assert.equal(JSON.parse(result.stdout).fullName, "owner/repo");
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("open --print prints the repository url without opening a browser", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_open_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      // owner/repo 格式直接走搜索，不再先尝试 ID 查询
      assert.match(request.url, /^\/api\/search\?/);
      response.end(JSON.stringify({
        ok: true,
        data: {
          items: [{ id: "repo-1", fullName: "owner/repo", htmlUrl: "https://github.com/owner/repo" }],
          page: 1,
          pageSize: 10,
          total: 1,
          hasMore: false,
        },
      }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli([
        "open",
        "owner/repo",
        "--print",
        "--api-base-url",
        apiBaseUrl,
        "--token-path",
        tokenPath,
      ]);

      assert.equal(result.code, 0, result.stderr);
      assert.equal(result.stdout.trim(), "https://github.com/owner/repo");
      assert.equal(requests[0].authorization, "Bearer stl_open_token");
      const url = new URL(requests[0].url, apiBaseUrl);
      assert.equal(url.searchParams.get("q"), "owner/repo");
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ask posts the question to /api/ai/ask and renders the answer", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_ask_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/api/ai/ask");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        data: {
          answer: "owner/repo is the closest match.",
          candidates: [{ id: "repo-1", fullName: "owner/repo" }],
          providerConfigId: null,
        },
      }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli([
        "ask",
        "find my agent repo",
        "--api-base-url",
        apiBaseUrl,
        "--token-path",
        tokenPath,
      ]);

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests[0].authorization, "Bearer stl_ask_token");
      assert.deepEqual(JSON.parse(requests[0].body), { question: "find my agent repo" });
      assert.match(result.stdout, /owner\/repo is the closest match/);
      assert.match(result.stdout, /Repository/);
      assert.doesNotMatch(result.stdout, /Reason/);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ask renders the reason column when explained candidates are returned", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_reason_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/api/ai/ask");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        data: {
          answer: "owner/repo is the closest match.",
          candidates: [{
            id: "repo-1",
            fullName: "owner/repo",
            reason: 'Matched your question directly: "agent".',
            source: "question_search",
          }],
          providerConfigId: null,
        },
      }));
    }, async (apiBaseUrl) => {
      const result = await runCli([
        "ask",
        "agent",
        "--api-base-url",
        apiBaseUrl,
        "--token-path",
        tokenPath,
      ]);

      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Repository\s+Reason/);
      assert.match(result.stdout, /Matched your question directly/);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("favorite updates repository curation through PATCH /api/repos/:id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_favorite_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      assert.equal(request.method, "PATCH");
      assert.equal(request.url, "/api/repos/repo-1");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        data: {
          id: "repo-1",
          fullName: "owner/repo",
          htmlUrl: "https://github.com/owner/repo",
          isFavorite: true,
          tags: [],
          note: "",
        },
      }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli(["favorite", "repo-1", "--api-base-url", apiBaseUrl, "--token-path", tokenPath, "--format", "json"]);

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests[0].authorization, "Bearer stl_favorite_token");
      assert.deepEqual(JSON.parse(requests[0].body), { isFavorite: true });
      assert.equal(JSON.parse(result.stdout).isFavorite, true);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unfavorite updates repository curation through PATCH /api/repos/:id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_unfavorite_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      assert.equal(request.method, "PATCH");
      assert.equal(request.url, "/api/repos/repo-1");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        data: {
          id: "repo-1",
          fullName: "owner/repo",
          htmlUrl: "https://github.com/owner/repo",
          isFavorite: false,
          tags: [],
          note: "",
        },
      }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli(["unfavorite", "repo-1", "--api-base-url", apiBaseUrl, "--token-path", tokenPath, "--format", "json"]);

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests[0].authorization, "Bearer stl_unfavorite_token");
      assert.deepEqual(JSON.parse(requests[0].body), { isFavorite: false });
      assert.equal(JSON.parse(result.stdout).isFavorite, false);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("note --set updates the repository note", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_note_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      assert.equal(request.method, "PATCH");
      assert.equal(request.url, "/api/repos/repo-1");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        data: {
          id: "repo-1",
          fullName: "owner/repo",
          htmlUrl: "https://github.com/owner/repo",
          isFavorite: false,
          tags: [],
          note: "review for mobile",
        },
      }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli(["note", "repo-1", "--set", "review for mobile", "--api-base-url", apiBaseUrl, "--token-path", tokenPath, "--format", "json"]);

      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(requests[0].body), { note: "review for mobile" });
      assert.equal(JSON.parse(result.stdout).note, "review for mobile");
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("note --clear clears the repository note", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_note_clear_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      assert.equal(request.method, "PATCH");
      assert.equal(request.url, "/api/repos/repo-1");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        data: {
          id: "repo-1",
          fullName: "owner/repo",
          htmlUrl: "https://github.com/owner/repo",
          isFavorite: false,
          tags: [],
          note: "",
        },
      }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli(["note", "repo-1", "--clear", "--api-base-url", apiBaseUrl, "--token-path", tokenPath, "--format", "json"]);

      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(requests[0].body), { note: "" });
      assert.equal(JSON.parse(result.stdout).note, "");
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("tag add posts a tag to /api/repos/:id/tags", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_tag_add_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/api/repos/repo-1/tags");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true, data: { tags: ["mobile"] } }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli(["tag", "add", "repo-1", "mobile", "--api-base-url", apiBaseUrl, "--token-path", tokenPath, "--format", "json"]);

      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(requests[0].body), { tag: "mobile" });
      assert.deepEqual(JSON.parse(result.stdout), { tags: ["mobile"] });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("tag remove deletes a tag from /api/repos/:id/tags/:tag", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_tag_remove_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      assert.equal(request.method, "DELETE");
      assert.equal(request.url, "/api/repos/repo-1/tags/mobile");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ ok: true, data: { tags: [] } }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli(["tag", "remove", "repo-1", "mobile", "--api-base-url", apiBaseUrl, "--token-path", tokenPath, "--format", "json"]);

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests[0].authorization, "Bearer stl_tag_remove_token");
      assert.deepEqual(JSON.parse(result.stdout), { tags: [] });
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("unknown command exits with code 1 and prints error", async () => {
  const result = await runCli(["no-such-command"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown command/);
});

// ── 回归测试：针对本次重构修复的 Bug ──────────────────────────────────────────

test("tag with extra arguments exits with an error (fix #32)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_tag_extra_token", "--token-path", tokenPath]);

  try {
    const result = await runCli(["tag", "add", "repo-1", "mobile", "extra", "--token-path", tokenPath]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /accepts exactly one repo and one tag/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--sort with invalid value exits with a friendly error (fix #23)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_sort_token", "--token-path", tokenPath]);

  try {
    const result = await runCli(["search", "react", "--sort", "bogus", "--token-path", tokenPath]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--sort must be one of/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--favorite with non-boolean value exits with a friendly error (fix #23)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_fav_token", "--token-path", tokenPath]);

  try {
    const result = await runCli(["search", "react", "--favorite", "maybe", "--token-path", tokenPath]);
    assert.equal(result.code, 1);
    assert.match(result.stderr, /--favorite must be true or false/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--timeout-ms below minimum exits with an error (fix #36)", async () => {
  const result = await runCli(["status", "--timeout-ms", "1"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /--timeout-ms must be an integer greater than or equal to 1000/);
});

test("install-mcp --hosted and --local are mutually exclusive (fix #12)", async () => {
  const result = await runCli(["install-mcp", "--hosted", "--local", "--client", "claude", "--lang", "en"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /mutually exclusive/);
});

test("install-mcp with invalid --client value exits with an error", async () => {
  const result = await runCli(["install-mcp", "--client", "nope", "--lang", "en"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /no valid value/);
});

// 写操作在搜索结果不精确匹配时拒绝静默命中（fix #4）
test("favorite refuses ambiguous single-result search match for write operations", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_ambig_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      const url = request.url ?? "";
      // 写操作会先 PATCH /api/repos/<输入>，resolveRepo 也会先 GET /api/repos/<输入>。
      // 对裸词 "react" 的直接仓库查询返回 404，强制走 /api/search 回退路径，
      // 这样写操作才能在 requireExact 下拒绝"搜索唯一但非精确匹配"的结果。
      if (url.startsWith("/api/repos/react") && !url.includes("/tags")) {
        response.statusCode = 404;
        response.end(JSON.stringify({ ok: false, error: { code: "not_found", message: "Repository not found" } }));
        return;
      }
      // 搜索返回 1 条结果，但 fullName 与输入不精确匹配
      response.end(JSON.stringify({
        ok: true,
        data: {
          items: [{ id: "repo-9", fullName: "someone/react-utils", htmlUrl: "https://github.com/someone/react-utils" }],
          page: 1,
          pageSize: 10,
          total: 1,
          hasMore: false,
        },
      }));
    }, async (apiBaseUrl) => {
      const result = await runCli(["favorite", "react", "--api-base-url", apiBaseUrl, "--token-path", tokenPath]);
      assert.equal(result.code, 1);
      // 写操作要求精确匹配，不应静默标星错误的仓库
      assert.match(result.stderr, /Multiple repositories matched|Repository was not found/);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// 5xx 重试：服务端返回 503 时应重试（fix #2）
test("apiRequest retries on 5xx responses (fix #2)", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_retry_token", "--token-path", tokenPath]);

  try {
    let calls = 0;
    await withApiServer((request, response) => {
      calls += 1;
      response.setHeader("Content-Type", "application/json");
      if (calls === 1) {
        // 第一次返回 503 + 带 message（原先会被正则漏判）
        response.statusCode = 503;
        response.end(JSON.stringify({ ok: false, error: { message: "Service unavailable" } }));
      } else {
        response.end(JSON.stringify({
          ok: true,
          data: { items: [], page: 1, pageSize: 20, total: 0, hasMore: false },
        }));
      }
    }, async (apiBaseUrl, requests) => {
      const result = await runCli(["search", "test", "--api-base-url", apiBaseUrl, "--token-path", tokenPath, "--retries", "2", "--format", "json"]);
      assert.equal(result.code, 0, result.stderr);
      assert.ok(requests.length >= 2, `expected at least 2 requests, got ${requests.length}`);
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── 单元测试：纯函数 ──────────────────────────────────────────────────────

test("appendTomlSection is idempotent and creates parent dirs (fix #19, #29)", async () => {
  const { appendTomlSection } = await import("../install-mcp/mcp-config.mjs");
  const dir = await mkdtemp(join(tmpdir(), "starlens-toml-"));
  // 故意使用嵌套路径，验证 dirname() 创建父目录（原正则切目录在 / 上会失败）
  const tomlPath = join(dir, "nested", "deep", "config.toml");

  try {
    const section1 = `[mcp_servers.starlens]\nurl = "https://starlens.520ai.xin/mcp"\nenabled = true`;
    await appendTomlSection(tomlPath, "mcp_servers.starlens", section1);
    const content1 = await readFile(tomlPath, "utf8");
    assert.equal((content1.match(/\[mcp_servers\.starlens\]/g) ?? []).length, 1, "first write: 1 section");

    // 第二次写入（覆盖）：仍应只有 1 个节
    const section2 = `[mcp_servers.starlens]\nurl = "https://new.example.com/mcp"\nenabled = true`;
    await appendTomlSection(tomlPath, "mcp_servers.starlens", section2);
    const content2 = await readFile(tomlPath, "utf8");
    assert.equal((content2.match(/\[mcp_servers\.starlens\]/g) ?? []).length, 1, "second write: still 1 section");
    assert.match(content2, /new\.example\.com/, "second write overwrites old content");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("displayWidth counts CJK and emoji as width 2 (fix #25)", async () => {
  const { displayWidth, truncate } = await import("../output.mjs");
  assert.equal(displayWidth("abc"), 3, "ascii width 1 each");
  assert.equal(displayWidth("中文"), 4, "CJK width 2 each");
  assert.equal(displayWidth("a中"), 2 + 1, "mixed");
  assert.equal(displayWidth("🚀"), 2, "emoji width 2");
  // truncate 不应劈开代理对
  const t = truncate("中文字abc", 5);
  assert.ok(!t.includes("\uFFFD"), "no replacement char from split surrogate");
  assert.ok(t.endsWith("…"));
});

test("wizardPromptSecret uses explicit control char escapes (fix #1 smoke)", async () => {
  // 仅验证模块可加载且常量已导出（控制字符行为需 TTY，无法在 CI 单测）
  const mod = await import("../install-mcp/prompts.mjs");
  assert.equal(typeof mod.wizardPromptSecret, "function");
  assert.equal(typeof mod.maskToken, "function");
  assert.equal(mod.maskToken("stl_abcdef1234"), "stl_...234");
  assert.equal(mod.maskToken("short"), "***");
});

// install-mcp 非交互烟雾测试：跳过 mcp 配置，验证能干净退出
test("install-mcp --client claude skips cleanly when answering N to mcp prompt", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-installmcp-"));
  try {
    const result = await runCli(
      ["install-mcp", "--client", "claude", "--hosted", "--token", "stl_test_ci", "--lang", "en"],
      { HOME: dir, STARLENS_API_BASE_URL: "https://starlens.520ai.xin" },
      "N\n", // 跳过 mcp 配置
    );
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /Setup complete/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// ── stars update ─────────────────────────────────────────────────────────

test("compareVersions compares dotted version numbers numerically", async () => {
  const { compareVersions } = await import("../self-update.mjs");
  assert.equal(compareVersions("1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions("1.10.0", "1.9.0") > 0, true, "1.10.0 > 1.9.0 (numeric, not lexical)");
  assert.equal(compareVersions("0.2.0", "0.3.0") < 0, true);
  assert.equal(compareVersions("1.0", "1.0.1") < 0, true, "missing segment treated as 0");
});

test("update --unknown-flag exits with an error before touching the network", async () => {
  const result = await runCli(["update", "--unknown-flag"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown update arguments/);
});

test("update --skill-only --client is no longer supported", async () => {
  // --client 已移除:npx skills add 自动发现已安装的客户端
  const result = await runCli(["update", "--skill-only", "--client", "claude"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /--client is no longer supported/);
});

test("update --skill-only refreshes via npx skills add", async () => {
  // npx skills add 在 CI 中可能失败,但 CLI 应优雅处理(打印失败提示,exit 0)
  const result = await runCli(["update", "--skill-only"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Refreshing skill files via npx skills add/);
});
