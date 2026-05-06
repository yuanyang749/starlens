CREATE TABLE "user_ai_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"provider_type" text NOT NULL,
	"model" text NOT NULL,
	"base_url" text,
	"api_key_encrypted" text,
	"extra_headers_encrypted" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"last_validated_at" timestamp with time zone,
	"last_validation_status" text,
	"last_validation_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_ai_configs" ADD CONSTRAINT "user_ai_configs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_ai_configs_user_enabled_idx" ON "user_ai_configs" USING btree ("user_id","enabled");--> statement-breakpoint
CREATE INDEX "user_ai_configs_user_default_idx" ON "user_ai_configs" USING btree ("user_id","is_default");