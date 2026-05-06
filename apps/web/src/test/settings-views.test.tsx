/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AISettingsView } from "@/components/ai-settings-view";
import { TokensSettingsView } from "@/components/tokens-settings-view";

function mount(node: React.ReactNode) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  const root = createRoot(el);
  act(() => root.render(node));
  return { el, root };
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("tokens settings interactions", () => {
  it("create success", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { id: "x", token: "stl_secret_token" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [{ id: "x", name: "T", tokenPrefix: "stl", createdAt: new Date().toISOString(), lastUsedAt: null }] })));
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());
    const btn = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("New token"));
    expect(btn).toBeTruthy();
    await act(async () => btn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(fetchMock).toHaveBeenCalledWith("/api/tokens", expect.objectContaining({ method: "POST" }));
    expect(el.textContent).toContain("stl_secret_token");
  });

  it("server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false, error: { code: "x", message: "Boom" } }), { status: 500 })));
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());
    expect(el.textContent).toContain("Boom");
  });

  it("refreshes list after delete", async () => {
    const token = { id: "t1", name: "Token 1", tokenPrefix: "stl", createdAt: new Date().toISOString(), lastUsedAt: null };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [token] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { revoked: true } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());
    const revoke = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("Revoke"));
    await act(async () => revoke?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.textContent).toContain("No tokens yet");
  });

  it("clears the one-time token after revoke", async () => {
    const token = { id: "t1", name: "Token 1", tokenPrefix: "stl", createdAt: new Date().toISOString(), lastUsedAt: null };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { ...token, token: "stl_secret_token" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [token] })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { revoked: true } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());
    const create = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("New token"));
    await act(async () => create?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(el.textContent).toContain("stl_secret_token");
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
