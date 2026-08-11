CREATE TYPE "public"."advance_status" AS ENUM('requested', 'approved', 'paid', 'repaid', 'declined', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."collect_qr_kind" AS ENUM('open', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."dispute_category" AS ENUM('no_show', 'payment', 'work_quality', 'behavior', 'hours', 'safety', 'other');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'awaiting_response', 'resolved', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."employer_interest_status" AS ENUM('pending', 'viewed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."hiring_request_status" AS ENUM('pending', 'accepted', 'declined', 'withdrawn', 'expired');--> statement-breakpoint
CREATE TYPE "public"."insurance_status" AS ENUM('pending', 'active', 'paused', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."insurance_tier" AS ENUM('standard');--> statement-breakpoint
CREATE TYPE "public"."masked_call_mode" AS ENUM('proxy', 'reveal');--> statement-breakpoint
CREATE TYPE "public"."mentorship_status" AS ENUM('pending', 'accepted', 'declined', 'ended');--> statement-breakpoint
CREATE TYPE "public"."party_role" AS ENUM('employer', 'seeker');--> statement-breakpoint
CREATE TYPE "public"."payment_intent_status" AS ENUM('pending', 'in_progress', 'paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."post_type" AS ENUM('text', 'photo', 'video', 'certificate', 'resume', 'voice');--> statement-breakpoint
CREATE TABLE "advance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"reason" varchar(400) DEFAULT '' NOT NULL,
	"application_id" uuid,
	"status" "advance_status" DEFAULT 'requested' NOT NULL,
	"repay_by" timestamp with time zone,
	"ops_note" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advance_requests_amount_check" CHECK ("advance_requests"."amount_paise" BETWEEN 50000 AND 500000)
);
--> statement-breakpoint
CREATE TABLE "availabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"trades_available" text[] DEFAULT '{}' NOT NULL,
	"job_types" "job_type"[] DEFAULT '{}' NOT NULL,
	"city" varchar(80),
	"area" varchar(80),
	"geo" geometry(point) NOT NULL,
	"until" timestamp with time zone NOT NULL,
	"recurring_pattern" jsonb,
	"note" varchar(240),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collect_qrs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "collect_qr_kind" NOT NULL,
	"amount_paise" integer,
	"application_id" uuid,
	"ref" varchar(64) NOT NULL,
	"payload" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"author_id" uuid NOT NULL,
	"type" "post_type" NOT NULL,
	"text" varchar(3000) DEFAULT '' NOT NULL,
	"media_urls" text[] DEFAULT '{}' NOT NULL,
	"certificate_title" varchar(200),
	"likes" uuid[] DEFAULT '{}' NOT NULL,
	"comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"repost_count" integer DEFAULT 0 NOT NULL,
	"reshared" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "crew_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"label" varchar(80) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"raised_by_role" "party_role" NOT NULL,
	"category" "dispute_category" NOT NULL,
	"description" varchar(1000) NOT NULL,
	"photo_urls" text[] DEFAULT '{}' NOT NULL,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"responses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"resolution" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employer_interests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"message" varchar(240),
	"status" "employer_interest_status" DEFAULT 'pending' NOT NULL,
	"viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "endorsements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endorser_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"trade" varchar(40) NOT NULL,
	"application_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"course_id" varchar(80) NOT NULL,
	"completed_lesson_ids" text[] DEFAULT '{}' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "favorite_employers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hiring_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"message" varchar(240),
	"status" "hiring_request_status" DEFAULT 'pending' NOT NULL,
	"application_id" uuid,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "incident_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"application_id" uuid,
	"note" varchar(500) NOT NULL,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"tier" "insurance_tier" DEFAULT 'standard' NOT NULL,
	"monthly_premium_paise" integer NOT NULL,
	"status" "insurance_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"last_paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"query" varchar(120),
	"city" varchar(80),
	"job_types" "job_type"[] DEFAULT '{}' NOT NULL,
	"urgent_only" boolean DEFAULT false NOT NULL,
	"radius_km" real,
	"coordinates" jsonb,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_matched_job_id" uuid,
	"last_matched_at" timestamp with time zone,
	"match_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "masked_call_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"caller_id" uuid NOT NULL,
	"callee_id" uuid NOT NULL,
	"caller_role" "party_role" NOT NULL,
	"mode" "masked_call_mode" NOT NULL,
	"provider" varchar(40) NOT NULL,
	"proxy_number" varchar(32),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"trade" varchar(60) NOT NULL,
	"city" varchar(80) NOT NULL,
	"bio" varchar(600) DEFAULT '' NOT NULL,
	"monthly_cap" integer DEFAULT 3 NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"active_mentees" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentorship_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mentee_id" uuid NOT NULL,
	"mentor_id" uuid NOT NULL,
	"trade" varchar(60) NOT NULL,
	"city" varchar(80) NOT NULL,
	"message" varchar(400) DEFAULT '' NOT NULL,
	"status" "mentorship_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"application_id" uuid,
	"amount_paise" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"seeker_vpa" varchar(80) NOT NULL,
	"upi_uri" text NOT NULL,
	"ref" varchar(64) NOT NULL,
	"status" "payment_intent_status" DEFAULT 'pending' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photo_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"photo_index" integer NOT NULL,
	"application_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "photo_verifications_photo_index_check" CHECK ("photo_verifications"."photo_index" BETWEEN 0 AND 9)
);
--> statement-breakpoint
CREATE TABLE "profile_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"viewer_id" uuid NOT NULL,
	"day" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_briefings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"text" varchar(1000) DEFAULT '' NOT NULL,
	"photo_urls" text[] DEFAULT '{}' NOT NULL,
	"audio_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_requests" ADD CONSTRAINT "advance_requests_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availabilities" ADD CONSTRAINT "availabilities_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collect_qrs" ADD CONSTRAINT "collect_qrs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collect_qrs" ADD CONSTRAINT "collect_qrs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_documents" ADD CONSTRAINT "crew_documents_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_documents" ADD CONSTRAINT "crew_documents_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_interests" ADD CONSTRAINT "employer_interests_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_interests" ADD CONSTRAINT "employer_interests_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_endorser_id_users_id_fk" FOREIGN KEY ("endorser_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "endorsements" ADD CONSTRAINT "endorsements_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_employers" ADD CONSTRAINT "favorite_employers_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "favorite_employers" ADD CONSTRAINT "favorite_employers_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_requests" ADD CONSTRAINT "hiring_requests_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_requests" ADD CONSTRAINT "hiring_requests_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_requests" ADD CONSTRAINT "hiring_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hiring_requests" ADD CONSTRAINT "hiring_requests_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_logs" ADD CONSTRAINT "incident_logs_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_logs" ADD CONSTRAINT "incident_logs_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incident_logs" ADD CONSTRAINT "incident_logs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_subscriptions" ADD CONSTRAINT "insurance_subscriptions_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_alerts" ADD CONSTRAINT "job_alerts_last_matched_job_id_jobs_id_fk" FOREIGN KEY ("last_matched_job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "masked_call_sessions" ADD CONSTRAINT "masked_call_sessions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "masked_call_sessions" ADD CONSTRAINT "masked_call_sessions_caller_id_users_id_fk" FOREIGN KEY ("caller_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "masked_call_sessions" ADD CONSTRAINT "masked_call_sessions_callee_id_users_id_fk" FOREIGN KEY ("callee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentors" ADD CONSTRAINT "mentors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorship_requests" ADD CONSTRAINT "mentorship_requests_mentee_id_users_id_fk" FOREIGN KEY ("mentee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentorship_requests" ADD CONSTRAINT "mentorship_requests_mentor_id_users_id_fk" FOREIGN KEY ("mentor_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_verifications" ADD CONSTRAINT "photo_verifications_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_verifications" ADD CONSTRAINT "photo_verifications_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "photo_verifications" ADD CONSTRAINT "photo_verifications_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_views" ADD CONSTRAINT "profile_views_viewer_id_users_id_fk" FOREIGN KEY ("viewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_briefings" ADD CONSTRAINT "site_briefings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_briefings" ADD CONSTRAINT "site_briefings_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "advance_requests_seeker_status_created_idx" ON "advance_requests" USING btree ("seeker_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "availabilities_seeker_unique" ON "availabilities" USING btree ("seeker_id");--> statement-breakpoint
CREATE INDEX "availabilities_geo_gist_idx" ON "availabilities" USING gist ("geo");--> statement-breakpoint
CREATE INDEX "availabilities_until_idx" ON "availabilities" USING btree ("until");--> statement-breakpoint
CREATE UNIQUE INDEX "collect_qrs_ref_unique" ON "collect_qrs" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "collect_qrs_owner_created_idx" ON "collect_qrs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "community_posts_created_idx" ON "community_posts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "crew_documents_employer_expires_idx" ON "crew_documents" USING btree ("employer_id","expires_at");--> statement-breakpoint
CREATE INDEX "disputes_employer_status_created_idx" ON "disputes" USING btree ("employer_id","status","created_at");--> statement-breakpoint
CREATE INDEX "disputes_seeker_status_created_idx" ON "disputes" USING btree ("seeker_id","status","created_at");--> statement-breakpoint
CREATE INDEX "disputes_application_id_idx" ON "disputes" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employer_interests_pair_unique" ON "employer_interests" USING btree ("seeker_id","employer_id");--> statement-breakpoint
CREATE INDEX "employer_interests_employer_status_created_idx" ON "employer_interests" USING btree ("employer_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "endorsements_endorser_seeker_trade_unique" ON "endorsements" USING btree ("endorser_id","seeker_id","trade");--> statement-breakpoint
CREATE INDEX "endorsements_seeker_trade_idx" ON "endorsements" USING btree ("seeker_id","trade");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_seeker_course_unique" ON "enrollments" USING btree ("seeker_id","course_id");--> statement-breakpoint
CREATE INDEX "enrollments_seeker_updated_idx" ON "enrollments" USING btree ("seeker_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "favorite_employers_pair_unique" ON "favorite_employers" USING btree ("worker_id","employer_id");--> statement-breakpoint
CREATE INDEX "favorite_employers_employer_idx" ON "favorite_employers" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "hiring_requests_seeker_status_created_idx" ON "hiring_requests" USING btree ("seeker_id","status","created_at");--> statement-breakpoint
CREATE INDEX "hiring_requests_employer_created_idx" ON "hiring_requests" USING btree ("employer_id","created_at");--> statement-breakpoint
CREATE INDEX "hiring_requests_dedupe_idx" ON "hiring_requests" USING btree ("employer_id","seeker_id","job_id","status");--> statement-breakpoint
CREATE INDEX "incident_logs_employer_worker_created_idx" ON "incident_logs" USING btree ("employer_id","worker_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "insurance_subscriptions_seeker_unique" ON "insurance_subscriptions" USING btree ("seeker_id");--> statement-breakpoint
CREATE INDEX "job_alerts_enabled_city_idx" ON "job_alerts" USING btree ("enabled","city");--> statement-breakpoint
CREATE INDEX "job_alerts_seeker_id_idx" ON "job_alerts" USING btree ("seeker_id");--> statement-breakpoint
CREATE INDEX "masked_call_sessions_application_id_idx" ON "masked_call_sessions" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "masked_call_sessions_caller_created_idx" ON "masked_call_sessions" USING btree ("caller_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "mentors_user_unique" ON "mentors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mentors_trade_city_open_idx" ON "mentors" USING btree ("trade","city","open");--> statement-breakpoint
CREATE INDEX "mentorship_requests_mentee_mentor_status_idx" ON "mentorship_requests" USING btree ("mentee_id","mentor_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_intents_ref_unique" ON "payment_intents" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "payment_intents_employer_created_idx" ON "payment_intents" USING btree ("employer_id","created_at");--> statement-breakpoint
CREATE INDEX "payment_intents_seeker_created_idx" ON "payment_intents" USING btree ("seeker_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "photo_verifications_employer_seeker_photo_unique" ON "photo_verifications" USING btree ("employer_id","seeker_id","photo_index");--> statement-breakpoint
CREATE INDEX "photo_verifications_seeker_photo_idx" ON "photo_verifications" USING btree ("seeker_id","photo_index");--> statement-breakpoint
CREATE UNIQUE INDEX "profile_views_seeker_viewer_day_unique" ON "profile_views" USING btree ("seeker_id","viewer_id","day");--> statement-breakpoint
CREATE INDEX "profile_views_seeker_created_idx" ON "profile_views" USING btree ("seeker_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "site_briefings_job_unique" ON "site_briefings" USING btree ("job_id");