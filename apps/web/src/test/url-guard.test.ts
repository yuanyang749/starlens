import { beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({
  lookupMock: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

describe("url-guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe("assertSafeOutboundUrl", () => {
    it("rejects a malformed URL", async () => {
      const { assertSafeOutboundUrl } = await import("@starlens/server/server/security/url-guard");
      await expect(assertSafeOutboundUrl("not a url")).rejects.toThrow();
    });

    it("rejects non-http(s) schemes", async () => {
      const { assertSafeOutboundUrl } = await import("@starlens/server/server/security/url-guard");
      await expect(assertSafeOutboundUrl("file:///etc/passwd")).rejects.toThrow();
      await expect(assertSafeOutboundUrl("ftp://example.com/")).rejects.toThrow();
    });

    it("rejects private/loopback/metadata IPv4 literals without needing DNS", async () => {
      const { assertSafeOutboundUrl } = await import("@starlens/server/server/security/url-guard");
      await expect(assertSafeOutboundUrl("http://127.0.0.1/")).rejects.toThrow();
      await expect(assertSafeOutboundUrl("http://169.254.169.254/")).rejects.toThrow();
      await expect(assertSafeOutboundUrl("http://10.1.2.3/")).rejects.toThrow();
      await expect(assertSafeOutboundUrl("http://192.168.1.1/")).rejects.toThrow();
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it("rejects decimal and hex-encoded IPv4 literal bypasses", async () => {
      const { assertSafeOutboundUrl } = await import("@starlens/server/server/security/url-guard");
      // 2130706433 十进制 = 127.0.0.1；0x7f000001 十六进制 = 127.0.0.1
      // WHATWG URL 解析会先把这些写法规范成标准点分十进制，天然堵住绕过
      await expect(assertSafeOutboundUrl("http://2130706433/")).rejects.toThrow();
      await expect(assertSafeOutboundUrl("http://0x7f000001/")).rejects.toThrow();
    });

    it("rejects private/loopback/link-local IPv6 literals, including IPv4-mapped form", async () => {
      const { assertSafeOutboundUrl } = await import("@starlens/server/server/security/url-guard");
      await expect(assertSafeOutboundUrl("http://[::1]/")).rejects.toThrow();
      await expect(assertSafeOutboundUrl("http://[fe80::1]/")).rejects.toThrow();
      await expect(assertSafeOutboundUrl("http://[fc00::1]/")).rejects.toThrow();
      await expect(assertSafeOutboundUrl("http://[::ffff:127.0.0.1]/")).rejects.toThrow();
    });

    it("allows a public IPv4 literal", async () => {
      const { assertSafeOutboundUrl } = await import("@starlens/server/server/security/url-guard");
      await expect(assertSafeOutboundUrl("https://8.8.8.8/")).resolves.toBeUndefined();
      expect(lookupMock).not.toHaveBeenCalled();
    });

    it("rejects a domain name that resolves to a private IP", async () => {
      lookupMock.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);
      const { assertSafeOutboundUrl } = await import("@starlens/server/server/security/url-guard");
      await expect(assertSafeOutboundUrl("https://internal.example.com/")).rejects.toThrow();
      expect(lookupMock).toHaveBeenCalledWith("internal.example.com", { all: true });
    });

    it("allows a domain name that resolves to a public IP", async () => {
      lookupMock.mockResolvedValue([{ address: "203.0.113.5", family: 4 }]);
      const { assertSafeOutboundUrl } = await import("@starlens/server/server/security/url-guard");
      await expect(assertSafeOutboundUrl("https://api.example.com/v1")).resolves.toBeUndefined();
    });

    it("rejects when any resolved address (multi-A-record) is private", async () => {
      lookupMock.mockResolvedValue([
        { address: "203.0.113.5", family: 4 },
        { address: "192.168.0.1", family: 4 },
      ]);
      const { assertSafeOutboundUrl } = await import("@starlens/server/server/security/url-guard");
      await expect(assertSafeOutboundUrl("https://mixed.example.com/")).rejects.toThrow();
    });
  });

  describe("guardedFetch", () => {
    it("does not call fetch when the URL is unsafe", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { guardedFetch } = await import("@starlens/server/server/security/url-guard");

      await expect(guardedFetch("http://127.0.0.1/")).rejects.toThrow();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("calls fetch with redirect: manual when the URL is safe", async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const { guardedFetch } = await import("@starlens/server/server/security/url-guard");

      await guardedFetch("https://8.8.8.8/v1/models", { headers: { authorization: "Bearer x" } });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://8.8.8.8/v1/models",
        expect.objectContaining({ redirect: "manual", headers: { authorization: "Bearer x" } }),
      );
    });

    it("follows a same-origin-safe redirect after re-validating the Location target", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(
          new Response(null, { status: 305, headers: { location: "https://8.8.4.4/v1/chat/completions" } }),
        )
        .mockResolvedValueOnce(new Response("ok", { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);
      const { guardedFetch } = await import("@starlens/server/server/security/url-guard");

      const response = await guardedFetch("https://8.8.8.8/v1/chat/completions");

      expect(response.status).toBe(200);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(2, "https://8.8.4.4/v1/chat/completions", expect.objectContaining({ redirect: "manual" }));
    });

    it("rejects when a redirect Location points at a private/internal address", async () => {
      const fetchMock = vi.fn().mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/meta-data/" } }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { guardedFetch } = await import("@starlens/server/server/security/url-guard");

      await expect(guardedFetch("https://8.8.8.8/v1/chat/completions")).rejects.toThrow();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("gives up after too many redirect hops instead of looping forever", async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        const next = url === "https://8.8.8.8/" ? "https://8.8.4.4/" : "https://8.8.8.8/";
        return new Response(null, { status: 302, headers: { location: next } });
      });
      vi.stubGlobal("fetch", fetchMock);
      const { guardedFetch } = await import("@starlens/server/server/security/url-guard");

      await expect(guardedFetch("https://8.8.8.8/")).rejects.toThrow(/too many redirects/i);
    });
  });
});
