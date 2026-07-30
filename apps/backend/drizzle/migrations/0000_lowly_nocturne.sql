CREATE TYPE "public"."business_type" AS ENUM('individual', 'shop', 'restaurant', 'salon', 'agency', 'startup', 'enterprise', 'other');--> statement-breakpoint
CREATE TYPE "public"."preferred_job_type" AS ENUM('full_time', 'part_time', 'gig', 'shift', 'contract');--> statement-breakpoint
CREATE TYPE "public"."salary_period" AS ENUM('hour', 'day', 'week', 'month', 'fixed');--> statement-breakpoint
CREATE TYPE "public"."user_availability" AS ENUM('immediate', 'within_1_week', 'within_1_month', 'flexible');--> statement-breakpoint
CREATE TYPE "public"."user_locale" AS ENUM('en', 'hi', 'ta', 'te', 'kn');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('seeker', 'employer', 'admin');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('unverified', 'pending', 'verified', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."work_type" AS ENUM('solo', 'team');--> statement-breakpoint
CREATE TABLE "user_links" (
	"user_id" uuid NOT NULL,
	"linked_user_id" uuid NOT NULL,
	CONSTRAINT "user_links_user_id_linked_user_id_pk" PRIMARY KEY("user_id","linked_user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"name" varchar(120) NOT NULL,
	"phone" varchar(30),
	"phone_hash" varchar(64),
	"locale" "user_locale" DEFAULT 'en' NOT NULL,
	"upi_vpa" varchar(80),
	"payout_bank" jsonb,
	"notification_prefs" jsonb DEFAULT '{"jobs":true,"applications":true,"messages":true,"ratings":true,"referrals":true}'::jsonb NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verification_status" "verification_status" DEFAULT 'unverified' NOT NULL,
	"phone_verified_at" timestamp with time zone,
	"selfie_photo_url" text,
	"verified_at" timestamp with time zone,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_login_at" timestamp with time zone,
	"password_reset_token_hash" varchar(64),
	"skills" text[] DEFAULT '{}' NOT NULL,
	"bio" varchar(500),
	"experience_years" integer,
	"availability" "user_availability",
	"preferred_job_types" "preferred_job_type"[] DEFAULT '{}' NOT NULL,
	"work_type" "work_type",
	"team_size" integer,
	"expected_salary" jsonb,
	"location" jsonb,
	"photo_url" text,
	"resume_url" text,
	"resume_filename" varchar(200),
	"resume_mime_type" varchar(80),
	"resume_size_bytes" integer,
	"resume_uploaded_at" timestamp with time zone,
	"work_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"education" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"skill_documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"saved_job_ids" uuid[] DEFAULT '{}' NOT NULL,
	"expo_push_tokens" text[] DEFAULT '{}' NOT NULL,
	"last_digest_sent_at" timestamp with time zone,
	"last_reengaged_at" timestamp with time zone,
	"reengagement_attempts" integer DEFAULT 0 NOT NULL,
	"streaks" jsonb DEFAULT '{"apply":{"current":0,"longest":0,"totalDays":0,"lastDate":null},"course":{"current":0,"longest":0,"totalDays":0,"lastDate":null},"shift":{"current":0,"longest":0,"totalDays":0,"lastDate":null}}'::jsonb NOT NULL,
	"trust_circle" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_peer_responder" boolean DEFAULT false NOT NULL,
	"share_shifts_with_circle" boolean DEFAULT false NOT NULL,
	"constitution" jsonb DEFAULT '{"maxDistanceKm":null,"noNightShifts":false,"noSundays":false,"requiresPpe":false,"requiresContract":false}'::jsonb NOT NULL,
	"company_name" varchar(120),
	"business_type" "business_type",
	"gstin" varchar(15),
	"employer_location" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"url" text NOT NULL,
	"skill" varchar(40) NOT NULL,
	"caption" varchar(120),
	"is_cover" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "otp_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"phone" varchar(30) NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"family_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"replaced_by" uuid,
	"ip" varchar(64),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "user_links" ADD CONSTRAINT "user_links_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_links" ADD CONSTRAINT "user_links_linked_user_id_users_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_photos" ADD CONSTRAINT "work_photos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_role_idx" ON "users" USING btree ("email","role");--> statement-breakpoint
CREATE INDEX "users_phone_hash_idx" ON "users" USING btree ("phone_hash");--> statement-breakpoint
CREATE INDEX "users_active_role_last_login_idx" ON "users" USING btree ("is_active","role","last_login_at");--> statement-breakpoint
CREATE INDEX "users_is_peer_responder_idx" ON "users" USING btree ("is_peer_responder");--> statement-breakpoint
CREATE INDEX "work_photos_user_id_idx" ON "work_photos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "otp_challenges_user_phone_consumed_idx" ON "otp_challenges" USING btree ("user_id","phone","consumed");--> statement-breakpoint
CREATE INDEX "otp_challenges_expires_at_idx" ON "otp_challenges" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens" USING btree ("family_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens" USING btree ("expires_at");