CREATE TYPE "public"."cohort_member_status" AS ENUM('invited', 'joined', 'declined');--> statement-breakpoint
CREATE TYPE "public"."wage_flag_reason" AS ENUM('below_promised_wage', 'late_payment', 'unpaid_overtime', 'wage_theft', 'other');--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'cohort_invite';--> statement-breakpoint
ALTER TYPE "public"."notification_kind" ADD VALUE 'cohort_message';--> statement-breakpoint
CREATE TABLE "cohort_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "cohort_member_status" DEFAULT 'invited' NOT NULL,
	"invited_by" uuid,
	"last_read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohort_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"kind" "message_kind" DEFAULT 'text' NOT NULL,
	"body" varchar(4000) DEFAULT '' NOT NULL,
	"attachment" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" varchar(80) NOT NULL,
	"name" varchar(80) NOT NULL,
	"creator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wage_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_id" uuid NOT NULL,
	"employer_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"reason" "wage_flag_reason" NOT NULL,
	"promised_wage_amount" integer,
	"actual_wage_amount" integer,
	"wage_period" "pay_period",
	"note" varchar(500) DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_messages" ADD CONSTRAINT "cohort_messages_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_messages" ADD CONSTRAINT "cohort_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_flags" ADD CONSTRAINT "wage_flags_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_flags" ADD CONSTRAINT "wage_flags_employer_id_users_id_fk" FOREIGN KEY ("employer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wage_flags" ADD CONSTRAINT "wage_flags_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cohort_members_cohort_user_unique" ON "cohort_members" USING btree ("cohort_id","user_id");--> statement-breakpoint
CREATE INDEX "cohort_members_user_idx" ON "cohort_members" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "cohort_messages_cohort_created_idx" ON "cohort_messages" USING btree ("cohort_id","created_at");--> statement-breakpoint
CREATE INDEX "cohorts_course_idx" ON "cohorts" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "wage_flags_reporter_job_unique" ON "wage_flags" USING btree ("reporter_id","job_id");--> statement-breakpoint
CREATE INDEX "wage_flags_employer_created_idx" ON "wage_flags" USING btree ("employer_id","created_at");