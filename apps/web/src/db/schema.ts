import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
};

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email"),
  name: text("name"),
  avatarUrl: text("avatar_url"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  emailUnique: uniqueIndex("users_email_unique").on(table.email),
}));

export const githubAccounts = pgTable("github_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  githubUserId: bigint("github_user_id", { mode: "number" }).notNull(),
  githubLogin: text("github_login").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  lastSyncStartedAt: timestamp("last_sync_started_at", { withTimezone: true }),
  lastSyncFinishedAt: timestamp("last_sync_finished_at", { withTimezone: true }),
  lastSyncStatus: text("last_sync_status"),
  lastSyncError: text("last_sync_error"),
  ...timestamps,
}, (table) => ({
  userUnique: uniqueIndex("github_accounts_user_id_unique").on(table.userId),
  githubUserUnique: uniqueIndex("github_accounts_github_user_id_unique").on(
    table.githubUserId,
  ),
}));

export const starredRepos = pgTable("starred_repos", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  githubRepoId: bigint("github_repo_id", { mode: "number" }).notNull(),
  name: text("name").notNull(),
  fullName: text("full_name").notNull(),
  ownerLogin: text("owner_login").notNull(),
  ownerAvatarUrl: text("owner_avatar_url"),
  htmlUrl: text("html_url").notNull(),
  description: text("description"),
  topics: jsonb("topics").$type<string[]>().notNull().default([]),
  language: text("language"),
  stargazersCount: integer("stargazers_count").notNull().default(0),
  forksCount: integer("forks_count").notNull().default(0),
  watchersCount: integer("watchers_count").notNull().default(0),
  openIssuesCount: integer("open_issues_count").notNull().default(0),
  defaultBranch: text("default_branch"),
  homepage: text("homepage"),
  licenseKey: text("license_key"),
  licenseName: text("license_name"),
  archived: boolean("archived").notNull().default(false),
  disabled: boolean("disabled").notNull().default(false),
  isFork: boolean("is_fork").notNull().default(false),
  isPrivate: boolean("is_private").notNull().default(false),
  visibility: text("visibility").notNull().default("public"),
  createdAtGithub: timestamp("created_at_github", { withTimezone: true }),
  updatedAtGithub: timestamp("updated_at_github", { withTimezone: true }),
  pushedAtGithub: timestamp("pushed_at_github", { withTimezone: true }),
  starredAtGithub: timestamp("starred_at_github", { withTimezone: true }),
  repoSummary: text("repo_summary").notNull().default(""),
  readmeExcerpt: text("readme_excerpt").notNull().default(""),
  searchDocument: text("search_document").notNull().default(""),
  aiSummary: text("ai_summary"),
  isFavorite: boolean("is_favorite").notNull().default(false),
  isStarred: boolean("is_starred").notNull().default(true),
  unstarredAt: timestamp("unstarred_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  readmeLastProcessedAt: timestamp("readme_last_processed_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  userRepoUnique: uniqueIndex("starred_repos_user_repo_unique").on(
    table.userId,
    table.githubRepoId,
  ),
  userIndex: index("starred_repos_user_idx").on(table.userId),
  ownerIndex: index("starred_repos_owner_idx").on(table.userId, table.ownerLogin),
  languageIndex: index("starred_repos_language_idx").on(table.userId, table.language),
  favoriteIndex: index("starred_repos_favorite_idx").on(table.userId, table.isFavorite),
  searchIndex: index("starred_repos_search_idx").using(
    "gin",
    sql`to_tsvector('simple', ${table.searchDocument})`,
  ),
}));

export const repoTags = pgTable("repo_tags", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  starredRepoId: uuid("starred_repo_id")
    .notNull()
    .references(() => starredRepos.id, { onDelete: "cascade" }),
  tag: text("tag").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  repoTagUnique: uniqueIndex("repo_tags_repo_tag_unique").on(
    table.starredRepoId,
    table.tag,
  ),
  userTagIndex: index("repo_tags_user_tag_idx").on(table.userId, table.tag),
}));

export const repoNotes = pgTable("repo_notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  starredRepoId: uuid("starred_repo_id")
    .notNull()
    .references(() => starredRepos.id, { onDelete: "cascade" }),
  note: text("note").notNull().default(""),
  ...timestamps,
}, (table) => ({
  repoUnique: uniqueIndex("repo_notes_repo_unique").on(table.starredRepoId),
}));

export const personalApiTokens = pgTable("personal_api_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  note: text("note").notNull().default(""),
  tokenHash: text("token_hash").notNull(),
  tokenPrefix: text("token_prefix").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  ...timestamps,
}, (table) => ({
  tokenHashUnique: uniqueIndex("personal_api_tokens_token_hash_unique").on(
    table.tokenHash,
  ),
  userActiveIndex: index("personal_api_tokens_user_active_idx").on(
    table.userId,
    table.revokedAt,
  ),
}));

export const userAiConfigs = pgTable("user_ai_configs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  displayName: text("display_name").notNull(),
  providerType: text("provider_type").notNull(),
  model: text("model").notNull(),
  baseUrl: text("base_url"),
  apiKeyEncrypted: text("api_key_encrypted"),
  extraHeadersEncrypted: text("extra_headers_encrypted"),
  enabled: boolean("enabled").notNull().default(true),
  isDefault: boolean("is_default").notNull().default(false),
  lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
  lastValidationStatus: text("last_validation_status"),
  lastValidationError: text("last_validation_error"),
  ...timestamps,
}, (table) => ({
  userEnabledIndex: index("user_ai_configs_user_enabled_idx").on(
    table.userId,
    table.enabled,
  ),
  userDefaultIndex: index("user_ai_configs_user_default_idx").on(
    table.userId,
    table.isDefault,
  ),
}));

export type User = typeof users.$inferSelect;
export type GitHubAccount = typeof githubAccounts.$inferSelect;
export type StarredRepo = typeof starredRepos.$inferSelect;
export type RepoTag = typeof repoTags.$inferSelect;
export type RepoNote = typeof repoNotes.$inferSelect;
export type PersonalApiToken = typeof personalApiTokens.$inferSelect;
export type UserAiConfig = typeof userAiConfigs.$inferSelect;
