import { ok, unauthorized } from "@starlens/server/lib/api-response";
import { getApiUser } from "@starlens/server/server/auth/api-user";
import { getSystemDefaultAiRuntimeStatus } from "@starlens/server/server/ai/configs";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return unauthorized();

  return ok(getSystemDefaultAiRuntimeStatus());
}
