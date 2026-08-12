CREATE TYPE "public"."application_status" AS ENUM('pending', 'viewed', 'shortlisted', 'rejected', 'hired', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."interview_mode" AS ENUM('in_person', 'video', 'phone');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('scheduled', 'cancelled', 'completed');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('pending', 'accepted', 'declined', 'expired', 'countered');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('none', 'seeker_confirmed', 'employer_confirmed', 'confirmed', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."shift_checkin_kind" AS ENUM('check_in', 'check_out');--> statement-breakpoint
CREATE TYPE "public"."shift_confirmation_status" AS ENUM('none', 'awaiting', 'confirmed', 'declined');--> statement-breakpoint
CREATE TABLE "applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'pending' NOT NULL,
	"cover_note" varchar(500),
	"expressed_as_interest" boolean DEFAULT false NOT NULL,
	"team_size_snapshot" integer,
	"team_members" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_status" "payment_status" DEFAULT 'none' NOT NULL,
	"payment_metadata" jsonb,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"viewed_at" timestamp with time zone,
	"shortlisted_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"hired_at" timestamp with time zone,
	"withdrawn_at" timestamp with time zone,
	"rejection_reasons" text[],
	"flagged_as_ghosted_at" timestamp with time zone,
	"interview_at" timestamp with time zone,
	"interview_status" "interview_status",
	"interview_mode" "interview_mode",
	"interview_details" jsonb,
	"next_shift_at" timestamp with time zone,
	"prep_acknowledged_at" timestamp with time zone,
	"shift_confirmation_status" "shift_confirmation_status" DEFAULT 'none' NOT NULL,
	"shift_confirmation_prompted_at" timestamp with time zone,
	"shift_confirmation_confirmed_at" timestamp with time zone,
	"shift_confirmation_declined_at" timestamp with time zone,
	"offer_status" "offer_status",
	"offer_expires_at" timestamp with time zone,
	"offer_details" jsonb,
	"on_the_way_started_at" timestamp with time zone,
	"on_the_way_eta_minutes" integer,
	"tailored_resume" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applications_team_size_snapshot_check" CHECK ("applications"."team_size_snapshot" IS NULL OR "applications"."team_size_snapshot" BETWEEN 2 AND 50),
	CONSTRAINT "applications_team_members_array_check" CHECK (jsonb_typeof("applications"."team_members") = 'array' AND jsonb_array_length("applications"."team_members") <= 4)
);
--> statement-breakpoint
CREATE TABLE "shift_check_ins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"kind" "shift_checkin_kind" NOT NULL,
	"selfie_url" text NOT NULL,
	"geo" geometry(point) NOT NULL,
	"distance_from_job_meters" integer,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_check_ins_distance_check" CHECK ("shift_check_ins"."distance_from_job_meters" IS NULL OR "shift_check_ins"."distance_from_job_meters" >= 0)
);
--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_check_ins" ADD CONSTRAINT "shift_check_ins_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_check_ins" ADD CONSTRAINT "shift_check_ins_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_check_ins" ADD CONSTRAINT "shift_check_ins_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_check_ins" ADD CONSTRAINT "shift_check_ins_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "applications_seeker_job_unique" ON "applications" USING btree ("seeker_id","job_id");--> statement-breakpoint
CREATE INDEX "applications_seeker_id_idx" ON "applications" USING btree ("seeker_id");--> statement-breakpoint
CREATE INDEX "applications_employer_id_idx" ON "applications" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "applications_job_id_idx" ON "applications" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "applications_seeker_created_idx" ON "applications" USING btree ("seeker_id","created_at");--> statement-breakpoint
CREATE INDEX "applications_employer_status_created_idx" ON "applications" USING btree ("employer_id","status","created_at");--> statement-breakpoint
CREATE INDEX "applications_job_employer_status_created_idx" ON "applications" USING btree ("job_id","employer_id","status","created_at");--> statement-breakpoint
CREATE INDEX "applications_status_next_shift_idx" ON "applications" USING btree ("status","next_shift_at");--> statement-breakpoint
CREATE INDEX "applications_offer_status_expires_idx" ON "applications" USING btree ("offer_status","offer_expires_at");--> statement-breakpoint
CREATE INDEX "applications_interview_status_at_idx" ON "applications" USING btree ("interview_status","interview_at");--> statement-breakpoint
CREATE INDEX "applications_ghost_sweep_idx" ON "applications" USING btree ("status","applied_at","flagged_as_ghosted_at");--> statement-breakpoint
CREATE INDEX "shift_check_ins_application_id_idx" ON "shift_check_ins" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "shift_check_ins_seeker_id_idx" ON "shift_check_ins" USING btree ("seeker_id");--> statement-breakpoint
CREATE INDEX "shift_check_ins_employer_id_idx" ON "shift_check_ins" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "shift_check_ins_job_id_idx" ON "shift_check_ins" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "shift_check_ins_application_timestamp_idx" ON "shift_check_ins" USING btree ("application_id","timestamp");--> statement-breakpoint
CREATE INDEX "shift_check_ins_seeker_timestamp_idx" ON "shift_check_ins" USING btree ("seeker_id","timestamp");--> statement-breakpoint
CREATE INDEX "shift_check_ins_employer_timestamp_idx" ON "shift_check_ins" USING btree ("employer_id","timestamp");--> statement-breakpoint
CREATE INDEX "shift_check_ins_geo_gist_idx" ON "shift_check_ins" USING gist ("geo");