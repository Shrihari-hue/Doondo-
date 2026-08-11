CREATE TYPE "public"."budget_period" AS ENUM('week', 'month');--> statement-breakpoint
CREATE TYPE "public"."reel_status" AS ENUM('active', 'hidden');--> statement-breakpoint
CREATE TABLE "employer_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employer_id" uuid NOT NULL,
	"period" "budget_period" DEFAULT 'month' NOT NULL,
	"amount_paise" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seeker_id" uuid NOT NULL,
	"video_url" varchar(2000) NOT NULL,
	"thumbnail_url" varchar(2000),
	"duration_seconds" integer NOT NULL,
	"caption" varchar(140),
	"status" "reel_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employer_budgets" ADD CONSTRAINT "employer_budgets_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reels" ADD CONSTRAINT "reels_seeker_id_users_id_fk" FOREIGN KEY ("seeker_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "employer_budgets_employer_unique" ON "employer_budgets" USING btree ("employer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reels_seeker_unique" ON "reels" USING btree ("seeker_id");--> statement-breakpoint
CREATE INDEX "reels_status_created_idx" ON "reels" USING btree ("status","created_at");