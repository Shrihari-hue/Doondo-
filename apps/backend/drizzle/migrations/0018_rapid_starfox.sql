ALTER TABLE "availabilities" ADD COLUMN "service_ids" uuid[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "availabilities" ADD COLUMN "paused" boolean DEFAULT false NOT NULL;