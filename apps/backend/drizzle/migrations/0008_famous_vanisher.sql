CREATE TYPE "public"."crew_member_source" AS ENUM('import', 'rehire', 'manual');--> statement-breakpoint
CREATE TABLE "crew_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"source" "crew_member_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_worker_id_users_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "crew_members_employer_worker_unique" ON "crew_members" USING btree ("employer_id","worker_id");--> statement-breakpoint
CREATE INDEX "crew_members_employer_created_idx" ON "crew_members" USING btree ("employer_id","created_at");