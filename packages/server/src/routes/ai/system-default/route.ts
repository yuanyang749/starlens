import { ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { getSystemDefaultAiRuntimeStatus } from "@starlens/server/server/ai/configs";
import { isAdminUser } from "@starlens/server/server/auth/admin";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  const status = getSystemDefaultAiRuntimeStatus();
  if (!isAdminUser(user)) {
    return ok({
      ...status,
      baseUrl: null,
      model: null,
      providerType: null,
    });
  }

  return ok(status);
}
