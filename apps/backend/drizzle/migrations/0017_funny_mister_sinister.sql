CREATE TYPE "public"."quick_work_cancelled_by" AS ENUM('employer', 'worker', 'system');--> statement-breakpoint
CREATE TYPE "public"."quick_work_offer_status" AS ENUM('offered', 'accepted', 'declined', 'expired', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."quick_work_status" AS ENUM('draft', 'posted', 'matching', 'offered', 'accepted', 'arriving', 'arrived', 'in_progress', 'completed', 'payment_pending', 'paid', 'rated', 'cancelled', 'expired', 'no_worker_found', 'disputed');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_offer_received';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_offer_expiring';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_offer_closed';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_matched';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_worker_arriving';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_worker_arrived';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_started';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_completed';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_price_approved';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_payment_pending';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_paid';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_cancelled';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_customer_cancelled';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_expired';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_no_worker_found';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'quick_work_disputed';--> statement-breakpoint
CREATE TABLE "quick_work_offers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"status" "quick_work_offer_status" DEFAULT 'offered' NOT NULL,
	"distance_meters" integer,
	"eta_minutes" integer,
	"rank_score" numeric,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quick_work_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"category_id" uuid,
	"service_id" uuid,
	"title" varchar(120),
	"description" varchar(2000),
	"photos" text[] DEFAULT '{}' NOT NULL,
	"videos" text[] DEFAULT '{}' NOT NULL,
	"voice_note_url" text,
	"geo" geometry(point),
	"address" varchar(240),
	"city" varchar(80),
	"is_immediate" boolean DEFAULT true NOT NULL,
	"scheduled_at" timestamp with time zone,
	"budget_min" integer,
	"budget_max" integer,
	"estimated_price" integer,
	"final_price" integer,
	"status" "quick_work_status" DEFAULT 'draft' NOT NULL,
	"matched_worker_id" uuid,
	"completion_photo_url" text,
	"completion_notes" varchar(1000),
	"cancelled_by" "quick_work_cancelled_by",
	"cancellation_reason" varchar(500),
	"dispute_reason" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"posted_at" timestamp with time zone,
	"matching_started_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"arriving_at" timestamp with time zone,
	"arriving_eta_minutes" integer,
	"arrived_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"rated_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quick_work_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"from_status" varchar(30),
	"to_status" varchar(30) NOT NULL,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quick_work_offers" ADD CONSTRAINT "quick_work_offers_request_id_quick_work_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."quick_work_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_work_offers" ADD CONSTRAINT "quick_work_offers_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_work_requests" ADD CONSTRAINT "quick_work_requests_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_work_requests" ADD CONSTRAINT "quick_work_requests_category_id_service_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."service_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_work_requests" ADD CONSTRAINT "quick_work_requests_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_work_requests" ADD CONSTRAINT "quick_work_requests_matched_worker_id_users_id_fk" FOREIGN KEY ("matched_worker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_work_status_history" ADD CONSTRAINT "quick_work_status_history_request_id_quick_work_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."quick_work_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quick_work_status_history" ADD CONSTRAINT "quick_work_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quick_work_offers_request_id_idx" ON "quick_work_offers" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "quick_work_offers_worker_id_status_idx" ON "quick_work_offers" USING btree ("worker_id","status");--> statement-breakpoint
CREATE INDEX "quick_work_offers_expires_at_idx" ON "quick_work_offers" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "quick_work_requests_geo_gist_idx" ON "quick_work_requests" USING gist ("geo");--> statement-breakpoint
CREATE INDEX "quick_work_requests_employer_id_idx" ON "quick_work_requests" USING btree ("employer_id");--> statement-breakpoint
CREATE INDEX "quick_work_requests_matched_worker_id_idx" ON "quick_work_requests" USING btree ("matched_worker_id");--> statement-breakpoint
CREATE INDEX "quick_work_requests_status_idx" ON "quick_work_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "quick_work_requests_service_id_idx" ON "quick_work_requests" USING btree ("service_id");--> statement-breakpoint
CREATE INDEX "quick_work_requests_scheduled_at_idx" ON "quick_work_requests" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "quick_work_status_history_request_id_idx" ON "quick_work_status_history" USING btree ("request_id");