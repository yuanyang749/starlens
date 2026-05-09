import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import type { TokenRecord } from "@starlens/core";
import { getDb } from "@/db/client";
import { personalApiTokens } from "@/db/schema";

export type CreatedPersonalApiToken = TokenRecord & {
  token: string;
};

function hashToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function toTokenRecord(token: typeof personalApiTokens.$inferSelect): TokenRecord {
  return {
    id: token.id,
    name: token.name,
    note: token.note,
    tokenPrefix: token.tokenPrefix,
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
    expiresAt: token.expiresAt?.toISOString() ?? null,
    revokedAt: token.revokedAt?.toISOString() ?? null,
    createdAt: token.createdAt.toISOString(),
  };
}

export async function createPersonalApiToken(
  userId: string,
  name: string,
  note: string,
): Promise<CreatedPersonalApiToken> {
  const db = getDb();
  const rawToken = `stl_${randomBytes(32).toString("base64url")}`;
  const tokenPrefix = rawToken.slice(0, 12);
  const [created] = await db
    .insert(personalApiTokens)
    .values({
      userId,
      name,
      note,
      tokenHash: hashToken(rawToken),
      tokenPrefix,
    })
    .returning();

  return {
    ...toTokenRecord(created),
    token: rawToken,
  };
}

export async function listPersonalApiTokens(userId: string): Promise<TokenRecord[]> {
  const db = getDb();
  const rows = await db.query.personalApiTokens.findMany({
    where: and(eq(personalApiTokens.userId, userId), isNull(personalApiTokens.revokedAt)),
    orderBy: (tokens, { desc }) => [desc(tokens.createdAt)],
  });

  return rows.map(toTokenRecord);
}

export async function revokePersonalApiToken(userId: string, id: string) {
  const db = getDb();
  const revokedAt = new Date();
  const rows = await db
    .update(personalApiTokens)
    .set({ revokedAt, updatedAt: revokedAt })
    .where(
      and(
        eq(personalApiTokens.userId, userId),
        eq(personalApiTokens.id, id),
        isNull(personalApiTokens.revokedAt),
      ),
    )
    .returning({ id: personalApiTokens.id });

  return rows.length > 0;
}

export async function verifyPersonalApiToken(token: string) {
  const db = getDb();
  const now = new Date();
  const row = await db.query.personalApiTokens.findFirst({
    where: and(
      eq(personalApiTokens.tokenHash, hashToken(token)),
      isNull(personalApiTokens.revokedAt),
      or(isNull(personalApiTokens.expiresAt), gt(personalApiTokens.expiresAt, now)),
    ),
  });

  if (!row) {
    return null;
  }

  await db
    .update(personalApiTokens)
    .set({ lastUsedAt: now, updatedAt: now })
    .where(eq(personalApiTokens.id, row.id));

  return { id: row.userId };
}
