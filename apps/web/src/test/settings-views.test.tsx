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
  it("renders English as the only current interface language", () => {
    const { el } = mount(<GeneralSettingsView appVersion="0.1.0-test" />);

    expect(el.querySelector('[data-testid="general-settings-view"]')).toBeTruthy();
    expect(el.textContent).toContain("Interface language");
    expect(el.textContent).toContain("Build information");
    expect(el.textContent).toContain("0.1.0-test");
    expect(el.textContent).toContain("English");
    expect(el.querySelector("select")).toBeNull();
    expect(el.textContent).not.toContain("Configuration domain");
    expect(el.textContent).not.toContain("简体中文");
  });
});

describe("tokens settings interactions", () => {
  it("keeps token implementation notes inside the active tokens panel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: [] }))));
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());

    expect(el.querySelectorAll(".app-panel")).toHaveLength(1);
    expect(el.textContent).toContain("Active tokens");
    expect(el.textContent).toContain("Planned CLI path");
    expect(el.textContent).toContain("Rules for the real implementation");
  });

  it("requires a remark before creating a token and places the button below the input", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, data: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());

    const noteInput = Array.from(el.querySelectorAll("input")).find((item) =>
      item.getAttribute("placeholder") === "Remark for this token",
    ) as HTMLInputElement | undefined;
    const btn = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("New token")) as HTMLButtonElement | undefined;

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
      item.getAttribute("placeholder") === "Remark for this token",
    ) as HTMLInputElement | undefined;
    const btn = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("New token"));
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

    const copy = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("Copy"));
    await act(async () => copy?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(writeTextMock).toHaveBeenCalledWith("stl_secret_token");
    expect(el.textContent).toContain("Copied");
  });

  it("shows copyable CLI and MCP setup snippets after token creation without rendering the raw token", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: writeTextMock } });
    const token = { id: "x", name: "T", note: "Cursor MCP", tokenPrefix: "stl_secret", tokenSuffix: "_token", createdAt: new Date().toISOString(), lastUsedAt: null };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { ...token, token: "stl_secret_token" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [token] })));
    vi.stubGlobal("fetch", fetchMock);

    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());

    const noteInput = Array.from(el.querySelectorAll("input")).find((item) =>
      item.getAttribute("placeholder") === "Remark for this token",
    ) as HTMLInputElement | undefined;
    const create = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("New token"));
    act(() => setInputValue(noteInput!, "Cursor MCP"));
    await act(async () => create?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(el.textContent).toContain("CLI setup");
    expect(el.textContent).toContain("Cursor MCP config");
    expect(el.textContent).toContain("STARLENS_TOKEN");
    expect(el.textContent).not.toContain("stl_secret_token");
    expect(el.textContent).toContain("stl_secret********_token");

    const copyCli = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("Copy CLI setup"));
    const copyMcp = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("Copy MCP config"));
    await act(async () => copyCli?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await act(async () => copyMcp?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(writeTextMock).toHaveBeenNthCalledWith(1, expect.stringContaining("stl_secret_token"));
    expect(writeTextMock).toHaveBeenNthCalledWith(2, expect.stringContaining("STARLENS_TOKEN"));
    expect(writeTextMock).toHaveBeenNthCalledWith(2, expect.stringContaining("stl_secret_token"));
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
    const revoke = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("Revoke"));
    await act(async () => revoke?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.textContent).toContain("No tokens yet");
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
      item.getAttribute("placeholder") === "Remark for this token",
    ) as HTMLInputElement | undefined;
    const create = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("New token"));
    act(() => setInputValue(noteInput!, "For local scripts"));
    await act(async () => create?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.textContent).not.toContain("stl_secret_token");
    expect(el.textContent).toContain("stl_secret********_token");
    const revoke = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("Revoke"));
    await act(async () => revoke?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.textContent).not.toContain("stl_secret_token");
    expect(el.textContent).toContain("Token revoked");
  });
});

describe("AI settings interactions", () => {
  it("creates provider configs with entered connection details", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { id: "ai-1" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<AISettingsView />);
    await act(async () => Promise.resolve());

    expect(el.querySelector("select")).toBeNull();
    expect(el.querySelector('button[aria-label="Provider type"]')).toBeTruthy();

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

    setInput("Display name", "DeepSeek");
    setInput("Model", "deepseek-chat");
    setInput("Base URL", "https://api.deepseek.com");
    setInput("API key", "sk-test");

    const button = Array.from(el.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("Create config"),
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
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [config] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { status: "error", message: "fetch failed" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [{ ...config, lastValidationStatus: "error" }] })));
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<AISettingsView />);
    await act(async () => Promise.resolve());
    const validate = Array.from(el.querySelectorAll("button")).find((item) =>
      item.textContent?.includes("Validate"),
    );
    await act(async () => validate?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.textContent).toContain("fetch failed");
    expect(el.querySelector(".text-red-500")?.textContent).toContain("fetch failed");
  });
});
