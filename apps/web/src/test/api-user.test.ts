import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSessionUserMock, verifyPersonalApiTokenMock } = vi.hoisted(() => ({
  getSessionUserMock: vi.fn(),
  verifyPersonalApiTokenMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@starlens/server/server/auth/session", () => ({
  getSessionUser: getSessionUserMock,
}));

vi.mock("@starlens/server/server/auth/personal-tokens", () => ({
  verifyPersonalApiToken: verifyPersonalApiTokenMock,
}));

describe("API user resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses bearer tokens before browser session auth", async () => {
    const { getApiUser } = await import("@starlens/server/server/auth/api-user");
    getSessionUserMock.mockResolvedValue({ id: "session-user" });
    verifyPersonalApiTokenMock.mockResolvedValue({ id: "token-user" });

    const user = await getApiUser(
      new Request("https://starlens.test/api/search", {
        headers: { authorization: "Bearer stl_test_token" },
      }),
    );

    expect(user).toEqual({ id: "token-user", email: null });
    expect(verifyPersonalApiTokenMock).toHaveBeenCalledWith("stl_test_token");
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });

  it("does not fall back to session auth when an invalid bearer token is present", async () => {
    const { getApiUser } = await import("@starlens/server/server/auth/api-user");
    getSessionUserMock.mockResolvedValue({ id: "session-user" });
    verifyPersonalApiTokenMock.mockResolvedValue(null);

    const user = await getApiUser(
      new Request("https://starlens.test/api/search", {
        headers: { authorization: "Bearer invalid" },
      }),
    );

    expect(user).toBeNull();
    expect(getSessionUserMock).not.toHaveBeenCalled();
  });
});
