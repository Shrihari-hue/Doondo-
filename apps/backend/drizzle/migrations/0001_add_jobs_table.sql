CREATE TYPE "public"."job_status" AS ENUM('active', 'paused', 'filled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."job_type" AS ENUM('full_time', 'part_time', 'gig', 'shift', 'contract');--> statement-breakpoint
CREATE TYPE "public"."pay_period" AS ENUM('hour', 'day', 'week', 'month', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."work_mode" AS ENUM('onsite', 'hybrid', 'remote');--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"title" varchar(120) NOT NULL,
	"description" varchar(5000) NOT NULL,
	"type" "job_type" NOT NULL,
	"pay_amount" integer NOT NULL,
	"pay_amount_max" integer,
	"pay_period" "pay_period" NOT NULL,
	"pay_currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"address" varchar(240) NOT NULL,
	"city" varchar(80) NOT NULL,
	"area" varchar(80),
	"pincode" varchar(12),
	"geo" geometry(point) NOT NULL,
	"skills" text[] DEFAULT '{}' NOT NULL,
	"work_mode" "work_mode" DEFAULT 'onsite' NOT NULL,
	"required_skill_test_id" varchar(60),
	"headcount" integer DEFAULT 1 NOT NULL,
	"crew_head_start_until" timestamp with time zone,
	"recurring" boolean DEFAULT false NOT NULL,
	"prep_checklist" text[] DEFAULT '{}' NOT NULL,
	"project_start_date" timestamp with time zone,
	"project_end_date" timestamp with time zone,
	"escalation" jsonb,
	"schedule" jsonb,
	"status" "job_status" DEFAULT 'active' NOT NULL,
	"urgent" boolean DEFAULT false NOT NULL,
	"safe_for_women" boolean DEFAULT false NOT NULL,
	"applicants_count" integer DEFAULT 0 NOT NULL,
	"views_count" integer DEFAULT 0 NOT NULL,
	"audio_description_url" text,
	"audio_description_duration_seconds" integer,
	"expires_at" timestamp with time zone,
	"workplace_answers" jsonb,
	"women_safety" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jobs_geo_gist_idx" ON "jobs" USING gist ("geo");--> statement-breakpoint
CREATE INDEX "jobs_status_city_created_idx" ON "jobs" USING btree ("status","city","created_at");--> statement-breakpoint
CREATE INDEX "jobs_employer_id_idx" ON "jobs" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "jobs_type_idx" ON "jobs" USING btree ("type");--> statement-breakpoint
CREATE INDEX "jobs_crew_head_start_until_idx" ON "jobs" USING btree ("crew_head_start_until");--> statement-breakpoint
CREATE INDEX "jobs_recurring_idx" ON "jobs" USING btree ("recurring");--> statement-breakpoint
CREATE INDEX "jobs_work_mode_idx" ON "jobs" USING btree ("work_mode");--> statement-breakpoint
CREATE INDEX "jobs_status_idx" ON "jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "jobs_urgent_idx" ON "jobs" USING btree ("urgent");--> statement-breakpoint
CREATE INDEX "jobs_safe_for_women_idx" ON "jobs" USING btree ("safe_for_women");--> statement-breakpoint
CREATE INDEX "jobs_expires_at_idx" ON "jobs" USING btree ("expires_at");