CREATE TABLE "push_receipts" (
	"ticket_id" varchar(64) PRIMARY KEY NOT NULL,
	"token" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "notification_prefs" SET DEFAULT '{"jobs":true,"applications":true,"messages":true,"ratings":true,"referrals":true,"quietHours":null}'::jsonb;--> statement-breakpoint
CREATE INDEX "push_receipts_created_idx" ON "push_receipts" USING btree ("created_at");