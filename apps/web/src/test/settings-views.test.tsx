/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AISettingsView } from "@/components/ai-settings-view";
import { GeneralSettingsView } from "@/components/general-settings-view";
import { TokensSettingsView } from "@/components/tokens-settings-view";

function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(node));
  return { el, root };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("general settings layout", () => {
  it("renders Simplified Chinese as the current interface language", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ current: "0.1.0-test", latest: null, hasUpdate: false, releaseUrl: null }))));
    const { el } = mount(<GeneralSettingsView appVersion="0.1.0-test" />);
    await act(async () => Promise.resolve());

    expect(el.querySelector('[data-testid="general-settings-view"]')).toBeTruthy();
    expect(el.textContent).toContain("界面语言");
    expect(el.textContent).toContain("构建信息");
    expect(el.textContent).toContain("0.1.0-test");
    expect(el.textContent).toContain("简体中文");
    expect(el.querySelector("select")).toBeNull();
    expect(el.textContent).not.toContain("Configuration domain");
    expect(el.textContent).not.toContain("English");
  });

  it("shows update badge and button when a newer version is available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ current: "0.1.0", latest: "0.2.0", hasUpdate: true, releaseUrl: "https://github.com/yuanyang749/starlens/releases/tag/v0.2.0" }))));
    const { el } = mount(<GeneralSettingsView appVersion="0.1.0" />);
    await act(async () => Promise.resolve());

    expect(el.querySelector('[data-testid="version-update-badge"]')).toBeTruthy();
    expect(el.textContent).toContain("发现新版本");
    expect(el.textContent).toContain("0.2.0");
    expect(el.querySelector('[data-testid="version-update-btn"]')).toBeTruthy();
    expect(el.textContent).toContain("立即更新");
  });

  it("shows up-to-date badge when current version matches latest", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ current: "0.1.0", latest: "0.1.0", hasUpdate: false, releaseUrl: null }))));
    const { el } = mount(<GeneralSettingsView appVersion="0.1.0" />);
    await act(async () => Promise.resolve());

    expect(el.querySelector('[data-testid="version-up-to-date"]')).toBeTruthy();
    expect(el.textContent).toContain("已是最新");
    expect(el.querySelector('[data-testid="version-update-badge"]')).toBeNull();
  });
});

describe("tokens settings interactions", () => {
  it("keeps token implementation notes inside the active tokens panel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: [] }))));
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());

    expect(el.querySelectorAll(".app-panel")).toHaveLength(1);
    expect(el.textContent).toContain("可用 API Token");
    expect(el.textContent).toContain("CLI 接入路径");
    expect(el.textContent).toContain("正式实现规则");
  });

  it("requires a remark before creating a token and places the button below the input", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());

    const noteInput = Array.from(el.querySelectorAll("input")).find((item) =>
      item.getAttribute("placeholder") === "Token 用途备注",
    ) as HTMLInputElement | undefined;
    const btn = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("新建 Token")) as HTMLButtonElement | undefined;

    expect(noteInput).toBeTruthy();
    expect(noteInput?.required).toBe(true);
    expect(btn).toBeTruthy();
    expect(btn?.disabled).toBe(true);
    const position = noteInput!.compareDocumentPosition(btn!);
    expect(Boolean(position & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);

    await act(async () => {
      btn?.click();
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalledWith("/api/tokens", expect.objectContaining({ method: "POST" }));

    act(() => setInputValue(noteInput!, "CI runner"));
    expect(btn?.disabled).toBe(false);
  });

  it("create success with note", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { id: "x", token: "stl_secret_token", note: "CI runner", tokenPrefix: "stl_secret", tokenSuffix: "_token" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [{ id: "x", name: "T", note: "CI runner", tokenPrefix: "stl_secret", tokenSuffix: "_token", createdAt: new Date().toISOString(), lastUsedAt: null }] })));
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());
    const noteInput = Array.from(el.querySelectorAll("input")).find((item) =>
      item.getAttribute("placeholder") === "Token 用途备注",
    ) as HTMLInputElement | undefined;
    const btn = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("新建 Token"));
    expect(noteInput).toBeTruthy();
    expect(btn).toBeTruthy();
    act(() => setInputValue(noteInput!, "CI runner"));
    await act(async () => btn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(fetchMock).toHaveBeenCalledWith("/api/tokens", expect.objectContaining({ method: "POST" }));
    const createCall = fetchMock.mock.calls.find(([url, init]) =>
      url === "/api/tokens" && init?.method === "POST",
    );
    expect(JSON.parse(String(createCall?.[1]?.body ?? "{}"))).toMatchObject({ note: "CI runner" });
    expect(el.textContent).not.toContain("stl_secret_token");
    expect(el.textContent).toContain("stl_secret********_token");
    expect(el.textContent).toContain("CI runner");

    const copy = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("复制"));
    await act(async () => copy?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(writeTextMock).toHaveBeenCalledWith("stl_secret_token");
    expect(el.textContent).toContain("已复制");
  });

  it("shows copyable CLI, agent skill, and MCP setup snippets after token creation without rendering the raw token", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
    const token = { id: "x", name: "T", note: "Cursor MCP", tokenPrefix: "stl_secret", tokenSuffix: "_token", createdAt: new Date().toISOString(), lastUsedAt: null };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { ...token, token: "stl_secret_token" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [token] })));
    vi.stubGlobal("fetch", fetchMock);
    writeTextMock.mockClear();

    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());

    const noteInput = Array.from(el.querySelectorAll("input")).find((item) =>
      item.getAttribute("placeholder") === "Token 用途备注",
    ) as HTMLInputElement | undefined;
    const create = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("新建 Token"));
    act(() => setInputValue(noteInput!, "Cursor MCP"));
    await act(async () => create?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(el.textContent).toContain("CLI");
    expect(el.textContent).toContain("Agent Skill");
    expect(el.textContent).toContain("Cursor MCP");

    const getCopyBtn = () => Array.from(el.querySelectorAll("button")).find((b) => (b.textContent === "复制" || b.textContent === "已复制") && !b.className.includes("underline"));

    // 1. 默认在 CLI tab 下，复制 CLI 配置
    const copyCli = getCopyBtn();
    await act(async () => copyCli?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    // 2. 切换至 Agent Skill tab，验证内容并复制
    const agentTabBtn = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "Agent Skill");
    await act(async () => agentTabBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(el.textContent).toContain("STARLENS_TOKEN");
    expect(el.textContent).toContain("agent-skills/starlens/SKILL.md");
    expect(el.textContent).not.toContain("stl_secret_token");
    expect(el.textContent).toContain("stl_secret********_token");

    const copyAgent = getCopyBtn();
    await act(async () => copyAgent?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    // 3. 切换至 Cursor MCP tab 并复制
    const mcpTabBtn = Array.from(el.querySelectorAll("button")).find((b) => b.textContent === "Cursor MCP");
    await act(async () => mcpTabBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const copyMcp = getCopyBtn();
    await act(async () => copyMcp?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(writeTextMock).toHaveBeenNthCalledWith(1, expect.stringContaining("stl_secret_token"));
    expect(writeTextMock).toHaveBeenNthCalledWith(2, expect.stringContaining("STARLENS_TOKEN"));
    expect(writeTextMock).toHaveBeenNthCalledWith(2, expect.stringContaining("stl_secret_token"));
    expect(writeTextMock).toHaveBeenNthCalledWith(2, expect.stringContaining("STARLENS_SKILL_FILE"));
    expect(writeTextMock).toHaveBeenNthCalledWith(2, expect.stringContaining("agent-skills/starlens/SKILL.md"));
    expect(writeTextMock).toHaveBeenNthCalledWith(2, expect.stringContaining("/api/search"));
    expect(writeTextMock).toHaveBeenNthCalledWith(3, expect.stringContaining("STARLENS_TOKEN"));
    expect(writeTextMock).toHaveBeenNthCalledWith(3, expect.stringContaining("stl_secret_token"));
  });

  it("server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { code: "x", message: "Boom" } }), { status: 500 })));
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());
    expect(el.textContent).toContain("Boom");
  });

  it("refreshes list after delete", async () => {
    const token = { id: "t1", name: "Token 1", note: "For local scripts", tokenPrefix: "stl_local", tokenSuffix: "abc123", createdAt: new Date().toISOString(), lastUsedAt: null };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [token] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { revoked: true } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());
    expect(el.textContent).toContain("For local scripts");
    const revoke = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("撤销"));
    await act(async () => revoke?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.textContent).toContain("暂无 API Token");
  });

  it("clears the one-time token after revoke", async () => {
    const token = { id: "t1", name: "Token 1", note: "For local scripts", tokenPrefix: "stl_secret", tokenSuffix: "_token", createdAt: new Date().toISOString(), lastUsedAt: null };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { ...token, token: "stl_secret_token" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [token] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { revoked: true } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());
    const noteInput = Array.from(el.querySelectorAll("input")).find((item) =>
      item.getAttribute("placeholder") === "Token 用途备注",
    ) as HTMLInputElement | undefined;
    const create = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("新建 Token"));
    act(() => setInputValue(noteInput!, "For local scripts"));
    await act(async () => create?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.textContent).not.toContain("stl_secret_token");
    expect(el.textContent).toContain("stl_secret********_token");
    const revoke = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("撤销"));
    await act(async () => revoke?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.textContent).not.toContain("stl_secret_token");
    expect(el.textContent).toContain("Token 已撤销");
  });
});

describe("AI settings interactions", () => {
  it("creates provider configs with entered connection details", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/ai/system-default") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          data: {
            baseUrl: "https://newapi.example/v1",
            configured: true,
            enabled: true,
            model: "gpt-4.1-mini",
            providerType: "openai_compatible",
            source: "system_default",
          },
        })));
      }

      if (url === "/api/ai/configs" && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({ ok: true, data: { id: "ai-1" } })));
      }

      return Promise.resolve(new Response(JSON.stringify({ ok: true, data: [] })));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<AISettingsView />);
    await act(async () => Promise.resolve());

    expect(el.textContent).toContain("当前使用：系统默认 AI");
    expect(el.textContent).toContain("gpt-4.1-mini");
    expect(el.querySelector("select")).toBeNull();
    expect(el.querySelector('button[aria-label="Provider 类型"]')).toBeTruthy();

    const setInput = (placeholder: string, value: string) => {
      const input = Array.from(el.querySelectorAll("input")).find(
        (item) => item.getAttribute("placeholder") === placeholder,
      );
      expect(input).toBeTruthy();
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )?.set;
        setter?.call(input, value);
        input!.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };

    setInput("例如：我的 OpenAI", "DeepSeek");
    setInput("例如：gpt-4o-mini", "deepseek-chat");
    setInput("https://api.openai.com/v1", "https://api.deepseek.com");
    setInput("sk-...", "sk-test");

    const button = Array.from(el.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("创建配置"),
    );
    await act(async () => button?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const createCall = fetchMock.mock.calls.find(([url, init]) =>
      url === "/api/ai/configs" && init?.method === "POST",
    );
    expect(JSON.parse(createCall?.[1]?.body as string)).toMatchObject({
      apiKey: "sk-test",
      baseUrl: "https://api.deepseek.com",
      displayName: "DeepSeek",
      model: "deepseek-chat",
    });
  });

  it("shows provider validation failures as errors", async () => {
    const config = {
      id: "ai-1",
      displayName: "Broken provider",
      providerType: "openai_compatible",
      model: "bad-model",
      baseUrl: "https://example.invalid",
      enabled: true,
      isDefault: false,
      lastValidatedAt: null,
      lastValidationStatus: "warning",
      lastValidationError: null,
    };
    let configRequests = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/ai/system-default") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          data: {
            baseUrl: null,
            configured: false,
            enabled: true,
            model: null,
            providerType: "openai_compatible",
            source: "system_default",
          },
        })));
      }

      if (url === "/api/ai/configs/ai-1/validate" && init?.method === "POST") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          data: { status: "error", message: "fetch failed" },
        })));
      }

      if (url === "/api/ai/configs") {
        configRequests += 1;
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          data: configRequests === 1 ? [config] : [{ ...config, lastValidationStatus: "error" }],
        })));
      }

      return Promise.resolve(new Response(JSON.stringify({ ok: true, data: [] })));
    });
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<AISettingsView />);
    await act(async () => Promise.resolve());
    const validate = Array.from(el.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("验证"),
    );
    await act(async () => validate?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.textContent).toContain("fetch failed");
    expect(el.querySelector(".text-red-500")?.textContent).toContain("fetch failed");
  });

  it("hides system default connection details for non-admin users", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url === "/api/ai/system-default") {
        return Promise.resolve(new Response(JSON.stringify({
          ok: true,
          data: {
            baseUrl: "https://newapi.example/v1",
            configured: true,
            enabled: true,
            model: "gpt-4.1-mini",
            providerType: "openai_compatible",
            source: "system_default",
          },
        })));
      }
      return Promise.resolve(new Response(JSON.stringify({ ok: true, data: [] })));
    });
    vi.stubGlobal("fetch", fetchMock);
    
    const { el } = mount(<AISettingsView isAdmin={false} />);
    await act(async () => Promise.resolve());

    expect(el.textContent).toContain("当前使用：系统默认 AI");
    expect(el.textContent).toContain("系统默认 AI 已启用");
    expect(el.textContent).not.toContain("gpt-4.1-mini");
    expect(el.textContent).not.toContain("https://newapi.example/v1");
  });
});
