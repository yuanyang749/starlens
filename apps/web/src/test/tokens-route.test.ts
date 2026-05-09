import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createPersonalApiTokenMock,
  getSessionUserMock,
  listPersonalApiTokensMock,
  revokePersonalApiTokenMock,
} = vi.hoisted(() => ({
  createPersonalApiTokenMock: vi.fn(),
  getSessionUserMock: vi.fn(),
  listPersonalApiTokensMock: vi.fn(),
  revokePersonalApiTokenMock: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  getSessionUser: getSessionUserMock,
}));

vi.mock("@/server/auth/personal-tokens", () => ({
  createPersonalApiToken: createPersonalApiTokenMock,
  listPersonalApiTokens: listPersonalApiTokensMock,
  revokePersonalApiToken: revokePersonalApiTokenMock,
}));

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("token API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionUserMock.mockResolvedValue({ id: "user-1" });
  });

  it("creates a persisted personal API token for the authenticated user", async () => {
    const { POST } = await import("@/app/api/tokens/route");
    createPersonalApiTokenMock.mockResolvedValue({
      id: "token-1",
      name: "CLI",
      note: "CI runner",
      token: "stl_secret",
      tokenPrefix: "stl_secret",
      createdAt: "2026-05-06T00:00:00.000Z",
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
    });

    const response = await POST(
      new Request("https://starlens.test/api/tokens", {
        method: "POST",
        body: JSON.stringify({ name: "CLI", note: "CI runner" }),
      }),
    );

    expect(createPersonalApiTokenMock).toHaveBeenCalledWith("user-1", "CLI", "CI runner");
    await expect(json(response)).resolves.toMatchObject({
      ok: true,
      data: { token: "stl_secret", tokenPrefix: "stl_secret", note: "CI runner" },
    });
  });

  it("lists active tokens for the authenticated user", async () => {
    const { GET } = await import("@/app/api/tokens/route");
    listPersonalApiTokensMock.mockResolvedValue([]);

    await GET(new Request("https://starlens.test/api/tokens"));

    expect(listPersonalApiTokensMock).toHaveBeenCalledWith("user-1");
  });

  it("revokes tokens within the authenticated user's scope", async () => {
    const { DELETE } = await import("@/app/api/tokens/[id]/route");
    revokePersonalApiTokenMock.mockResolvedValue(true);

    const response = await DELETE(new Request("https://starlens.test/api/tokens/token-1"), {
      params: Promise.resolve({ id: "token-1" }),
    });

    expect(revokePersonalApiTokenMock).toHaveBeenCalledWith("user-1", "token-1");
    await expect(json(response)).resolves.toMatchObject({ ok: true, data: { revoked: true } });
  });
});
