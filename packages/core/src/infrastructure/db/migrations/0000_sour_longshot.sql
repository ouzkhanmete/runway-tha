CREATE TABLE IF NOT EXISTS "apps" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"country" text DEFAULT 'us' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"author" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"rating" integer NOT NULL,
	"version" text,
	"submitted_at" timestamp with time zone NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"app_id" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"pages_fetched" integer DEFAULT 0 NOT NULL,
	"reviews_upserted" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "reviews" ADD CONSTRAINT "reviews_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_app_id_apps_id_fk" FOREIGN KEY ("app_id") REFERENCES "public"."apps"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reviews_app_submitted_idx" ON "reviews" USING btree ("app_id","submitted_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sync_runs_app_status_finished_idx" ON "sync_runs" USING btree ("app_id","status","finished_at");
