CREATE TABLE "project_cost_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"category" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(18, 4) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(19, 2) NOT NULL,
	"actual_amount" numeric(19, 2),
	"position" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_cost_items_quantity_positive" CHECK ("project_cost_items"."quantity" > 0),
	CONSTRAINT "project_cost_items_category" CHECK ("project_cost_items"."category" in ('FRAME_PANEL_MATERIAL', 'FINISHING', 'ELECTRICAL', 'PRINTING_BRANDING', 'SUPPORTING_MATERIAL', 'LABOR', 'OPERATIONS', 'SHIPPING')),
	CONSTRAINT "project_cost_items_amounts_nonnegative" CHECK ("project_cost_items"."unit_price" >= 0 and ("project_cost_items"."actual_amount" is null or "project_cost_items"."actual_amount" >= 0)),
	CONSTRAINT "project_cost_items_position_nonnegative" CHECK ("project_cost_items"."position" >= 0),
	CONSTRAINT "project_cost_items_version_positive" CHECK ("project_cost_items"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_document_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_number" smallint NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'MISSING' NOT NULL,
	"attachment_id" uuid,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_document_phase_bounds" CHECK ("project_document_requirements"."phase_number" between 1 and 6),
	CONSTRAINT "project_document_status" CHECK ("project_document_requirements"."status" in ('MISSING', 'UPLOADED', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'WAIVED', 'LEGACY_CONFIRMED')),
	CONSTRAINT "project_document_version_positive" CHECK ("project_document_requirements"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_phase_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_number" smallint NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"decision_owner_role" text NOT NULL,
	"status" text DEFAULT 'WAITING' NOT NULL,
	"passed_at" timestamp with time zone,
	"passed_by" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_phase_number_bounds" CHECK ("project_phase_instances"."phase_number" between 1 and 6),
	CONSTRAINT "project_phase_status" CHECK ("project_phase_instances"."status" in ('WAITING', 'ACTIVE', 'READY', 'APPROVAL_PENDING', 'PASSED', 'REOPENED')),
	CONSTRAINT "project_phase_version_positive" CHECK ("project_phase_instances"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_stage_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"phase_number" smallint NOT NULL,
	"stage_number" smallint NOT NULL,
	"title" text NOT NULL,
	"default_role" text NOT NULL,
	"assignee_id" uuid,
	"planned_start" date,
	"planned_end" date,
	"actual_start" date,
	"actual_end" date,
	"status" "work_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_stage_number_bounds" CHECK ("project_stage_instances"."stage_number" between 1 and 16 and "project_stage_instances"."phase_number" between 1 and 6),
	CONSTRAINT "project_stage_progress_bounds" CHECK ("project_stage_instances"."progress" between 0 and 100),
	CONSTRAINT "project_stage_planned_dates" CHECK ("project_stage_instances"."planned_end" is null or "project_stage_instances"."planned_start" is null or "project_stage_instances"."planned_end" >= "project_stage_instances"."planned_start"),
	CONSTRAINT "project_stage_actual_dates" CHECK ("project_stage_instances"."actual_end" is null or "project_stage_instances"."actual_start" is null or "project_stage_instances"."actual_end" >= "project_stage_instances"."actual_start"),
	CONSTRAINT "project_stage_completed_has_end" CHECK ("project_stage_instances"."status" <> 'COMPLETED' or "project_stage_instances"."actual_end" is not null),
	CONSTRAINT "project_stage_version_positive" CHECK ("project_stage_instances"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_workspaces" (
	"project_id" uuid PRIMARY KEY NOT NULL,
	"client_name" text,
	"location" text,
	"deal_date" date,
	"contract_value" numeric(19, 2) DEFAULT '0' NOT NULL,
	"currency" char(3) DEFAULT 'IDR' NOT NULL,
	"target_margin_pct" numeric(7, 4) DEFAULT '25' NOT NULL,
	"retention_pct" numeric(7, 4) DEFAULT '5' NOT NULL,
	"overhead_pct" numeric(7, 4) DEFAULT '0' NOT NULL,
	"contingency_pct" numeric(7, 4) DEFAULT '0' NOT NULL,
	"vat_enabled" boolean DEFAULT false NOT NULL,
	"vat_pct" numeric(7, 4) DEFAULT '11' NOT NULL,
	"withholding_enabled" boolean DEFAULT false NOT NULL,
	"withholding_pct" numeric(7, 4) DEFAULT '2' NOT NULL,
	"commercial_status" text DEFAULT 'DRAFT' NOT NULL,
	"current_phase" smallint DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_workspaces_contract_nonnegative" CHECK ("project_workspaces"."contract_value" >= 0),
	CONSTRAINT "project_workspaces_currency" CHECK ("project_workspaces"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "project_workspaces_percentage_bounds" CHECK ("project_workspaces"."target_margin_pct" between 0 and 100 and "project_workspaces"."retention_pct" between 0 and 100 and "project_workspaces"."overhead_pct" between 0 and 100 and "project_workspaces"."contingency_pct" between 0 and 100 and "project_workspaces"."vat_pct" between 0 and 100 and "project_workspaces"."withholding_pct" between 0 and 100),
	CONSTRAINT "project_workspaces_margin_retention_limit" CHECK ("project_workspaces"."target_margin_pct" + "project_workspaces"."retention_pct" < 100),
	CONSTRAINT "project_workspaces_commercial_status" CHECK ("project_workspaces"."commercial_status" in ('DRAFT', 'SUBMITTED', 'APPROVED', 'LOCKED')),
	CONSTRAINT "project_workspaces_current_phase" CHECK ("project_workspaces"."current_phase" between 1 and 6),
	CONSTRAINT "project_workspaces_version_positive" CHECK ("project_workspaces"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "project_cost_items" ADD CONSTRAINT "project_cost_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_document_requirements" ADD CONSTRAINT "project_document_requirements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_document_requirements" ADD CONSTRAINT "project_document_requirements_attachment_id_evidence_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."evidence"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_document_requirements" ADD CONSTRAINT "project_document_requirements_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phase_instances" ADD CONSTRAINT "project_phase_instances_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phase_instances" ADD CONSTRAINT "project_phase_instances_passed_by_users_id_fk" FOREIGN KEY ("passed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage_instances" ADD CONSTRAINT "project_stage_instances_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_stage_instances" ADD CONSTRAINT "project_stage_instances_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_workspaces" ADD CONSTRAINT "project_workspaces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_cost_items_project_idx" ON "project_cost_items" USING btree ("project_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "project_document_code_uq" ON "project_document_requirements" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "project_document_phase_idx" ON "project_document_requirements" USING btree ("project_id","phase_number");--> statement-breakpoint
CREATE UNIQUE INDEX "project_phase_number_uq" ON "project_phase_instances" USING btree ("project_id","phase_number");--> statement-breakpoint
CREATE UNIQUE INDEX "project_phase_code_uq" ON "project_phase_instances" USING btree ("project_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "project_stage_number_uq" ON "project_stage_instances" USING btree ("project_id","stage_number");--> statement-breakpoint
CREATE INDEX "project_stage_assignee_idx" ON "project_stage_instances" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "project_assignment_active_role_user_uq" ON "project_assignments" USING btree ("project_id","role","user_id") WHERE "project_assignments"."active" = true;--> statement-breakpoint
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignment_role" CHECK ("project_assignments"."role" in ('PIC', 'PIC_ASSISTANT', 'DESIGNER', 'PROJECT_LEADER', 'PRODUCTION_TEAM', 'FINANCE_ADMIN', 'INSTALLATION_SUPPORT'));