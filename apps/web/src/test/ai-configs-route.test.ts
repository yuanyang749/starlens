import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createAiConfigMock,
  deleteAiConfigMock,
  getAiConfigModelsMock,
  getApiUserMock,
  getSystemDefaultAiRuntimeStatusMock,
  listAiConfigsMock,
  updateAiConfigMock,
  validateAiConfigMock,
} = vi.hoisted(() => ({
  createAiConfigMock: vi.fn(),
  deleteAiConfigMock: vi.fn(),
  getAiConfigModelsMock: vi.fn(),
  getApiUserMock: vi.fn(),
  getSystemDefaultAiRuntimeStatusMock: vi.fn(),
  listAiConfigsMock: vi.fn(),
  updateAiConfigMock: vi.fn(),
  validateAiConfigMock: vi.fn(),
}));

vi.mock("@starlens/server/server/auth/api-user", () => ({
  getApiUser: getApiUserMock,
}));

vi.mock("@starlens/server/server/ai/configs", () => ({
  createAiConfig: createAiConfigMock,
  deleteAiConfig: deleteAiConfigMock,
  getAiConfigModels: getAiConfigModelsMock,
  getSystemDefaultAiRuntimeStatus: getSystemDefaultAiRuntimeStatusMock,
  listAiConfigs: listAiConfigsMock,
  updateAiConfig: updateAiConfigMock,
  validateAiConfig: validateAiConfigMock,
}));

async function json(response: Response) {
  return response.json() as Promise<unknown>;
}

describe("AI config API routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getApiUserMock.mockResolvedValue({ id: "user-1" });
  });

  it("lists persisted configs for the authenticated API user", async () => {
    const { GET } = await import("@/app/api/ai/configs/route");
    listAiConfigsMock.mockResolvedValue([]);

    await GET(new Request("https://starlens.test/api/ai/configs"));

    expect(listAiConfigsMock).toHaveBeenCalledWith("user-1");
  });

  it("creates a provider config through the service layer", async () => {
    const { POST } = await import("@/app/api/ai/configs/route");
    createAiConfigMock.mockResolvedValue({
      id: "ai-1",
      displayName: "DeepSeek",
      providerType: "openai_compatible",
      model: "deepseek-chat",
      baseUrl: "https://api.deepseek.com",
      enabled: true,
      isDefault: true,
      lastValidatedAt: null,
      lastValidationStatus: "warning",
      lastValidationError: null,
    });

    const response = await POST(
      new Request("https://starlens.test/api/ai/configs", {
        method: "POST",
        body: JSON.stringify({
          displayName: "DeepSeek",
          providerType: "openai_compatible",
          model: "deepseek-chat",
          baseUrl: "https://api.deepseek.com",
          apiKey: "secret",
          enabled: true,
          isDefault: true,
        }),
      }),
    );

    expect(createAiConfigMock).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        apiKey: "secret",
        displayName: "DeepSeek",
        isDefault: true,
      }),
    );
    await expect(json(response)).resolves.toMatchObject({
      ok: true,
      data: { id: "ai-1", isDefault: true },
    });
  });

  it("returns a 400 with the validation message when creating a config is rejected (e.g. unsafe baseUrl)", async () => {
    const { POST } = await import("@/app/api/ai/configs/route");
    createAiConfigMock.mockRejectedValue(new Error("Outbound requests to private or reserved address are not allowed."));

    const response = await POST(
      new Request("https://starlens.test/api/ai/configs", {
        method: "POST",
        body: JSON.stringify({
          displayName: "Internal",
          providerType: "openai_compatible",
          model: "test-model",
          baseUrl: "http://169.254.169.254/",
        }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_ai_config" },
    });
  });

  it("returns a 400 with the validation message when updating a config is rejected (e.g. unsafe baseUrl)", async () => {
    const route = await import("@/app/api/ai/configs/[id]/route");
    updateAiConfigMock.mockRejectedValue(new Error("Outbound requests to private or reserved address are not allowed."));

    const response = await route.PATCH(
      new Request("https://starlens.test/api/ai/configs/ai-1", {
        method: "PATCH",
        body: JSON.stringify({ baseUrl: "http://127.0.0.1/" }),
      }),
      { params: Promise.resolve({ id: "ai-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(json(response)).resolves.toMatchObject({
      ok: false,
      error: { code: "invalid_ai_config" },
    });
  });

  it("updates and deletes configs within the current user scope", async () => {
    const route = await import("@/app/api/ai/configs/[id]/route");
    updateAiConfigMock.mockResolvedValue({ id: "ai-1", displayName: "Edited" });
    deleteAiConfigMock.mockResolvedValue(true);

    await route.PATCH(
      new Request("https://starlens.test/api/ai/configs/ai-1", {
        method: "PATCH",
        body: JSON.stringify({ displayName: "Edited" }),
      }),
      { params: Promise.resolve({ id: "ai-1" }) },
    );
    const deleted = await route.DELETE(
      new Request("https://starlens.test/api/ai/configs/ai-1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "ai-1" }) },
    );

    expect(updateAiConfigMock).toHaveBeenCalledWith("user-1", "ai-1", {
      displayName: "Edited",
    });
    expect(deleteAiConfigMock).toHaveBeenCalledWith("user-1", "ai-1");
    await expect(json(deleted)).resolves.toMatchObject({ ok: true, data: { deleted: true } });
  });

  it("validates configs and returns provider model results", async () => {
    const validateRoute = await import("@/app/api/ai/configs/[id]/validate/route");
    const modelsRoute = await import("@/app/api/ai/configs/[id]/models/route");
    validateAiConfigMock.mockResolvedValue({
      status: "success",
      validatedAt: "2026-05-06T00:00:00.000Z",
      message: "Provider validation succeeded.",
    });
    getAiConfigModelsMock.mockResolvedValue({
      providerType: "openai_compatible",
      models: [{ id: "deepseek-chat", label: "deepseek-chat" }],
      source: "provider",
    });

    await validateRoute.POST(
      new Request("https://starlens.test/api/ai/configs/ai-1/validate", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "ai-1" }) },
    );
    const models = await modelsRoute.GET(
      new Request("https://starlens.test/api/ai/configs/ai-1/models"),
      { params: Promise.resolve({ id: "ai-1" }) },
    );

    expect(validateAiConfigMock).toHaveBeenCalledWith("user-1", "ai-1");
    expect(getAiConfigModelsMock).toHaveBeenCalledWith("user-1", "ai-1");
    await expect(json(models)).resolves.toMatchObject({
      ok: true,
      data: { models: [{ id: "deepseek-chat" }], source: "provider" },
    });
  });

  it("returns redacted system default AI runtime status for non-admin user", async () => {
    const { GET } = await import("@/app/api/ai/system-default/route");
    getSystemDefaultAiRuntimeStatusMock.mockReturnValue({
      baseUrl: "https://newapi.example/v1",
      configured: true,
      enabled: true,
      model: "gpt-4.1-mini",
      providerType: "openai_compatible",
      source: "system_default",
    });

    const response = await GET(new Request("https://starlens.test/api/ai/system-default"));

    expect(getSystemDefaultAiRuntimeStatusMock).toHaveBeenCalledWith();
    await expect(json(response)).resolves.toMatchObject({
      ok: true,
      data: {
        baseUrl: null,
        configured: true,
        model: null,
        providerType: null,
      },
    });
  });

  it("returns full system default AI runtime status for admin user", async () => {
    const originalAdminEmails = process.env.ADMIN_EMAILS;
    process.env.ADMIN_EMAILS = "admin@starlens.test";
    getApiUserMock.mockResolvedValue({ id: "admin-1", email: "admin@starlens.test" });

    const { GET } = await import("@/app/api/ai/system-default/route");
    getSystemDefaultAiRuntimeStatusMock.mockReturnValue({
      baseUrl: "https://newapi.example/v1",
      configured: true,
      enabled: true,
      model: "gpt-4.1-mini",
      providerType: "openai_compatible",
      source: "system_default",
    });

    const response = await GET(new Request("https://starlens.test/api/ai/system-default"));

    expect(getSystemDefaultAiRuntimeStatusMock).toHaveBeenCalledWith();
    await expect(json(response)).resolves.toMatchObject({
      ok: true,
      data: {
        baseUrl: "https://newapi.example/v1",
        configured: true,
        model: "gpt-4.1-mini",
        providerType: "openai_compatible",
      },
    });

    process.env.ADMIN_EMAILS = originalAdminEmails;
  });
});
