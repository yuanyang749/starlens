import "server-only";

import { getSessionUser } from "./session";
import { verifyPersonalApiToken } from "./personal-tokens";

function readBearerToken(request?: Request) {
  const authorization = request?.headers.get("authorization")?.trim();

  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token;
}

export async function getApiUser(request?: Request) {
  const bearerToken = readBearerToken(request);

  if (bearerToken === null) {
    return null;
  }

  if (bearerToken) {
    return verifyPersonalApiToken(bearerToken);
  }

  return getSessionUser();
}
