ALTER TABLE "conversations" ALTER COLUMN "job_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "application_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ratings" ALTER COLUMN "job_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "quick_work_request_id" uuid;--> statement-breakpoint
ALTER TABLE "ratings" ADD COLUMN "quick_work_request_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD COLUMN "quick_work_request_id" uuid;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_quick_work_request_id_quick_work_requests_id_fk" FOREIGN KEY ("quick_work_request_id") REFERENCES "public"."quick_work_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_quick_work_request_id_quick_work_requests_id_fk" FOREIGN KEY ("quick_work_request_id") REFERENCES "public"."quick_work_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_quick_work_request_id_quick_work_requests_id_fk" FOREIGN KEY ("quick_work_request_id") REFERENCES "public"."quick_work_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_pair_quick_work_unique" ON "conversations" USING btree ("employer_id","seeker_id","quick_work_request_id");--> statement-breakpoint
CREATE INDEX "conversations_quick_work_request_id_idx" ON "conversations" USING btree ("quick_work_request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_reviewer_quick_work_unique" ON "ratings" USING btree ("reviewer_id","quick_work_request_id");--> statement-breakpoint
CREATE INDEX "ratings_quick_work_request_id_idx" ON "ratings" USING btree ("quick_work_request_id");--> statement-breakpoint
CREATE INDEX "payment_intents_quick_work_request_id_idx" ON "payment_intents" USING btree ("quick_work_request_id");--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_exactly_one_context_check" CHECK (("conversations"."job_id" IS NOT NULL AND "conversations"."quick_work_request_id" IS NULL)
        OR ("conversations"."job_id" IS NULL AND "conversations"."quick_work_request_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_exactly_one_context_check" CHECK (("ratings"."application_id" IS NOT NULL AND "ratings"."job_id" IS NOT NULL AND "ratings"."quick_work_request_id" IS NULL)
        OR ("ratings"."application_id" IS NULL AND "ratings"."job_id" IS NULL AND "ratings"."quick_work_request_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_exactly_one_context_check" CHECK (("payment_intents"."application_id" IS NOT NULL)::int + ("payment_intents"."quick_work_request_id" IS NOT NULL)::int = 1);