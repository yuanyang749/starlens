CREATE TABLE "github_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"github_user_id" bigint NOT NULL,
	"github_login" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"token_expires_at" timestamp with time zone,
	"scope" text,
	"last_sync_started_at" timestamp with time zone,
	"last_sync_finished_at" timestamp with time zone,
	"last_sync_status" text,
	"last_sync_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"starred_repo_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"starred_repo_id" uuid NOT NULL,
	"tag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "starred_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"github_repo_id" bigint NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"owner_login" text NOT NULL,
	"owner_avatar_url" text,
	"html_url" text NOT NULL,
	"description" text,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"language" text,
	"stargazers_count" integer DEFAULT 0 NOT NULL,
	"forks_count" integer DEFAULT 0 NOT NULL,
	"watchers_count" integer DEFAULT 0 NOT NULL,
	"open_issues_count" integer DEFAULT 0 NOT NULL,
	"default_branch" text,
	"homepage" text,
	"license_key" text,
	"license_name" text,
	"archived" boolean DEFAULT false NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"is_fork" boolean DEFAULT false NOT NULL,
	"is_private" boolean DEFAULT false NOT NULL,
	"visibility" text DEFAULT 'public' NOT NULL,
	"created_at_github" timestamp with time zone,
	"updated_at_github" timestamp with time zone,
	"pushed_at_github" timestamp with time zone,
	"starred_at_github" timestamp with time zone,
	"repo_summary" text DEFAULT '' NOT NULL,
	"readme_excerpt" text DEFAULT '' NOT NULL,
	"search_document" text DEFAULT '' NOT NULL,
	"ai_summary" text,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"is_starred" boolean DEFAULT true NOT NULL,
	"unstarred_at" timestamp with time zone,
	"last_synced_at" timestamp with time zone,
	"readme_last_processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"name" text,
	"avatar_url" text,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "github_accounts" ADD CONSTRAINT "github_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_notes" ADD CONSTRAINT "repo_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_notes" ADD CONSTRAINT "repo_notes_starred_repo_id_starred_repos_id_fk" FOREIGN KEY ("starred_repo_id") REFERENCES "public"."starred_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_tags" ADD CONSTRAINT "repo_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo_tags" ADD CONSTRAINT "repo_tags_starred_repo_id_starred_repos_id_fk" FOREIGN KEY ("starred_repo_id") REFERENCES "public"."starred_repos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "starred_repos" ADD CONSTRAINT "starred_repos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "github_accounts_user_id_unique" ON "github_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "github_accounts_github_user_id_unique" ON "github_accounts" USING btree ("github_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_notes_repo_unique" ON "repo_notes" USING btree ("starred_repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repo_tags_repo_tag_unique" ON "repo_tags" USING btree ("starred_repo_id","tag");--> statement-breakpoint
CREATE INDEX "repo_tags_user_tag_idx" ON "repo_tags" USING btree ("user_id","tag");--> statement-breakpoint
CREATE UNIQUE INDEX "starred_repos_user_repo_unique" ON "starred_repos" USING btree ("user_id","github_repo_id");--> statement-breakpoint
CREATE INDEX "starred_repos_user_idx" ON "starred_repos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "starred_repos_owner_idx" ON "starred_repos" USING btree ("user_id","owner_login");--> statement-breakpoint
CREATE INDEX "starred_repos_language_idx" ON "starred_repos" USING btree ("user_id","language");--> statement-breakpoint
CREATE INDEX "starred_repos_favorite_idx" ON "starred_repos" USING btree ("user_id","is_favorite");--> statement-breakpoint
CREATE INDEX "starred_repos_search_idx" ON "starred_repos" USING gin (to_tsvector('simple', "search_document"));--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");