CREATE TABLE "passport_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(120) NOT NULL,
	"score" integer NOT NULL,
	"member_since" timestamp with time zone NOT NULL,
	"skills" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"verified_skill_count" integer NOT NULL,
	"skill_tests" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"jobs_completed" integer NOT NULL,
	"ratings_avg" real,
	"ratings_count" integer DEFAULT 0 NOT NULL,
	"signature" text NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "passport_credentials" ADD CONSTRAINT "passport_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "passport_credentials_user_unique" ON "passport_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "passport_credentials_code_unique" ON "passport_credentials" USING btree ("code");