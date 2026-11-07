CREATE TABLE "onboarding_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_id" uuid NOT NULL,
	"day" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "work_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"completed_at" timestamp with time zone,
	"assignee_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_milestones" ADD COLUMN "evidence_note" text;--> statement-breakpoint
ALTER TABLE "daily_milestones" ADD COLUMN "mentor_note" text;--> statement-breakpoint
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_period_id_monitoring_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."monitoring_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_tasks" ADD CONSTRAINT "onboarding_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_period_day_assignee_uq" ON "onboarding_tasks" USING btree ("period_id","day","assignee_id");--> statement-breakpoint
CREATE INDEX "onboarding_assignee_idx" ON "onboarding_tasks" USING btree ("assignee_id","status");