CREATE TABLE "worker_service_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"worker_id" uuid NOT NULL,
	"service_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "worker_service_profiles" ADD CONSTRAINT "worker_service_profiles_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_service_profiles" ADD CONSTRAINT "worker_service_profiles_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "worker_service_profiles_worker_service_unique" ON "worker_service_profiles" USING btree ("worker_id","service_id");--> statement-breakpoint
CREATE INDEX "worker_service_profiles_worker_id_idx" ON "worker_service_profiles" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "worker_service_profiles_service_id_idx" ON "worker_service_profiles" USING btree ("service_id");--> statement-breakpoint
ALTER TABLE "availabilities" DROP COLUMN "service_ids";