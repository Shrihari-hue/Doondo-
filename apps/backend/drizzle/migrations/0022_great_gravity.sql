ALTER TABLE "quick_work_requests" ADD COLUMN "scheduled_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quick_work_requests" ADD COLUMN "price_approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quick_work_requests" ADD COLUMN "no_show_by" "quick_work_cancelled_by";--> statement-breakpoint
ALTER TABLE "quick_work_requests" ADD COLUMN "no_show_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "quick_work_requests" ADD COLUMN "no_show_at" timestamp with time zone;