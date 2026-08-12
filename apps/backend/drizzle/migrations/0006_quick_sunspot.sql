CREATE TYPE "public"."whatsapp_direction" AS ENUM('outbound', 'inbound');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_status" AS ENUM('queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'undelivered', 'received');--> statement-breakpoint
CREATE TYPE "public"."work_proof_status" AS ENUM('submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "score_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"score" integer NOT NULL,
	"score_version" integer NOT NULL,
	"signature" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_test_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"test_id" varchar(80) NOT NULL,
	"score" integer NOT NULL,
	"passing_score" integer NOT NULL,
	"passed" boolean NOT NULL,
	"answers" integer[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sos_alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"triggered_by" uuid NOT NULL,
	"geo" geometry(point),
	"note" varchar(500),
	"trust_contacts_pushed" uuid[] DEFAULT '{}' NOT NULL,
	"trust_contacts_unmatched" text[] DEFAULT '{}' NOT NULL,
	"peers_pushed" uuid[] DEFAULT '{}' NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sid" varchar(64) NOT NULL,
	"direction" "whatsapp_direction" NOT NULL,
	"from" varchar(32) NOT NULL,
	"to" varchar(32) NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"media_urls" text[],
	"status" "whatsapp_status" NOT NULL,
	"content_sid" varchar(64),
	"content_variables" jsonb,
	"error_code" integer,
	"error_message" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"seeker_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"photo_url" text NOT NULL,
	"status" "work_proof_status" DEFAULT 'submitted' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"note" varchar(1000) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "score_credentials" ADD CONSTRAINT "score_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_test_attempts" ADD CONSTRAINT "skill_test_attempts_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sos_alerts" ADD CONSTRAINT "sos_alerts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_proofs" ADD CONSTRAINT "work_proofs_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_proofs" ADD CONSTRAINT "work_proofs_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_proofs" ADD CONSTRAINT "work_proofs_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_notes" ADD CONSTRAINT "worker_notes_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_notes" ADD CONSTRAINT "worker_notes_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "score_credentials_user_unique" ON "score_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "score_credentials_code_unique" ON "score_credentials" USING btree ("code");--> statement-breakpoint
CREATE INDEX "skill_test_attempts_seeker_test_created_idx" ON "skill_test_attempts" USING btree ("seeker_id","test_id","created_at");--> statement-breakpoint
CREATE INDEX "sos_alerts_geo_gist_idx" ON "sos_alerts" USING gist ("geo");--> statement-breakpoint
CREATE INDEX "sos_alerts_triggered_by_created_idx" ON "sos_alerts" USING btree ("triggered_by","created_at");--> statement-breakpoint
CREATE INDEX "sos_alerts_resolved_created_idx" ON "sos_alerts" USING btree ("resolved_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_messages_sid_unique" ON "whatsapp_messages" USING btree ("sid");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_direction_created_idx" ON "whatsapp_messages" USING btree ("direction","created_at");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_from_idx" ON "whatsapp_messages" USING btree ("from");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_to_idx" ON "whatsapp_messages" USING btree ("to");--> statement-breakpoint
CREATE INDEX "whatsapp_messages_user_id_idx" ON "whatsapp_messages" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_proofs_application_unique" ON "work_proofs" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "work_proofs_employer_id_idx" ON "work_proofs" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "work_proofs_status_idx" ON "work_proofs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "worker_notes_employer_worker_unique" ON "worker_notes" USING btree ("employer_id","worker_id");