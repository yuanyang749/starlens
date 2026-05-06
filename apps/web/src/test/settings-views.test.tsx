/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
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
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: { id: "x" } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, data: [{ id: "x", name: "T", tokenPrefix: "stl", createdAt: new Date().toISOString(), lastUsedAt: null }] })));
    vi.stubGlobal("fetch", fetchMock);
    const { el } = mount(<TokensSettingsView />);
    await act(async () => Promise.resolve());
    const btn = Array.from(el.querySelectorAll("button")).find((b) => b.textContent?.includes("New token"));
    expect(btn).toBeTruthy();
    await act(async () => btn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(fetchMock).toHaveBeenCalledWith("/api/tokens", expect.objectContaining({ method: "POST" }));
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
});
