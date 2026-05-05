import type { TokenRecord } from "../types";

export const mockTokens: TokenRecord[] = [
  {
    id: "token-1",
    name: "CLI on MacBook",
    tokenPrefix: "stl_dev_1",
    lastUsedAt: "2026-05-05T09:42:00.000Z",
    expiresAt: null,
    revokedAt: null,
    createdAt: "2026-05-01T08:12:00.000Z",
  },
  {
    id: "token-2",
    name: "Hermes Agent",
    tokenPrefix: "stl_ops_2",
    lastUsedAt: "2026-05-04T22:15:00.000Z",
    expiresAt: null,
    revokedAt: null,
    createdAt: "2026-05-03T14:32:00.000Z",
  },
];
