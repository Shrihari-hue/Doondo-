CREATE TYPE "public"."mentor_session_mode" AS ENUM('video', 'phone', 'in_person');--> statement-breakpoint
CREATE TYPE "public"."mentor_session_status" AS ENUM('open', 'booked', 'cancelled', 'completed');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'mentor_session_booked';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'mentor_session_cancelled';--> statement-breakpoint
CREATE TABLE "mentor_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentor_id" uuid NOT NULL,
	"mentee_id" uuid,
	"trade" varchar(60) NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 30 NOT NULL,
	"mode" "mentor_session_mode" DEFAULT 'video' NOT NULL,
	"meeting_link" text,
	"location" varchar(240),
	"notes" varchar(400),
	"status" "mentor_session_status" DEFAULT 'open' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mentor_sessions" ADD CONSTRAINT "mentor_sessions_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentor_sessions" ADD CONSTRAINT "mentor_sessions_mentee_id_users_id_fk" FOREIGN KEY ("mentee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mentor_sessions_mentor_status_scheduled_idx" ON "mentor_sessions" USING btree ("mentor_id","status","scheduled_for");--> statement-breakpoint
CREATE INDEX "mentor_sessions_mentee_status_scheduled_idx" ON "mentor_sessions" USING btree ("mentee_id","status","scheduled_for");