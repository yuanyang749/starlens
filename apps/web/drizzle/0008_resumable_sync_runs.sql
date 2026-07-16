CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"next_page" integer DEFAULT 1 NOT NULL,
	"page_count" integer DEFAULT 0 NOT NULL,
	"fetched" integer DEFAULT 0 NOT NULL,
	"inserted_or_updated" integer DEFAULT 0 NOT NULL,
	"unstarred" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	"error_level" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sync_runs_user_status_idx" ON "sync_runs" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX "sync_runs_user_started_idx" ON "sync_runs" USING btree ("user_id","started_at");
