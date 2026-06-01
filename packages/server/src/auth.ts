import type {} from "./types/next-auth";
import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { eq } from "drizzle-orm";
import { getDb } from "./db/client";
import { users } from "./db/schema";
import {
  upsertGitHubOAuthUser,
  type GitHubOAuthProfile,
} from "./server/auth/oauth-user";

const githubOAuthTimeoutMs = Number.parseInt(
  process.env.AUTH_GITHUB_OAUTH_TIMEOUT_MS ?? "30000",
  10,
);

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
    error: "/",
  },
  providers: [
    GitHubProvider({
      clientId: process.env.AUTH_GITHUB_ID ?? "",
      clientSecret: process.env.AUTH_GITHUB_SECRET ?? "",
      httpOptions: {
        timeout: Number.isFinite(githubOAuthTimeoutMs)
          ? githubOAuthTimeoutMs
          : 30000,
      },
      authorization: {
        params: {
          scope: "read:user user:email",
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account?.provider === "github" && account.access_token && profile) {
        const githubProfile = profile as GitHubOAuthProfile;
        const user = await upsertGitHubOAuthUser({
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          expiresAt: account.expires_at,
          scope: account.scope,
          profile: githubProfile,
        });

        token.userId = user.id;
        token.name =
          user.name ?? githubProfile.name ?? githubProfile.login ?? token.name;
        token.email = user.email ?? githubProfile.email ?? token.email;
        token.picture = user.avatarUrl ?? githubProfile.avatar_url ?? token.picture;
      }

      if (
        typeof token.userId === "string" &&
        (!token.picture || !token.name || !token.email)
      ) {
        const db = getDb();
        const dbUser = await db.query.users.findFirst({
          where: eq(users.id, token.userId),
          columns: {
            name: true,
            email: true,
            avatarUrl: true,
          },
        });

        if (dbUser) {
          token.name = token.name ?? dbUser.name ?? undefined;
          token.email = token.email ?? dbUser.email ?? undefined;
          token.picture = token.picture ?? dbUser.avatarUrl ?? undefined;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.userId === "string") {
        session.user.id = token.userId;
        session.user.name = token.name ?? session.user.name;
        session.user.email = token.email ?? session.user.email;
        session.user.image =
          typeof token.picture === "string" ? token.picture : session.user.image;
      }

      return session;
    },
  },
};
