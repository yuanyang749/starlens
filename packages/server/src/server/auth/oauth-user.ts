import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "../../db/client";
import { githubAccounts, users } from "../../db/schema";
import { encryptSecret } from "../crypto/secrets";

export type GitHubOAuthProfile = {
  id?: number | string | null;
  login?: string | null;
  avatar_url?: string | null;
  name?: string | null;
  email?: string | null;
};

type UpsertGitHubUserInput = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: number | null;
  scope?: string | null;
  profile: GitHubOAuthProfile;
};

export async function upsertGitHubOAuthUser(input: UpsertGitHubUserInput) {
  const githubUserId = Number(input.profile.id);

  if (!githubUserId || !input.profile.login) {
    throw new Error("GitHub profile is missing id or login.");
  }

  const db = getDb();
  const existingAccount = await db.query.githubAccounts.findFirst({
    where: eq(githubAccounts.githubUserId, githubUserId),
  });

  const now = new Date();
  const encryptedAccessToken = encryptSecret(input.accessToken);
  const encryptedRefreshToken = input.refreshToken
    ? encryptSecret(input.refreshToken)
    : null;
  const tokenExpiresAt = input.expiresAt
    ? new Date(input.expiresAt * 1000)
    : null;

  if (existingAccount) {
    const [updatedUser] = await db
      .update(users)
      .set({
        email: input.profile.email ?? null,
        name: input.profile.name ?? input.profile.login,
        avatarUrl: input.profile.avatar_url ?? null,
        lastLoginAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, existingAccount.userId))
      .returning();

    await db
      .update(githubAccounts)
      .set({
        githubLogin: input.profile.login,
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        tokenExpiresAt,
        scope: input.scope ?? null,
        updatedAt: now,
      })
      .where(eq(githubAccounts.id, existingAccount.id));

    return updatedUser;
  }

  const [createdUser] = await db
    .insert(users)
    .values({
      email: input.profile.email ?? null,
      name: input.profile.name ?? input.profile.login,
      avatarUrl: input.profile.avatar_url ?? null,
      lastLoginAt: now,
    })
    .returning();

  await db.insert(githubAccounts).values({
    userId: createdUser.id,
    githubUserId,
    githubLogin: input.profile.login,
    accessTokenEncrypted: encryptedAccessToken,
    refreshTokenEncrypted: encryptedRefreshToken,
    tokenExpiresAt,
    scope: input.scope ?? null,
  });

  return createdUser;
}
