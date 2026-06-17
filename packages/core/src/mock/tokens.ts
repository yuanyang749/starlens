import type { TokenRecord } from "../types.js";

export const mockTokens: TokenRecord[] = [
  {
    id: "token-1",
    name: "CLI on MacBook",
    note: "Local automation and shell usage",
    tokenPrefix: "stl_dev_1",
    tokenSuffix: "mac001",
    lastUsedAt: "2026-05-05T09:42:00.000Z",
    expiresAt: null,
    revokedAt: null,
    createdAt: "2026-05-01T08:12:00.000Z",
  },
  {
    id: "token-2",
    name: "Hermes Agent",
    note: "Dedicated token for background agent jobs",
    tokenPrefix: "stl_ops_2",
    tokenSuffix: "agent2",
    lastUsedAt: "2026-05-04T22:15:00.000Z",
    expiresAt: null,
    revokedAt: null,
    createdAt: "2026-05-03T14:32:00.000Z",
  },
];
