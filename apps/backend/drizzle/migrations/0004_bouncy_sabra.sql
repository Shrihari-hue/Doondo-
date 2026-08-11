CREATE TYPE "public"."rating_role" AS ENUM('employer', 'seeker');--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"reviewee_id" uuid NOT NULL,
	"application_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"role" "rating_role" NOT NULL,
	"score" integer NOT NULL,
	"comment" varchar(500),
	"tags" text[] DEFAULT '{}' NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ratings_score_check" CHECK ("ratings"."score" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_reviewee_id_users_id_fk" FOREIGN KEY ("reviewee_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_reviewer_application_unique" ON "ratings" USING btree ("reviewer_id","application_id");--> statement-breakpoint
CREATE INDEX "ratings_reviewee_created_idx" ON "ratings" USING btree ("reviewee_id","created_at");--> statement-breakpoint
CREATE INDEX "ratings_reviewee_role_idx" ON "ratings" USING btree ("reviewee_id","role");--> statement-breakpoint
CREATE INDEX "ratings_application_id_idx" ON "ratings" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "ratings_job_id_idx" ON "ratings" USING btree ("job_id");