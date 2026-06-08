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
  assert.equal(result.stdout.trim(), "0.1.0");
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

test("sync posts to /api/sync with a Bearer token and renders a table", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_sync_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      assert.equal(request.method, "POST");
      assert.equal(request.url, "/api/sync");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({
        ok: true,
        data: {
          status: "started",
          startedAt: "2026-05-05T12:00:00.000Z",
          counts: { fetched: 3, insertedOrUpdated: 2, unstarred: 1 },
        },
      }));
    }, async (apiBaseUrl, requests) => {
      const result = await runCli(["sync", "--api-base-url", apiBaseUrl, "--token-path", tokenPath]);

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests[0].authorization, "Bearer stl_sync_token");
      assert.match(result.stdout, /Status/);
      assert.match(result.stdout, /started/);
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

test("open can resolve owner/repo through search and print the repository url", async () => {
  const dir = await mkdtemp(join(tmpdir(), "starlens-cli-"));
  const tokenPath = join(dir, "token");
  await runCli(["login", "--token", "stl_open_token", "--token-path", tokenPath]);

  try {
    await withApiServer((request, response) => {
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/api/repos/owner%2Frepo") {
        response.statusCode = 404;
        response.end(JSON.stringify({ ok: false, error: { code: "repo_not_found", message: "Repository was not found." } }));
        return;
      }

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
      const url = new URL(requests[1].url, apiBaseUrl);
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
