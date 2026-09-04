ALTER TYPE "public"."wallet_kind" ADD VALUE 'quick_work_payment';--> statement-breakpoint
ALTER TABLE "payment_intents" DROP CONSTRAINT "payment_intents_exactly_one_context_check";--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD COLUMN "quick_work_request_id" uuid;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_quick_work_request_id_quick_work_requests_id_fk" FOREIGN KEY ("quick_work_request_id") REFERENCES "public"."quick_work_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wallet_transactions_quick_work_request_id_idx" ON "wallet_transactions" USING btree ("quick_work_request_id");--> statement-breakpoint
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_not_both_contexts_check" CHECK (NOT ("payment_intents"."application_id" IS NOT NULL AND "payment_intents"."quick_work_request_id" IS NOT NULL));