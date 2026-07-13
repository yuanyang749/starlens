/** @vitest-environment jsdom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useChatStream } from "./use-chat-stream";

let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  vi.unstubAllGlobals();
});

describe("useChatStream 预设请求", () => {
  it("把 presetId 透传给聊天接口", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "stop after request" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "test-id") });

    let chat: ReturnType<typeof useChatStream> | null = null;
    function Harness() {
      chat = useChatStream();
      return null;
    }

    const container = document.createElement("div");
    root = createRoot(container);
    await act(async () => {
      root?.render(<Harness />);
    });
    await act(async () => {
      await chat?.sendMessage("最近更新", { presetId: "recently_active" });
    });

    const requestBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(requestBody).toMatchObject({
      question: "最近更新",
      presetId: "recently_active",
    });
  });
});
