CREATE TYPE "public"."user_report_reason" AS ENUM('fake_profile', 'scam', 'abusive', 'no_show', 'other');--> statement-breakpoint
CREATE TYPE "public"."user_report_status" AS ENUM('open', 'reviewed', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TABLE "user_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"reported_user_id" uuid NOT NULL,
	"reason" "user_report_reason" NOT NULL,
	"note" varchar(1000) DEFAULT '' NOT NULL,
	"status" "user_report_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_reports_reporter_id_idx" ON "user_reports" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "user_reports_reported_user_id_idx" ON "user_reports" USING btree ("reported_user_id");--> statement-breakpoint
CREATE INDEX "user_reports_status_idx" ON "user_reports" USING btree ("status");