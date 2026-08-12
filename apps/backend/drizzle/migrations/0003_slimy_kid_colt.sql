CREATE TYPE "public"."home_safe_status" AS ENUM('pending', 'safe');--> statement-breakpoint
CREATE TYPE "public"."message_kind" AS ENUM('text', 'image', 'voice', 'video', 'system');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('application_status', 'application_received', 'interview_scheduled', 'interview_rescheduled', 'interview_cancelled', 'interview_reminder', 'new_message', 'rating_received', 'verification_status', 'job_alert_match', 'morning_digest', 'application_ghosted', 'skill_gap', 'doondo_score_changed', 'sos_alert', 'shift_checkin', 'shift_confirmation', 'offer_made', 'offer_resolved', 'offer_expired', 'offer_countered', 'worker_on_the_way', 'crew_shift', 'shift_backfilled', 'streak_milestone', 'referral_bonus', 'hired_nearby', 'reengagement', 'hire_celebration', 'hiring_request', 'hiring_request_responded', 'employer_interest', 'dispute_raised', 'dispute_update', 'job_escalated', 'reached_home_safe', 'profile_viewed', 'system');--> statement-breakpoint
CREATE TYPE "public"."referral_status" AS ENUM('pending', 'hired', 'reverted');--> statement-breakpoint
CREATE TYPE "public"."translation_status" AS ENUM('none', 'pending', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."wallet_kind" AS ENUM('hire_payment', 'adjustment', 'cash_log', 'qr_collection', 'payout');--> statement-breakpoint
CREATE TYPE "public"."wallet_status" AS ENUM('pending', 'settled', 'reversed');--> statement-breakpoint
CREATE TABLE "blocked_workers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"last_message_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_message_preview" varchar(200),
	"last_sender_id" uuid,
	"unread_employer" integer DEFAULT 0 NOT NULL,
	"unread_seeker" integer DEFAULT 0 NOT NULL,
	"translation_lang_seeker" varchar(5),
	"translation_lang_employer" varchar(5),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employer_response_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"quiet_hours_enabled" boolean DEFAULT false NOT NULL,
	"quiet_start_hour" integer DEFAULT 21 NOT NULL,
	"quiet_end_hour" integer DEFAULT 7 NOT NULL,
	"auto_reply" varchar(1000) DEFAULT '' NOT NULL,
	"sms_applicant_alerts" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "home_safe_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"status" "home_safe_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"body" varchar(4000) DEFAULT '' NOT NULL,
	"attachment" jsonb,
	"template_key" varchar(80),
	"transcript" varchar(4000),
	"translation" jsonb,
	"translation_status" "translation_status" DEFAULT 'none' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"title" varchar(160) NOT NULL,
	"body" varchar(1000) NOT NULL,
	"deeplink" jsonb,
	"image_url" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "referrals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"referrer_id" uuid NOT NULL,
	"referee_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"application_id" uuid,
	"status" "referral_status" DEFAULT 'pending' NOT NULL,
	"bonus_paise" integer,
	"hired_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tailored_resumes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"summary" text NOT NULL,
	"pitch" text NOT NULL,
	"highlighted_skills" text[] DEFAULT '{}' NOT NULL,
	"matched_skills" text[] DEFAULT '{}' NOT NULL,
	"work_blurbs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"provider" varchar(32) DEFAULT 'mock' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"kind" "wallet_kind" NOT NULL,
	"status" "wallet_status" DEFAULT 'pending' NOT NULL,
	"description" varchar(240) NOT NULL,
	"job_id" uuid,
	"application_id" uuid,
	"settled_at" timestamp with time zone,
	"gross_paise" integer,
	"fee_paise" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blocked_workers" ADD CONSTRAINT "blocked_workers_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocked_workers" ADD CONSTRAINT "blocked_workers_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_last_sender_id_users_id_fk" FOREIGN KEY ("last_sender_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employer_response_settings" ADD CONSTRAINT "employer_response_settings_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_safe_checks" ADD CONSTRAINT "home_safe_checks_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_safe_checks" ADD CONSTRAINT "home_safe_checks_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_safe_checks" ADD CONSTRAINT "home_safe_checks_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "home_safe_checks" ADD CONSTRAINT "home_safe_checks_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_users_id_fk" FOREIGN KEY ("referrer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_users_id_fk" FOREIGN KEY ("referee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_resumes" ADD CONSTRAINT "tailored_resumes_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tailored_resumes" ADD CONSTRAINT "tailored_resumes_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "blocked_workers_pair_unique" ON "blocked_workers" USING btree ("employer_id","worker_id");--> statement-breakpoint
CREATE INDEX "blocked_workers_employer_idx" ON "blocked_workers" USING btree ("employer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_pair_job_unique" ON "conversations" USING btree ("employer_id","seeker_id","job_id");--> statement-breakpoint
CREATE INDEX "conversations_employer_last_message_idx" ON "conversations" USING btree ("employer_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_seeker_last_message_idx" ON "conversations" USING btree ("seeker_id","last_message_at");--> statement-breakpoint
CREATE INDEX "conversations_job_id_idx" ON "conversations" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employer_response_settings_employer_unique" ON "employer_response_settings" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "home_safe_checks_seeker_status_started_idx" ON "home_safe_checks" USING btree ("seeker_id","status","started_at");--> statement-breakpoint
CREATE INDEX "home_safe_checks_application_id_idx" ON "home_safe_checks" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "home_safe_checks_job_id_idx" ON "home_safe_checks" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "home_safe_checks_employer_id_idx" ON "home_safe_checks" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "messages_conversation_created_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_sender_id_idx" ON "messages" USING btree ("sender_id");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_idx" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_idx" ON "notifications" USING btree ("recipient_id","read_at");--> statement-breakpoint
CREATE UNIQUE INDEX "referrals_pair_job_unique" ON "referrals" USING btree ("referrer_id","referee_id","job_id");--> statement-breakpoint
CREATE INDEX "referrals_referrer_created_idx" ON "referrals" USING btree ("referrer_id","created_at");--> statement-breakpoint
CREATE INDEX "referrals_referee_job_status_idx" ON "referrals" USING btree ("referee_id","job_id","status");--> statement-breakpoint
CREATE INDEX "referrals_application_id_idx" ON "referrals" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tailored_resumes_seeker_job_unique" ON "tailored_resumes" USING btree ("seeker_id","job_id");--> statement-breakpoint
CREATE INDEX "tailored_resumes_job_id_idx" ON "tailored_resumes" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_user_created_idx" ON "wallet_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "wallet_transactions_job_id_idx" ON "wallet_transactions" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_application_id_idx" ON "wallet_transactions" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wallet_hire_payment_unique" ON "wallet_transactions" USING btree ("user_id","application_id","kind");